import { useState, useRef, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Gauge, Sparkles, Check } from 'lucide-react';

import { CLAUDE_MODELS } from '../../../../../shared/modelConstants';

const ALL_EFFORT_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'low', label: 'Low', hint: 'Minimal thinking, fastest' },
  { value: 'medium', label: 'Medium', hint: 'Moderate thinking' },
  { value: 'high', label: 'High', hint: 'Deep reasoning (default)' },
  { value: 'xhigh', label: 'XHigh', hint: 'Deeper than high — Opus 5/4.8 only' },
  { value: 'max', label: 'Max', hint: 'Maximum effort — Opus 5/4.8, Sonnet 5' },
];

// 根據 Anthropic 官方 model spec 對應 effort 支援度
// xhigh 為 Opus 系列限定；max 為 Opus 系列 + Sonnet
function getSupportedEfforts(model: string): Set<string> {
  if (model === 'claude-opus-5' || model === 'claude-opus-4-8') {
    return new Set(['low', 'medium', 'high', 'xhigh', 'max']);
  }
  if (model === 'claude-sonnet-5') {
    return new Set(['low', 'medium', 'high', 'max']);
  }
  // Haiku 4.5
  return new Set(['low', 'medium', 'high']);
}

// Haiku 4.5 無 adaptive thinking（只支援 extended，是不同機制）
const NO_ADAPTIVE_THINKING = new Set(['claude-haiku-4-5']);

type Props = {
  model: string;
  onModelChange: (value: string) => void;
  thinkingEnabled: boolean;
  onThinkingChange: (next: boolean) => void;
  effort: string;
  onEffortChange: (next: string) => void;
};

type DropdownKind = null | 'model' | 'effort';

export default function ClaudeQuickControls({
  model,
  onModelChange,
  thinkingEnabled,
  onThinkingChange,
  effort,
  onEffortChange,
}: Props) {
  const [openDropdown, setOpenDropdown] = useState<DropdownKind>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const effortTriggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const close = useCallback(() => setOpenDropdown(null), []);

  const modelLabel = CLAUDE_MODELS.OPTIONS.find((o) => o.value === model)?.label || model;

  const supportedEfforts = useMemo(() => getSupportedEfforts(model), [model]);
  const visibleEffortOptions = useMemo(
    () => ALL_EFFORT_OPTIONS.filter((o) => supportedEfforts.has(o.value)),
    [supportedEfforts],
  );
  const supportsAdaptiveThinking = !NO_ADAPTIVE_THINKING.has(model);

  // 當 model 變更導致目前 effort 不支援時，自動降到 high
  useEffect(() => {
    if (!supportedEfforts.has(effort)) {
      onEffortChange('high');
    }
  }, [supportedEfforts, effort, onEffortChange]);

  const effortLabel = ALL_EFFORT_OPTIONS.find((o) => o.value === effort)?.label || effort;

  const reposition = useCallback(() => {
    const trigger = openDropdown === 'model' ? modelTriggerRef.current : effortTriggerRef.current;
    const dropdown = dropdownRef.current;
    if (!trigger || !dropdown || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const pad = window.innerWidth < 640 ? 12 : 16;
    const spacing = 8;
    const width = Math.min(window.innerWidth - pad * 2, 280);
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));

    // trigger 永遠在底部輸入區、dropdown 永遠往上開（避免遮按鈕）
    const spaceAbove = rect.top - spacing - pad;
    const measured = dropdown.offsetHeight || 320;
    const availableHeight = Math.max(180, spaceAbove);
    const panelHeight = Math.min(measured, availableHeight);
    const top = Math.max(pad, rect.top - spacing - panelHeight);

    setStyle({ position: 'fixed', top, left, width, maxHeight: availableHeight, zIndex: 80 });
  }, [openDropdown]);

  useEffect(() => {
    if (!openDropdown) {
      setStyle(null);
      return;
    }
    const id = window.requestAnimationFrame(reposition);
    const onChange = () => reposition();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [openDropdown, reposition]);

  useEffect(() => {
    if (!openDropdown) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dropdownRef.current?.contains(target)) return;
      if (modelTriggerRef.current?.contains(target)) return;
      if (effortTriggerRef.current?.contains(target)) return;
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
  }, [openDropdown, close]);

  return (
    <div className="flex items-center gap-1">
      {/* Model 按鈕 */}
      <button
        ref={modelTriggerRef}
        type="button"
        onClick={() => setOpenDropdown((cur) => (cur === 'model' ? null : 'model'))}
        className="flex h-7 items-center gap-1 rounded-lg border border-border/60 bg-muted/40 px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        title="Claude model"
        aria-haspopup="listbox"
        aria-expanded={openDropdown === 'model'}
      >
        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        <span className="hidden whitespace-nowrap sm:inline">{modelLabel}</span>
      </button>

      {/* Effort 按鈕 */}
      <button
        ref={effortTriggerRef}
        type="button"
        onClick={() => setOpenDropdown((cur) => (cur === 'effort' ? null : 'effort'))}
        className="flex h-7 items-center gap-1 rounded-lg border border-border/60 bg-muted/40 px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        title={`Effort: ${effortLabel}${thinkingEnabled ? ' · Thinking ON' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={openDropdown === 'effort'}
      >
        <Gauge className={`h-3.5 w-3.5 ${thinkingEnabled ? 'text-blue-500' : 'text-purple-500'}`} />
        <span className="hidden whitespace-nowrap sm:inline">{effortLabel}</span>
      </button>

      {openDropdown && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={style || { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
          className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-xl"
          role="listbox"
        >
          {openDropdown === 'model' && (
            <>
              <div className="border-b border-border/60 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Model
              </div>
              <div className="min-h-0 overflow-y-auto py-1">
                {CLAUDE_MODELS.OPTIONS.map((option) => {
                  const selected = option.value === model;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onModelChange(option.value);
                        try { localStorage.setItem('claude-model', option.value); } catch { /* storage unavailable (private mode / quota) — preference is non-critical */ }
                        close();
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                        selected ? 'bg-accent/60' : ''
                      }`}
                    >
                      <span>{option.label}</span>
                      {selected && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {openDropdown === 'effort' && (
            <>
              {/* 標題列：Effort + Thinking 撥動開關 */}
              <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Effort
                </div>
                <label
                  className={`flex select-none items-center gap-2 text-xs ${
                    supportsAdaptiveThinking ? '' : 'opacity-40'
                  }`}
                  title={supportsAdaptiveThinking ? '' : 'Adaptive thinking not supported on this model'}
                >
                  <span className="text-foreground">Thinking</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={thinkingEnabled && supportsAdaptiveThinking}
                    disabled={!supportsAdaptiveThinking}
                    onClick={() => supportsAdaptiveThinking && onThinkingChange(!thinkingEnabled)}
                    className={`relative inline-flex h-4 w-7 flex-shrink-0 items-center rounded-full transition-colors ${
                      !supportsAdaptiveThinking
                        ? 'cursor-not-allowed bg-muted-foreground/20'
                        : thinkingEnabled
                          ? 'cursor-pointer bg-blue-500'
                          : 'cursor-pointer bg-muted-foreground/30'
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${
                        thinkingEnabled && supportsAdaptiveThinking ? 'translate-x-3.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </label>
              </div>

              <div className="min-h-0 overflow-y-auto py-1">
                {visibleEffortOptions.map((option) => {
                  const selected = option.value === effort;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onEffortChange(option.value);
                        close();
                      }}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent ${
                        selected ? 'bg-accent/60' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{option.label}</span>
                          {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{option.hint}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
