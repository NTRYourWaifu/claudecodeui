import { useCallback, useState } from 'react';
import type { FileTreeScope } from '../types/types';

const STORAGE_KEY = 'file-tree-scope';

function readStoredScope(): FileTreeScope {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'computer' ? 'computer' : 'project';
  } catch {
    // Private-mode browsers can throw on storage access; project scope is the safe default.
    return 'project';
  }
}

/**
 * Remembers whether the file tree is browsing the selected project or the whole
 * machine, so the choice survives tab switches and reloads.
 */
export function useFileTreeScope() {
  const [scope, setScopeState] = useState<FileTreeScope>(readStoredScope);

  const setScope = useCallback((next: FileTreeScope) => {
    setScopeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Losing the preference is acceptable; blocking the switch is not.
    }
  }, []);

  const toggleScope = useCallback(() => {
    setScope(scope === 'project' ? 'computer' : 'project');
  }, [scope, setScope]);

  return { scope, setScope, toggleScope };
}
