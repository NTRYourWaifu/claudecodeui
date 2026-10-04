import { useSyncExternalStore } from 'react';

/**
 * The thinking block the open session is in the middle of, if any.
 *
 * A block arrives as a message only once it is finished, so while it runs the
 * server sends a status when it begins and another when it ends. Kept outside
 * React state so the conversation row timing it can tick every second without
 * the whole chat re-rendering with it.
 */
export type ThinkingProgress = {
  /** The server's start time, used only to tell one block from the next. */
  blockId: number;
  /** When this device first heard of the block. */
  startedAt: number;
};

let current: ThinkingProgress | null = null;
const listeners = new Set<() => void>();

export function getThinkingProgress() {
  return current;
}

export function setThinkingProgress(next: ThinkingProgress | null) {
  if (current === next) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThinkingProgress() {
  return useSyncExternalStore(subscribe, () => current);
}
