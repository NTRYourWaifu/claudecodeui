import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import JSZip from 'jszip';
import { api } from '../../../utils/api';
import type { FileTreeNode, FileTreeScope } from '../types/types';
import type { Project } from '../../../types/app';

// Invalid filename characters
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/;
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

// Ceiling on a folder-to-ZIP export. Machine scope can reach directories with tens of
// thousands of files, and each one costs a round trip, so stop before the browser does.
const MAX_ZIP_FILES = 500;

export type ToastMessage = {
  message: string;
  type: 'success' | 'error';
};

export type DeleteConfirmation = {
  isOpen: boolean;
  item: FileTreeNode | null;
};

export type UseFileTreeOperationsOptions = {
  selectedProject: Project | null;
  onRefresh: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
  scope?: FileTreeScope;
};

export type UseFileTreeOperationsResult = {
  // Rename operations
  renamingItem: FileTreeNode | null;
  renameValue: string;
  handleStartRename: (item: FileTreeNode) => void;
  handleCancelRename: () => void;
  handleConfirmRename: () => Promise<void>;
  setRenameValue: (value: string) => void;

  // Delete operations
  deleteConfirmation: DeleteConfirmation;
  handleStartDelete: (item: FileTreeNode) => void;
  handleCancelDelete: () => void;
  handleConfirmDelete: () => Promise<void>;

  // Create operations
  isCreating: boolean;
  newItemParent: string;
  newItemType: 'file' | 'directory';
  newItemName: string;
  handleStartCreate: (parentPath: string, type: 'file' | 'directory') => void;
  handleCancelCreate: () => void;
  handleConfirmCreate: () => Promise<void>;
  setNewItemName: (name: string) => void;

  // Other operations
  handleCopyPath: (item: FileTreeNode) => void;
  handleDownload: (item: FileTreeNode) => Promise<void>;

  // Loading state
  operationLoading: boolean;

  // Validation
  validateFilename: (name: string) => string | null;
};

export function useFileTreeOperations({
  selectedProject,
  onRefresh,
  showToast,
  scope = 'project',
}: UseFileTreeOperationsOptions): UseFileTreeOperationsResult {
  const { t } = useTranslation();

  // Both scopes expose the same four calls; only the addressing differs. Project scope
  // sends a DB projectId and the server resolves paths under that root, while machine
  // scope sends absolute paths to `/api/fs/*`.
  const projectId = selectedProject?.projectId;
  const fileApi = useMemo(() => {
    if (scope === 'computer') {
      return {
        ready: true,
        createFile: api.fs.createFile,
        renameFile: api.fs.renameFile,
        deleteFile: api.fs.deleteFile,
        readFileBlob: api.fs.readFileBlob,
      };
    }

    return {
      ready: Boolean(projectId),
      createFile: (payload: { path: string; type: 'file' | 'directory'; name: string }) =>
        api.createFile(projectId, payload),
      renameFile: (payload: { oldPath: string; newName: string }) =>
        api.renameFile(projectId, payload),
      deleteFile: (payload: { path: string; type: 'file' | 'directory' }) =>
        api.deleteFile(projectId, payload),
      readFileBlob: (filePath: string) => api.readFileBlob(projectId, filePath),
    };
  }, [scope, projectId]);

  // State
  const [renamingItem, setRenamingItem] = useState<FileTreeNode | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>({
    isOpen: false,
    item: null,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [newItemParent, setNewItemParent] = useState('');
  const [newItemType, setNewItemType] = useState<'file' | 'directory'>('file');
  const [newItemName, setNewItemName] = useState('');
  const [operationLoading, setOperationLoading] = useState(false);

  // Validation
  const validateFilename = useCallback((name: string): string | null => {
    if (!name || !name.trim()) {
      return t('fileTree.validation.emptyName', 'Filename cannot be empty');
    }
    if (INVALID_FILENAME_CHARS.test(name)) {
      return t('fileTree.validation.invalidChars', 'Filename contains invalid characters');
    }
    if (RESERVED_NAMES.test(name)) {
      return t('fileTree.validation.reserved', 'Filename is a reserved name');
    }
    if (/^\.+$/.test(name)) {
      return t('fileTree.validation.dotsOnly', 'Filename cannot be only dots');
    }
    return null;
  }, [t]);

  // Rename operations
  const handleStartRename = useCallback((item: FileTreeNode) => {
    setRenamingItem(item);
    setRenameValue(item.name);
    setIsCreating(false);
  }, []);

  const handleCancelRename = useCallback(() => {
    setRenamingItem(null);
    setRenameValue('');
  }, []);

  const handleConfirmRename = useCallback(async () => {
    if (!renamingItem || !fileApi.ready) return;

    const error = validateFilename(renameValue);
    if (error) {
      showToast(error, 'error');
      return;
    }

    if (renameValue === renamingItem.name) {
      handleCancelRename();
      return;
    }

    setOperationLoading(true);
    try {
      const response = await fileApi.renameFile({
        oldPath: renamingItem.path,
        newName: renameValue,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to rename');
      }

      showToast(t('fileTree.toast.renamed', 'Renamed successfully'), 'success');
      onRefresh();
      handleCancelRename();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setOperationLoading(false);
    }
  }, [renamingItem, renameValue, fileApi, validateFilename, showToast, t, onRefresh, handleCancelRename]);

  // Delete operations
  const handleStartDelete = useCallback((item: FileTreeNode) => {
    setDeleteConfirmation({ isOpen: true, item });
  }, []);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmation({ isOpen: false, item: null });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    const { item } = deleteConfirmation;
    if (!item || !fileApi.ready) return;

    setOperationLoading(true);
    try {
      const response = await fileApi.deleteFile({
        path: item.path,
        type: item.type,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete');
      }

      showToast(
        item.type === 'directory'
          ? t('fileTree.toast.folderDeleted', 'Folder deleted')
          : t('fileTree.toast.fileDeleted', 'File deleted'),
        'success'
      );
      onRefresh();
      handleCancelDelete();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setOperationLoading(false);
    }
  }, [deleteConfirmation, fileApi, showToast, t, onRefresh, handleCancelDelete]);

  // Create operations
  const handleStartCreate = useCallback((parentPath: string, type: 'file' | 'directory') => {
    setNewItemParent(parentPath || '');
    setNewItemType(type);
    setNewItemName(type === 'file' ? 'untitled.txt' : 'new-folder');
    setIsCreating(true);
    setRenamingItem(null);
  }, []);

  const handleCancelCreate = useCallback(() => {
    setIsCreating(false);
    setNewItemParent('');
    setNewItemName('');
  }, []);

  const handleConfirmCreate = useCallback(async () => {
    if (!fileApi.ready) return;

    const error = validateFilename(newItemName);
    if (error) {
      showToast(error, 'error');
      return;
    }

    // Machine scope has no implicit root to fall back on: new items must name the
    // directory they go into, which the tree's context menu always supplies.
    if (scope === 'computer' && !newItemParent) {
      showToast(t('fileTree.pickFolderFirst', 'Pick a folder first'), 'error');
      return;
    }

    setOperationLoading(true);
    try {
      const response = await fileApi.createFile({
        path: newItemParent,
        type: newItemType,
        name: newItemName,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create');
      }

      showToast(
        newItemType === 'file'
          ? t('fileTree.toast.fileCreated', 'File created successfully')
          : t('fileTree.toast.folderCreated', 'Folder created successfully'),
        'success'
      );
      onRefresh();
      handleCancelCreate();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setOperationLoading(false);
    }
  }, [fileApi, scope, newItemParent, newItemType, newItemName, validateFilename, showToast, t, onRefresh, handleCancelCreate]);

  // Copy path to clipboard
  const handleCopyPath = useCallback((item: FileTreeNode) => {
    navigator.clipboard.writeText(item.path).catch(() => {
      // Clipboard API may fail in some contexts (e.g., non-HTTPS)
      showToast(t('fileTree.toast.copyFailed', 'Failed to copy path'), 'error');
      return;
    });
    showToast(t('fileTree.toast.pathCopied', 'Path copied to clipboard'), 'success');
  }, [showToast, t]);

  const triggerBrowserDownload = useCallback((blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = fileName;

    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    URL.revokeObjectURL(url);
  }, []);

  // Download file or folder
  const handleDownload = useCallback(async (item: FileTreeNode) => {
    if (!fileApi.ready) return;

    setOperationLoading(true);
    try {
      if (item.type === 'directory') {
        // Download folder as ZIP
        await downloadFolderAsZip(item);
      } else {
        // Download single file
        await downloadSingleFile(item);
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setOperationLoading(false);
    }
  }, [fileApi, showToast]);

  // Download a single file
  const downloadSingleFile = useCallback(async (item: FileTreeNode) => {
    // Use the binary streaming endpoint so downloads preserve raw bytes.
    const response = await fileApi.readFileBlob(item.path);

    if (!response.ok) {
      throw new Error('Failed to download file');
    }

    const blob = await response.blob();
    triggerBrowserDownload(blob, item.name);
  }, [fileApi, triggerBrowserDownload]);

  // Download folder as ZIP
  const downloadFolderAsZip = useCallback(async (folder: FileTreeNode) => {
    const zip = new JSZip();
    let fileCount = 0;

    // In machine scope the tree is loaded one level at a time, so a folder the user
    // never expanded carries no children in state. Fetch the missing levels here,
    // otherwise the archive would silently come out empty or partial.
    const readChildren = async (node: FileTreeNode): Promise<FileTreeNode[]> => {
      if (node.children && node.children.length > 0) {
        return node.children;
      }

      if (scope !== 'computer') {
        return [];
      }

      const response = await api.fs.list(node.path);
      if (!response.ok) {
        throw new Error(`Failed to read "${node.name}" for ZIP export`);
      }

      const data = (await response.json()) as { items?: FileTreeNode[] };
      return data.items ?? [];
    };

    // Recursively get all files in the folder
    const collectFiles = async (node: FileTreeNode, currentPath: string) => {
      const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;

      if (node.type === 'file') {
        if (fileCount >= MAX_ZIP_FILES) {
          throw new Error(
            t('fileTree.zipTooLarge', 'Folder has more than {{count}} files; download it in smaller pieces', {
              count: MAX_ZIP_FILES,
            }),
          );
        }
        fileCount += 1;

        const response = await fileApi.readFileBlob(node.path);
        if (!response.ok) {
          throw new Error(`Failed to download "${node.name}" for ZIP export`);
        }

        // Store raw bytes in the archive so binary files stay intact.
        const fileBytes = await response.arrayBuffer();
        zip.file(fullPath, fileBytes);
      } else if (node.type === 'directory') {
        for (const child of await readChildren(node)) {
          await collectFiles(child, fullPath);
        }
      }
    };

    for (const child of await readChildren(folder)) {
      await collectFiles(child, '');
    }

    // Generate ZIP file
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerBrowserDownload(zipBlob, `${folder.name}.zip`);

    showToast(t('fileTree.toast.folderDownloaded', 'Folder downloaded as ZIP'), 'success');
  }, [fileApi, scope, showToast, t, triggerBrowserDownload]);

  return {
    // Rename operations
    renamingItem,
    renameValue,
    handleStartRename,
    handleCancelRename,
    handleConfirmRename,
    setRenameValue,

    // Delete operations
    deleteConfirmation,
    handleStartDelete,
    handleCancelDelete,
    handleConfirmDelete,

    // Create operations
    isCreating,
    newItemParent,
    newItemType,
    newItemName,
    handleStartCreate,
    handleCancelCreate,
    handleConfirmCreate,
    setNewItemName,

    // Other operations
    handleCopyPath,
    handleDownload,

    // Loading state
    operationLoading,

    // Validation
    validateFilename,
  };
}
