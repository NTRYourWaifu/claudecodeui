import type { ReactNode, RefObject } from 'react';
import type { FileTreeNode as FileTreeNodeType, FileTreeViewMode } from '../types/types';
import FileTreeNode from './FileTreeNode';

type FileTreeListProps = {
  items: FileTreeNodeType[];
  viewMode: FileTreeViewMode;
  expandedDirs: Set<string>;
  onItemClick: (item: FileTreeNodeType) => void;
  renderFileIcon: (filename: string) => ReactNode;
  formatFileSize: (bytes?: number) => string;
  formatRelativeTime: (date?: string) => string;
  onRename?: (item: FileTreeNodeType) => void;
  onDelete?: (item: FileTreeNodeType) => void;
  onNewFile?: (path: string) => void;
  onNewFolder?: (path: string) => void;
  onCopyPath?: (item: FileTreeNodeType) => void;
  onDownload?: (item: FileTreeNodeType) => void;
  onRefresh?: () => void;
  // Rename state for inline editing
  renamingItem?: FileTreeNodeType | null;
  renameValue?: string;
  setRenameValue?: (value: string) => void;
  handleConfirmRename?: () => void;
  handleCancelRename?: () => void;
  renameInputRef?: RefObject<HTMLInputElement>;
  operationLoading?: boolean;
};

export default function FileTreeList({
  items,
  viewMode,
  expandedDirs,
  onItemClick,
  renderFileIcon,
  formatFileSize,
  formatRelativeTime,
  onRename,
  onDelete,
  onNewFile,
  onNewFolder,
  onCopyPath,
  onDownload,
  onRefresh,
  renamingItem,
  renameValue,
  setRenameValue,
  handleConfirmRename,
  handleCancelRename,
  renameInputRef,
  operationLoading,
}: FileTreeListProps) {
  return (
    <div>
      {items.map((item, index) => (
        <div key={item.path}>
          {/* Machine scope tags its root entries with a group name so the shortcuts
              and the drive list read as two sections. Project scope never sets it. */}
          {item.group && item.group !== items[index - 1]?.group && (
            <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {item.group}
            </div>
          )}
          <FileTreeNode
            item={item}
            level={0}
            viewMode={viewMode}
            expandedDirs={expandedDirs}
            onItemClick={onItemClick}
            renderFileIcon={renderFileIcon}
            formatFileSize={formatFileSize}
            formatRelativeTime={formatRelativeTime}
            onRename={onRename}
            onDelete={onDelete}
            onNewFile={onNewFile}
            onNewFolder={onNewFolder}
            onCopyPath={onCopyPath}
            onDownload={onDownload}
            onRefresh={onRefresh}
            renamingItem={renamingItem}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            handleConfirmRename={handleConfirmRename}
            handleCancelRename={handleCancelRename}
            renameInputRef={renameInputRef}
            operationLoading={operationLoading}
          />
        </div>
      ))}
    </div>
  );
}
