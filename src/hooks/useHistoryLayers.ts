import { useEffect, useRef, useState } from 'react';

/**
 * One dismissible UI layer that the hardware/browser Back button should close
 * before the app navigates away. Layers are declared outermost-first and are
 * expected to nest: an inner layer is never active while its outer one is not.
 */
export type HistoryLayer = {
  id: string;
  active: boolean;
  close: () => void;
};

const LAYER_KEY = '__cloudcliLayer';

/**
 * Maps a nested stack of UI layers onto browser history entries so Back closes
 * them one at a time instead of leaving the app.
 *
 * This is the only place in the frontend that writes to `window.history`
 * directly. It never touches `pathname`, so react-router keeps owning real
 * navigation: once every layer is closed, `pushedRef` is empty and the Back
 * press falls through to the router untouched.
 */
export function useHistoryLayers(layers: HistoryLayer[]): void {
  const layersRef = useRef(layers);
  layersRef.current = layers;

  // History entries this hook pushed, oldest first.
  const pushedRef = useRef<string[]>([]);
  // Pops we caused ourselves via `history.go`, which must not close a layer.
  const suppressRef = useRef(0);
  // Bumped after a self-inflicted pop settles so the sync effect can re-run and
  // push whatever the new layer stack still needs.
  const [syncTick, setSyncTick] = useState(0);

  const activeKey = layers
    .filter((layer) => layer.active)
    .map((layer) => layer.id)
    .join('|');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handlePopState = () => {
      if (suppressRef.current > 0) {
        suppressRef.current -= 1;
        if (suppressRef.current === 0) {
          setSyncTick((tick) => tick + 1);
        }
        return;
      }

      const pushed = pushedRef.current;
      if (pushed.length === 0) {
        return;
      }

      const topId = pushed[pushed.length - 1];
      pushedRef.current = pushed.slice(0, -1);
      layersRef.current.find((layer) => layer.id === topId)?.close();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const activeIds = activeKey ? activeKey.split('|') : [];
    const pushed = pushedRef.current;

    let common = 0;
    while (common < pushed.length && common < activeIds.length && pushed[common] === activeIds[common]) {
      common += 1;
    }

    const staleCount = pushed.length - common;
    if (staleCount > 0) {
      const topId = pushed[pushed.length - 1];
      pushedRef.current = pushed.slice(0, common);

      // Rewind only while our own marker is still the newest entry. If the
      // router pushed a route on top, `go` would undo that navigation instead,
      // so we drop the markers and accept the leftover no-op entries.
      const state = window.history.state as Record<string, unknown> | null;
      if (state && state[LAYER_KEY] === topId) {
        suppressRef.current += staleCount;
        window.history.go(-staleCount);
        return;
      }
    }

    for (let index = pushedRef.current.length; index < activeIds.length; index += 1) {
      const baseState = (window.history.state as Record<string, unknown> | null) ?? {};
      window.history.pushState({ ...baseState, [LAYER_KEY]: activeIds[index] }, '');
      pushedRef.current = [...pushedRef.current, activeIds[index]];
    }
  }, [activeKey, syncTick]);
}
