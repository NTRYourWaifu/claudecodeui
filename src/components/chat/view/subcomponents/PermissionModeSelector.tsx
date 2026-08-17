import { useState, useRef, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Hand, Code2, Bot, ClipboardList, Zap, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { PermissionMode } from '../../types/types';

type ModeDef = {
  id: string;
  label: string;
  description: string;
  Icon: typeof Hand;
  // Tailwind 顏色 token
  iconColor: string;
  // 按鈕（trigger）配色
  triggerClass: string;
  dotClass: string;
};

const CLAUDE_MODES: ModeDef[] = [
  {
    id: 'default',
    label: 'Ask before edits',
    description: 'Claude will ask for approval before making each edit',
    Icon: Hand,
    iconColor: 'text-orange-500',
    triggerClass: 'border-border/60 bg-muted/50 text-muted-foreground hover:bg-muted',
    dotClass: 'bg-muted-foreground',
  },
  {
    id: 'acceptEdits',
    label: 'Edit automatically',
    description: 'Claude will edit your selected text or the whole file',
    Icon: Code2,
    iconColor: 'text-green-500',
    triggerClass:
      'border-green-300/60 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-600/40 dark:bg-green-900/15 dark:text-green-300 dark:hover:bg-green-900/25',
    dotClass: 'bg-green-500',
  },
  {
    id: 'auto',
    label: 'Auto (classifier)',
    description: 'A classifier decides per tool call whether to approve. Hands-off, but safer than Bypass.',
    Icon: Bot,
    iconColor: 'text-blue-500',
    triggerClass:
      'border-blue-300/60 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-600/40 dark:bg-blue-900/15 dark:text-blue-300 dark:hover:bg-blue-900/25',
    dotClass: 'bg-blue-500',
  },
  {
    id: 'plan',
    label: 'Plan mode',
    description: 'Claude will explore the code and present a plan before editing',
    Icon: ClipboardList,
    iconColor: 'text-primary',
    triggerClass: 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10',
    dotClass: 'bg-primary',
  },
  {
    id: 'bypassPermissions',
    label: 'Bypass permissions',
    description: 'Claude will not ask for approval before running potentially dangerous commands',
    Icon: Zap,
    iconColor: 'text-orange-500',
    triggerClass:
      'border-orange-300/60 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-600/40 dark:bg-orange-900/15 dark:text-orange-300 dark:hover:bg-orange-900/25',
    dotClass: 'bg-orange-500',
  },
];

// Codex / Gemini 沒有 auto / plan 等差異，保留簡化版
const NON_CLAUDE_MODES: ModeDef[] = CLAUDE_MODES.filter(
  (m) => m.id !== 'auto',
);

type Props = {
  permissionMode: PermissionMode | string;
  onModeChange: (next: string) => void;
  provider: string;
};

export default function PermissionModeSelector({
  permissionMode,
  onModeChange,
  provider,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const { t } = useTranslation('chat');

  const allModes = provider === 'claude' ? CLAUDE_MODES : NON_CLAUDE_MODES;
  const current = useMemo(
    () => allModes.find((m) => m.id === permissionMode) || allModes[0],
    [allModes, permissionMode],
  );
  const CurrentIcon = current.Icon;

  const close = useCallback(() => setOpen(false), []);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const dropdown = dropdownRef.current;
    if (!trigger || !dropdown || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const pad = window.innerWidth < 640 ? 12 : 16;
    const spacing = 8;
    const width = Math.min(window.innerWidth - pad * 2, 320);
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));

    // trigger 永遠在底部輸入區、dropdown 永遠往上開（避免遮按鈕）
    const spaceAbove = rect.top - spacing - pad;
    const measured = dropdown.offsetHeight || 360;
    const availableHeight = Math.max(180, spaceAbove);
    const panelHeight = Math.min(measured, availableHeight);
    const top = Math.max(pad, rect.top - spacing - panelHeight);

    setStyle({ position: 'fixed', top, left, width, maxHeight: availableHeight, zIndex: 80 });
  }, []);

  useEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const id = window.requestAnimationFrame(reposition);
    const onChange = () => reposition();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);

    // 監聽 dropdown 自己高度變化（第一次 mount 從 0 變實際高度需要重算）
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && dropdownRef.current) {
      ro = new ResizeObserver(() => reposition());
      ro.observe(dropdownRef.current);
    }

    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
      ro?.disconnect();
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dropdownRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`rounded-lg border p-2 text-xs font-medium transition-all duration-200 sm:px-2.5 sm:py-1 ${current.triggerClass}`}
        title={current.label}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className="flex items-center gap-1.5">
          <CurrentIcon className={`h-3.5 w-3.5 ${current.iconColor}`} />
          <span className="hidden whitespace-nowrap sm:inline">{current.label}</span>
        </div>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={style || { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
          className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-xl"
          role="listbox"
        >
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('codex.permissionMode', { defaultValue: 'Modes' })}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <kbd className="rounded border border-border/60 bg-muted/60 px-1 py-0.5 font-mono">⇧</kbd>
              <span>+</span>
              <kbd className="rounded border border-border/60 bg-muted/60 px-1 py-0.5 font-mono">tab</kbd>
              <span>to switch</span>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto py-1">
            {allModes.map((mode) => {
              const ModeIcon = mode.Icon;
              const selected = mode.id === permissionMode;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    onModeChange(mode.id);
                    close();
                  }}
                  className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent ${
                    selected ? 'bg-accent/60' : ''
                  }`}
                >
                  <ModeIcon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${mode.iconColor}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{mode.label}</span>
                      {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {mode.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
