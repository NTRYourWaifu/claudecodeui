import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../utils/api';
import type { FileTreeNode } from '../types/types';

type RootsResponse = {
  quickAccess?: FileTreeNode[];
  drives?: FileTreeNode[];
  home?: string;
};

type UseComputerFileTreeResult = {
  files: FileTreeNode[];
  loading: boolean;
  loadingPaths: Set<string>;
  loadedPaths: Set<string>;
  loadDirectory: (dirPath: string) => Promise<void>;
  refreshFiles: () => void;
};

/**
 * Machine-scope file tree data.
 *
 * A recursive walk from a drive root would never finish, so this hook keeps the tree
 * flat in state: `rootNodes` holds the shortcuts and drives, and `childrenByPath` holds
 * one entry per directory that has actually been opened. The nested shape the renderer
 * wants is rebuilt from those two pieces, which keeps a refresh from collapsing the
 * user back to the top level after they create or delete something several levels deep.
 */
export function useComputerFileTree(enabled: boolean): UseComputerFileTreeResult {
  const { t } = useTranslation();
  const [rootNodes, setRootNodes] = useState<FileTreeNode[]>([]);
  const [childrenByPath, setChildrenByPath] = useState<Map<string, FileTreeNode[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  // Read inside callbacks so refreshing does not need the map in its dependency list.
  const childrenRef = useRef(childrenByPath);
  childrenRef.current = childrenByPath;

  const refreshFiles = useCallback(() => {
    setRefreshKey((previous) => previous + 1);
  }, []);

  const fetchDirectory = useCallback(async (dirPath: string): Promise<FileTreeNode[] | null> => {
    const response = await api.fs.list(dirPath);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { items?: FileTreeNode[] };
    return data.items ?? [];
  }, []);

  const loadDirectory = useCallback(
    async (dirPath: string) => {
      setLoadingPaths((previous) => new Set(previous).add(dirPath));

      try {
        const items = await fetchDirectory(dirPath);
        if (items === null) {
          return;
        }

        setChildrenByPath((previous) => {
          const next = new Map(previous);
          next.set(dirPath, items);
          return next;
        });
      } catch (error) {
        console.error('Error listing directory:', dirPath, error);
      } finally {
        setLoadingPaths((previous) => {
          const next = new Set(previous);
          next.delete(dirPath);
          return next;
        });
      }
    },
    [fetchDirectory],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isActive = true;

    const loadRoots = async () => {
      setLoading(true);
      try {
        // Only an explicit refresh re-reads Explorer's pinned folders; the first load
        // of a session is happy with the server's cached copy.
        const response = await api.fs.roots({ refresh: refreshKey > 0 });
        if (!response.ok) {
          throw new Error(`Failed to load roots: ${response.status}`);
        }

        const data = (await response.json()) as RootsResponse;
        if (!isActive) {
          return;
        }

        const quickAccess = (data.quickAccess ?? []).map((node) => ({
          ...node,
          group: t('fileTree.quickAccess', 'Quick access'),
        }));
        const drives = (data.drives ?? []).map((node) => ({
          ...node,
          group: t('fileTree.drives', 'Drives'),
        }));

        setRootNodes([...quickAccess, ...drives]);

        // Re-read every directory the user had already opened so a refresh triggered by
        // a create/rename/delete does not throw away their place in the tree.
        const openedPaths = Array.from(childrenRef.current.keys());
        if (openedPaths.length > 0) {
          const reloaded = await Promise.all(
            openedPaths.map(async (dirPath) => {
              try {
                return [dirPath, await fetchDirectory(dirPath)] as const;
              } catch {
                return [dirPath, null] as const;
              }
            }),
          );

          if (!isActive) {
            return;
          }

          setChildrenByPath((previous) => {
            const next = new Map(previous);
            for (const [dirPath, items] of reloaded) {
              if (items === null) {
                // The directory disappeared (deleted or unmounted); drop it from the tree.
                next.delete(dirPath);
              } else {
                next.set(dirPath, items);
              }
            }
            return next;
          });
        }
      } catch (error) {
        console.error('Error loading filesystem roots:', error);
        if (isActive) {
          setRootNodes([]);
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadRoots();

    return () => {
      isActive = false;
    };
  }, [enabled, refreshKey, fetchDirectory, t]);

  // Rebuild the nested shape the renderer expects from the flat per-directory cache.
  const files = useMemo(() => {
    const attachChildren = (node: FileTreeNode): FileTreeNode => {
      if (node.type !== 'directory') {
        return node;
      }

      const loadedChildren = childrenByPath.get(node.path);
      return {
        ...node,
        children: loadedChildren ? loadedChildren.map(attachChildren) : [],
      };
    };

    return rootNodes.map(attachChildren);
  }, [rootNodes, childrenByPath]);

  const loadedPaths = useMemo(() => new Set(childrenByPath.keys()), [childrenByPath]);

  return {
    files,
    loading,
    loadingPaths,
    loadedPaths,
    loadDirectory,
    refreshFiles,
  };
}
