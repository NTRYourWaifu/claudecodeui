import express from 'express';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { access, copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import mime from 'mime-types';

import type { Request, Response } from 'express';
import type { MulterFile } from 'multer';

const router = express.Router();

/**
 * Machine-wide file browsing.
 *
 * The project-scoped endpoints in `server/index.js` deliberately refuse any path
 * outside the selected project root, and `/api/browse-filesystem` refuses any path
 * outside `WORKSPACES_ROOT`. This module is the escape hatch the "whole computer"
 * file-tree scope needs: callers address files by absolute path, and the only
 * restrictions are on *mutations* of system-critical directories.
 *
 * Every route here is mounted behind `authenticateToken`.
 */

// Directories that must never be written to, renamed, or deleted through the UI.
// Reading them is allowed - the point of this scope is to be able to look anywhere.
const WRITE_PROTECTED_PATHS = [
  // Windows
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'C:\\System Volume Information',
  'C:\\$Recycle.Bin',
  // Unix
  '/etc',
  '/bin',
  '/sbin',
  '/usr',
  '/dev',
  '/proc',
  '/sys',
  '/boot',
  '/lib',
  '/lib64',
];

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/;
const RESERVED_FILENAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

type ValidationResult = { valid: true; resolved: string } | { valid: false; error: string };

function readQueryStringValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return '';
}

/**
 * Normalizes an absolute path for comparison. Windows drive letters are uppercased
 * to match what Node reports from `process.cwd()`, so `f:\x` and `F:\x` compare equal.
 */
function normalizeAbsolutePath(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  return process.platform === 'win32'
    ? resolved.replace(/^([a-z]):/, (_match, letter: string) => `${letter.toUpperCase()}:`)
    : resolved;
}

/**
 * Accepts any absolute path on this machine.
 *
 * Read access is intentionally unrestricted - a user who can authenticate already
 * has the same reach through the chat terminal.
 */
function validateReadablePath(rawPath: string): ValidationResult {
  const trimmed = (rawPath ?? '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Path is required' };
  }

  if (!path.isAbsolute(trimmed)) {
    return { valid: false, error: 'Path must be absolute' };
  }

  return { valid: true, resolved: normalizeAbsolutePath(trimmed) };
}

/**
 * Additionally refuses mutations of filesystem roots and system directories,
 * so a stray tap on a phone cannot delete a Windows install.
 */
function validateWritablePath(rawPath: string): ValidationResult {
  const readable = validateReadablePath(rawPath);
  if (!readable.valid) {
    return readable;
  }

  const resolved = readable.resolved;

  if (resolved === path.parse(resolved).root) {
    return { valid: false, error: 'Cannot modify a drive root' };
  }

  for (const protectedPath of WRITE_PROTECTED_PATHS) {
    const normalizedProtected = normalizeAbsolutePath(protectedPath);
    if (resolved === normalizedProtected || resolved.startsWith(`${normalizedProtected}${path.sep}`)) {
      return { valid: false, error: `Cannot modify system directory: ${protectedPath}` };
    }
  }

  return { valid: true, resolved };
}

function validateFilename(name: string): { valid: boolean; error?: string } {
  if (!name || !name.trim()) {
    return { valid: false, error: 'Filename cannot be empty' };
  }
  if (INVALID_FILENAME_CHARS.test(name)) {
    return { valid: false, error: 'Filename contains invalid characters' };
  }
  if (RESERVED_FILENAMES.test(name)) {
    return { valid: false, error: 'Filename is a reserved name' };
  }
  if (/^\.+$/.test(name)) {
    return { valid: false, error: 'Filename cannot be only dots' };
  }
  return { valid: true };
}

function permToRwx(perm: number): string {
  return (perm & 4 ? 'r' : '-') + (perm & 2 ? 'w' : '-') + (perm & 1 ? 'x' : '-');
}

type DirectoryEntry = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string | null;
  permissions?: string;
  permissionsRwx?: string;
  children?: DirectoryEntry[];
};

/**
 * Lists one directory level.
 *
 * Machine-wide browsing must stay shallow: a recursive walk from a drive root would
 * never finish, so directories come back with `children: []` and the client fetches
 * each level as it is expanded.
 */
async function listDirectory(dirPath: string, showHidden: boolean): Promise<DirectoryEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const items: DirectoryEntry[] = [];

  for (const entry of entries) {
    if (!showHidden && entry.name.startsWith('.')) {
      continue;
    }

    const itemPath = path.join(dirPath, entry.name);
    const item: DirectoryEntry = {
      name: entry.name,
      path: itemPath,
      type: entry.isDirectory() ? 'directory' : 'file',
    };

    try {
      // lstat rather than stat: symlinks pointing at dead or remote targets would
      // otherwise stall the whole listing.
      const stats = await lstat(itemPath);
      item.size = stats.size;
      item.modified = stats.mtime.toISOString();
      const mode = stats.mode;
      item.permissions = `${(mode >> 6) & 7}${(mode >> 3) & 7}${mode & 7}`;
      item.permissionsRwx = permToRwx((mode >> 6) & 7) + permToRwx((mode >> 3) & 7) + permToRwx(mode & 7);
    } catch {
      item.size = 0;
      item.modified = null;
      item.permissions = '000';
      item.permissionsRwx = '---------';
    }

    if (item.type === 'directory') {
      // An empty array marks "not loaded yet" for the lazy client-side tree.
      item.children = [];
    }

    items.push(item);
  }

  return items.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'directory' ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}

/**
 * Finds the drives present on this machine.
 *
 * Windows has no single filesystem root to walk, so drive letters are probed
 * directly; other platforms have exactly one root.
 */
async function listDrives(): Promise<DirectoryEntry[]> {
  if (process.platform !== 'win32') {
    return [{ name: '/', path: '/', type: 'directory', children: [] }];
  }

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const probes = await Promise.all(
    letters.map(async (letter): Promise<DirectoryEntry | null> => {
      const drivePath = `${letter}:\\`;
      try {
        await access(drivePath);
        return { name: `${letter}:`, path: drivePath, type: 'directory', children: [] };
      } catch {
        return null;
      }
    }),
  );

  return probes.filter((entry): entry is DirectoryEntry => entry !== null);
}

// Explorer's Quick Access folder, addressed by its shell GUID.
const QUICK_ACCESS_SHELL_ID = 'shell:::{679f85cb-0220-4080-b29b-5540cc05aab6}';

// Reading Quick Access costs a PowerShell start (~400ms), which is too slow to pay on
// every switch into machine scope but far too short-lived to cache for long.
const QUICK_ACCESS_CACHE_MS = 60_000;
let quickAccessCache: { entries: { name: string; path: string }[]; readAt: number } | null = null;

/**
 * Reads the folders the user actually pinned in File Explorer.
 *
 * There is no registry key holding this list in readable form - the pinned entries live
 * in a binary jump list - so the supported route is Explorer's own shell namespace via
 * COM, which means shelling out to PowerShell.
 */
async function readExplorerQuickAccess(): Promise<{ name: string; path: string }[] | null> {
  if (process.platform !== 'win32') {
    return null;
  }

  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$shell = New-Object -ComObject Shell.Application',
    `$folder = $shell.Namespace("${QUICK_ACCESS_SHELL_ID}")`,
    '$items = @()',
    'if ($folder) { $items = @($folder.Items() | ForEach-Object { [pscustomobject]@{ name = $_.Name; path = $_.Path } }) }',
    'ConvertTo-Json -InputObject $items -Compress',
  ].join('; ');

  const stdout = await new Promise<string | null>((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { encoding: 'utf8', windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024 },
      (error, output) => resolve(error ? null : output),
    );
  });

  if (!stdout) {
    return null;
  }

  try {
    const parsed = JSON.parse(stdout) as unknown;
    // A single pinned folder comes back as an object rather than an array.
    const rows = Array.isArray(parsed) ? parsed : [parsed];

    return rows
      .filter((row): row is { name: string; path: string } =>
        Boolean(row)
        && typeof (row as { name?: unknown }).name === 'string'
        && typeof (row as { path?: unknown }).path === 'string'
        // Virtual entries such as "This PC" report a GUID instead of a real path.
        && path.isAbsolute((row as { path: string }).path))
      .map((row) => ({ name: row.name, path: row.path }));
  } catch {
    return null;
  }
}

/**
 * Builds the shortcut list shown when the file tree first switches to machine scope.
 *
 * The pinned folders in File Explorer are the list the user already curated, so they come
 * first. The home-directory folders are only a fallback for when that list cannot be read
 * (non-Windows, or a machine with nothing pinned). The Claude config directory is appended
 * either way because it is the one folder this app always wants within reach.
 */
async function listQuickAccess(forceRefresh: boolean): Promise<DirectoryEntry[]> {
  const home = os.homedir();

  const isCacheFresh = quickAccessCache !== null
    && Date.now() - quickAccessCache.readAt < QUICK_ACCESS_CACHE_MS;

  let pinned: { name: string; path: string }[] | null;
  if (!forceRefresh && isCacheFresh) {
    pinned = quickAccessCache!.entries;
  } else {
    pinned = await readExplorerQuickAccess();
    if (pinned) {
      quickAccessCache = { entries: pinned, readAt: Date.now() };
    }
  }

  const fallback = [
    { name: 'Home', path: home },
    { name: 'Desktop', path: path.join(home, 'Desktop') },
    { name: 'Downloads', path: path.join(home, 'Downloads') },
    { name: 'Documents', path: path.join(home, 'Documents') },
  ];

  const candidates = pinned && pinned.length > 0 ? [...pinned] : [...fallback];

  const claudeHome = path.join(home, '.claude');
  if (!candidates.some((candidate) => normalizeAbsolutePath(candidate.path) === normalizeAbsolutePath(claudeHome))) {
    candidates.push({ name: '.claude', path: claudeHome });
  }

  const probes = await Promise.all(
    candidates.map(async (candidate): Promise<DirectoryEntry | null> => {
      try {
        const stats = await stat(candidate.path);
        // Quick Access can also hold recently used files; the tree wants folders only.
        if (!stats.isDirectory()) {
          return null;
        }
        return {
          name: candidate.name,
          path: candidate.path,
          type: 'directory',
          children: [],
        };
      } catch {
        // Pinned folders on disconnected drives simply drop out of the list.
        return null;
      }
    }),
  );

  return probes.filter((entry): entry is DirectoryEntry => entry !== null);
}

function respondWithFsError(res: Response, error: unknown, fallbackMessage: string): void {
  const fsError = error as NodeJS.ErrnoException;
  if (fsError.code === 'ENOENT') {
    res.status(404).json({ error: 'File or directory not found' });
    return;
  }
  if (fsError.code === 'EACCES' || fsError.code === 'EPERM') {
    res.status(403).json({ error: 'Permission denied' });
    return;
  }
  if (fsError.code === 'ENOTEMPTY') {
    res.status(400).json({ error: 'Directory is not empty' });
    return;
  }
  console.error(fallbackMessage, error);
  res.status(500).json({ error: (error as Error).message || fallbackMessage });
}

// GET /api/fs/roots?refresh= - Quick-access shortcuts and drive list
router.get('/roots', async (req: Request, res: Response) => {
  try {
    // The refresh button bypasses the Quick Access cache so newly pinned folders show up.
    const forceRefresh = readQueryStringValue(req.query.refresh) === 'true';
    const [quickAccess, drives] = await Promise.all([listQuickAccess(forceRefresh), listDrives()]);
    res.json({ quickAccess, drives, home: os.homedir(), separator: path.sep });
  } catch (error) {
    respondWithFsError(res, error, 'Error listing filesystem roots:');
  }
});

// GET /api/fs/list?path=&showHidden= - One directory level
router.get('/list', async (req: Request, res: Response) => {
  const validation = validateReadablePath(readQueryStringValue(req.query.path));
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const stats = await stat(validation.resolved);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const showHidden = readQueryStringValue(req.query.showHidden) !== 'false';
    const items = await listDirectory(validation.resolved, showHidden);
    res.json({ path: validation.resolved, items });
  } catch (error) {
    respondWithFsError(res, error, 'Error listing directory:');
  }
});

// GET /api/fs/file?path= - Text content
router.get('/file', async (req: Request, res: Response) => {
  const validation = validateReadablePath(readQueryStringValue(req.query.path));
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const content = await readFile(validation.resolved, 'utf8');
    res.json({ content, path: validation.resolved });
  } catch (error) {
    respondWithFsError(res, error, 'Error reading file:');
  }
});

// GET /api/fs/content?path= - Raw bytes, for image previews and downloads
router.get('/content', async (req: Request, res: Response) => {
  const validation = validateReadablePath(readQueryStringValue(req.query.path));
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    await access(validation.resolved);
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }

  res.setHeader('Content-Type', mime.lookup(validation.resolved) || 'application/octet-stream');

  const fileStream = fs.createReadStream(validation.resolved);
  fileStream.pipe(res);
  fileStream.on('error', (error) => {
    console.error('Error streaming file:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error reading file' });
    }
  });
});

// PUT /api/fs/file - Save text content
router.put('/file', async (req: Request, res: Response) => {
  const { filePath, content } = req.body ?? {};

  if (content === undefined) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const validation = validateWritablePath(typeof filePath === 'string' ? filePath : '');
  if (!validation.valid) {
    return res.status(403).json({ error: validation.error });
  }

  try {
    await writeFile(validation.resolved, content, 'utf8');
    res.json({ success: true, path: validation.resolved, message: 'File saved successfully' });
  } catch (error) {
    respondWithFsError(res, error, 'Error saving file:');
  }
});

// POST /api/fs/create - Create a file or directory
router.post('/create', async (req: Request, res: Response) => {
  const { path: parentPath, type, name } = req.body ?? {};

  if (!name || !type) {
    return res.status(400).json({ error: 'Name and type are required' });
  }
  if (!['file', 'directory'].includes(type)) {
    return res.status(400).json({ error: 'Type must be "file" or "directory"' });
  }

  const nameValidation = validateFilename(name);
  if (!nameValidation.valid) {
    return res.status(400).json({ error: nameValidation.error });
  }

  const parentValidation = validateReadablePath(typeof parentPath === 'string' ? parentPath : '');
  if (!parentValidation.valid) {
    return res.status(400).json({ error: parentValidation.error });
  }

  const targetValidation = validateWritablePath(path.join(parentValidation.resolved, name));
  if (!targetValidation.valid) {
    return res.status(403).json({ error: targetValidation.error });
  }

  const resolvedPath = targetValidation.resolved;

  try {
    await access(resolvedPath);
    return res.status(409).json({ error: `${type === 'file' ? 'File' : 'Directory'} already exists` });
  } catch {
    // Not existing is the expected case.
  }

  try {
    if (type === 'directory') {
      await mkdir(resolvedPath, { recursive: false });
    } else {
      await mkdir(path.dirname(resolvedPath), { recursive: true });
      await writeFile(resolvedPath, '', 'utf8');
    }

    res.json({
      success: true,
      path: resolvedPath,
      name,
      type,
      message: `${type === 'file' ? 'File' : 'Directory'} created successfully`,
    });
  } catch (error) {
    respondWithFsError(res, error, 'Error creating file/directory:');
  }
});

// PUT /api/fs/rename - Rename in place
router.put('/rename', async (req: Request, res: Response) => {
  const { oldPath, newName } = req.body ?? {};

  if (!oldPath || !newName) {
    return res.status(400).json({ error: 'oldPath and newName are required' });
  }

  const nameValidation = validateFilename(newName);
  if (!nameValidation.valid) {
    return res.status(400).json({ error: nameValidation.error });
  }

  const oldValidation = validateWritablePath(oldPath);
  if (!oldValidation.valid) {
    return res.status(403).json({ error: oldValidation.error });
  }

  try {
    await access(oldValidation.resolved);
  } catch {
    return res.status(404).json({ error: 'File or directory not found' });
  }

  const newValidation = validateWritablePath(path.join(path.dirname(oldValidation.resolved), newName));
  if (!newValidation.valid) {
    return res.status(403).json({ error: newValidation.error });
  }

  try {
    await access(newValidation.resolved);
    return res.status(409).json({ error: 'A file or directory with this name already exists' });
  } catch {
    // Not existing is the expected case.
  }

  try {
    await rename(oldValidation.resolved, newValidation.resolved);
    res.json({
      success: true,
      oldPath: oldValidation.resolved,
      newPath: newValidation.resolved,
      newName,
      message: 'Renamed successfully',
    });
  } catch (error) {
    respondWithFsError(res, error, 'Error renaming file/directory:');
  }
});

// DELETE /api/fs - Delete a file or directory
router.delete('/', async (req: Request, res: Response) => {
  const { path: targetPath } = req.body ?? {};

  const validation = validateWritablePath(typeof targetPath === 'string' ? targetPath : '');
  if (!validation.valid) {
    return res.status(403).json({ error: validation.error });
  }

  try {
    const stats = await stat(validation.resolved);

    if (stats.isDirectory()) {
      await rm(validation.resolved, { recursive: true, force: true });
    } else {
      await unlink(validation.resolved);
    }

    res.json({
      success: true,
      path: validation.resolved,
      type: stats.isDirectory() ? 'directory' : 'file',
      message: 'Deleted successfully',
    });
  } catch (error) {
    respondWithFsError(res, error, 'Error deleting file/directory:');
  }
});

// POST /api/fs/upload - Drag-and-drop upload into any writable directory
router.post('/upload', async (req: Request, res: Response) => {
  const multer = (await import('multer')).default;

  const uploadMiddleware = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, os.tmpdir()),
      filename: (_req, _file, cb) => cb(null, `upload-${Date.now()}-${Math.round(Math.random() * 1e9)}`),
    }),
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 20,
    },
  });

  uploadMiddleware.array('files', 20)(req, res, async (err: unknown) => {
    if (err) {
      const multerError = err as { code?: string; message?: string };
      if (multerError.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
      }
      if (multerError.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Too many files. Maximum is 20 files.' });
      }
      return res.status(500).json({ error: multerError.message ?? 'Upload failed' });
    }

    const files = (req as Request & { files?: MulterFile[] }).files ?? [];

    try {
      const { targetPath, relativePaths } = req.body ?? {};

      if (files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }

      const targetValidation = validateWritablePath(typeof targetPath === 'string' ? targetPath : '');
      if (!targetValidation.valid) {
        return res.status(403).json({ error: targetValidation.error });
      }

      let filePaths: string[] = [];
      if (relativePaths) {
        try {
          filePaths = JSON.parse(relativePaths) as string[];
        } catch {
          // Folder uploads without parsable relative paths fall back to flat names.
        }
      }

      await mkdir(targetValidation.resolved, { recursive: true });

      const uploadedFiles = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const fileName = filePaths[index] || file.originalname;
        const destPath = path.join(targetValidation.resolved, fileName);

        const destValidation = validateWritablePath(destPath);
        if (!destValidation.valid) {
          await unlink(file.path).catch(() => {});
          continue;
        }

        await mkdir(path.dirname(destValidation.resolved), { recursive: true });
        // Copy + unlink rather than rename: the temp dir is often on another volume.
        await copyFile(file.path, destValidation.resolved);
        await unlink(file.path);

        uploadedFiles.push({
          name: fileName,
          path: destValidation.resolved,
          size: file.size,
          mimeType: file.mimetype,
        });
      }

      res.json({
        success: true,
        files: uploadedFiles,
        targetPath: targetValidation.resolved,
        message: `Uploaded ${uploadedFiles.length} file(s) successfully`,
      });
    } catch (error) {
      for (const file of files) {
        await unlink(file.path).catch(() => {});
      }
      respondWithFsError(res, error, 'Error uploading files:');
    }
  });
});

export default router;
