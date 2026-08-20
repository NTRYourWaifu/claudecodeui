import type { LucideIcon } from 'lucide-react';

export type FileTreeViewMode = 'simple' | 'compact' | 'detailed';

export type FileTreeItemType = 'file' | 'directory';

/**
 * Which filesystem the tree is looking at.
 *
 * `project` reads through `/api/projects/:projectId/files*`, which refuses any path
 * outside the selected project. `computer` reads through `/api/fs/*`, which takes
 * absolute paths anywhere on the machine and loads one directory level at a time.
 */
export type FileTreeScope = 'project' | 'computer';

export interface FileTreeNode {
  name: string;
  type: FileTreeItemType;
  path: string;
  size?: number;
  modified?: string;
  permissionsRwx?: string;
  children?: FileTreeNode[];
  // Set only on the machine-scope root entries, so the list can print a heading
  // above each run of shortcuts and drives.
  group?: string;
  [key: string]: unknown;
}

export interface FileTreeImageSelection {
  name: string;
  path: string;
  projectPath?: string;
  // DB projectId; used by ImageViewer to build the raw content URL.
  // Empty in machine scope, where the viewer reads by absolute path instead.
  projectId: string;
  scope?: FileTreeScope;
}

export interface FileIconData {
  icon: LucideIcon;
  color: string;
}

export type FileIconMap = Record<string, FileIconData>;
