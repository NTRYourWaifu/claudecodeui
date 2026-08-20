import { useCallback, useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type RefObject } from 'react';

type AnchoredMenu = {
  /** Mutable so a caller can point the menu at whichever button was clicked. */
  triggerRef: MutableRefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLDivElement>;
  /** Inline style for the panel; null until the first measurement lands. */
  style: CSSProperties | null;
};

type AnchoredMenuOptions = {
  maxWidth?: number;
  /**
   * `up` always opens above the trigger, which is what the composer needs: it
   * sits at the bottom of the screen, so a downward menu would land off-screen
   * or under the on-screen keyboard. `auto` opens downward and only flips up
   * when the space below is too tight.
   */
  placement?: 'up' | 'auto';
};

/**
 * Positions a menu next to its trigger, clamped to the viewport.
 *
 * Closes on outside pointer-down and on Escape. Repositioning also watches the
 * panel's own size: on first mount the panel measures 0px tall, so a single
 * measurement would place it wrongly.
 */
export function useAnchoredMenu(
  open: boolean,
  onClose: () => void,
  { maxWidth = 320, placement = 'up' }: AnchoredMenuOptions = {},
): AnchoredMenu {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const pad = window.innerWidth < 640 ? 12 : 16;
    const spacing = 8;
    const width = Math.min(window.innerWidth - pad * 2, maxWidth);

    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));

    const measured = panel.offsetHeight || 360;
    const spaceAbove = rect.top - spacing - pad;
    const spaceBelow = window.innerHeight - rect.bottom - spacing - pad;

    const opensDownward = placement === 'auto' && (spaceBelow >= measured || spaceBelow >= spaceAbove);

    if (opensDownward) {
      const availableHeight = Math.max(180, spaceBelow);
      setStyle({ position: 'fixed', top: rect.bottom + spacing, left, width, maxHeight: availableHeight, zIndex: 80 });
      return;
    }

    const availableHeight = Math.max(180, spaceAbove);
    const panelHeight = Math.min(measured, availableHeight);
    const top = Math.max(pad, rect.top - spacing - panelHeight);

    setStyle({ position: 'fixed', top, left, width, maxHeight: availableHeight, zIndex: 80 });
  }, [maxWidth, placement]);

  useEffect(() => {
    if (!open) {
      setStyle(null);
      return undefined;
    }

    const frame = window.requestAnimationFrame(reposition);
    const onChange = () => reposition();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && panelRef.current) {
      observer = new ResizeObserver(() => reposition());
      observer.observe(panelRef.current);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
      observer?.disconnect();
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return { triggerRef, panelRef, style };
}
