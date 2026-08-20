import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, CircleUser, ImageIcon, Plus, Sparkles, XIcon } from 'lucide-react';

import { CLAUDE_MODELS } from '../../../../../shared/modelConstants';
import {
  getEffortScale,
  getPermissionModes,
  supportsAdaptiveThinking,
} from '../../constants/composerControls';
import { useAnchoredMenu } from '../../../../hooks/useAnchoredMenu';
import AccountUsagePanel from './AccountUsagePanel';
import CompactContextButton from './CompactContextButton';
import EffortSlider from './EffortSlider';
import TokenUsagePie from './TokenUsagePie';

type ComposerToolbarProps = {
  provider: string;
  permissionMode: string;
  onPermissionModeChange: (next: string) => void;
  claudeModel: string;
  setClaudeModel: (next: string) => void;
  effort: string;
  setEffort: (next: string) => void;
  thinkingEnabled: boolean;
  setThinkingEnabled: (next: boolean) => void;
  tokenBudget: { used?: number; total?: number } | null;
  contextWindowFallback: number;
  slashCommandsCount: number;
  onToggleCommandMenu: () => void;
  openImagePicker: () => void;
  hasInput: boolean;
  onClearInput: () => void;
  onCompactContext: () => void;
  isLoading: boolean;
};

const MENU_PANEL_CLASS =
  'flex flex-col overflow-hidden rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-xl';

const TRIGGER_CLASS =
  'flex min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * The composer's control strip.
 *
 * Mirrors the layout of the Claude Code VS Code extension: two compact buttons
 * on the left (add context, slash commands) and the settings on the right.
 * Previously seven separate controls sat here, most of them rarely touched,
 * which left little room for the input itself on a phone.
 *
 * The right-hand side is two triggers rather than one: model on the left,
 * permission mode on the right. Mode is the control that actually gets
 * switched mid-conversation, and folding it in with the model meant opening a
 * menu and hunting for it every time — while the button itself could only ever
 * spell out one of the two states it stood for.
 */
export default function ComposerToolbar({
  provider,
  permissionMode,
  onPermissionModeChange,
  claudeModel,
  setClaudeModel,
  effort,
  setEffort,
  thinkingEnabled,
  setThinkingEnabled,
  tokenBudget,
  contextWindowFallback,
  slashCommandsCount,
  onToggleCommandMenu,
  openImagePicker,
  hasInput,
  onClearInput,
  onCompactContext,
  isLoading,
}: ComposerToolbarProps) {
  const { t } = useTranslation('chat');
  const [addOpen, setAddOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const closeAdd = useCallback(() => setAddOpen(false), []);
  const closeModel = useCallback(() => setModelOpen(false), []);
  const closeMode = useCallback(() => setModeOpen(false), []);

  const addMenu = useAnchoredMenu(addOpen, closeAdd, { maxWidth: 240 });
  const modelMenu = useAnchoredMenu(modelOpen, closeModel, { maxWidth: 260 });
  const modeMenu = useAnchoredMenu(modeOpen, closeMode, { maxWidth: 280 });

  const isClaude = provider === 'claude';
  const modes = getPermissionModes(provider);
  const currentMode = modes.find((mode) => mode.id === permissionMode) || modes[0];
  const CurrentModeIcon = currentMode.Icon;

  const effortScale = getEffortScale(claudeModel);
  const modelLabel = CLAUDE_MODELS.OPTIONS.find((o) => o.value === claudeModel)?.label || claudeModel;
  const canThinkAdaptively = supportsAdaptiveThinking(claudeModel);
  const currentEffortLabel = effortScale.find((option) => option.value === effort)?.label;

  const modesLabel = t('input.permissionMode', { defaultValue: 'Modes' });

  const total = tokenBudget?.total || contextWindowFallback;
  const used = tokenBudget?.used || 0;

  return (
    <div className="flex w-full items-center justify-between gap-2">
      {/* Left: add context, slash commands */}
      <div className="flex flex-shrink-0 items-center gap-1">
        <button
          ref={addMenu.triggerRef}
          type="button"
          onClick={() => setAddOpen((prev) => !prev)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={t('input.addContext', { defaultValue: 'Add context' })}
          aria-haspopup="menu"
          aria-expanded={addOpen}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleCommandMenu}
          className="relative flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={t('input.showAllCommands')}
        >
          {/* A literal slash, matching how the VS Code extension labels this.
              lucide's Slash icon reads as a "no entry" sign, not a command prefix. */}
          <span className="font-mono text-sm leading-none">/</span>
          {slashCommandsCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground">
              {slashCommandsCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-1">
        {/* Surfaces itself only when the context is filling up. */}
        {isClaude && (
          <CompactContextButton
            used={used}
            total={total}
            onCompact={onCompactContext}
            disabled={isLoading}
          />
        )}

        {/* Model */}
        {isClaude && (
          <button
            ref={modelMenu.triggerRef}
            type="button"
            onClick={() => setModelOpen((prev) => !prev)}
            className={TRIGGER_CLASS}
            title={t('input.model', { defaultValue: 'Model' })}
            aria-haspopup="menu"
            aria-expanded={modelOpen}
          >
            <span className="truncate font-medium">{modelLabel}</span>
            <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-60" />
          </button>
        )}

        {/* Permission mode, with effort tucked under it.

            Icon only: spelled out, "Bypass permissions" took a third of the
            strip on a phone, and the icon already carries which mode is on.
            The name is still in the tooltip, in the label read out by a
            screen reader, and ticked in the menu itself. */}
        <button
          ref={modeMenu.triggerRef}
          type="button"
          onClick={() => setModeOpen((prev) => !prev)}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 transition-colors hover:bg-muted"
          title={`${modesLabel}: ${currentMode.label}`}
          aria-label={`${modesLabel}: ${currentMode.label}`}
          aria-haspopup="menu"
          aria-expanded={modeOpen}
        >
          <CurrentModeIcon className={`h-4 w-4 ${currentMode.iconColor}`} />
        </button>
      </div>

      {addOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={addMenu.panelRef}
          style={addMenu.style || { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
          className={MENU_PANEL_CLASS}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              openImagePicker();
              closeAdd();
            }}
            className="flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
          >
            <ImageIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            {t('input.attachImages')}
          </button>

          {hasInput && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onClearInput();
                closeAdd();
              }}
              className="flex items-center gap-2.5 border-t border-border/60 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
            >
              <XIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              {t('input.clearInput', { defaultValue: 'Clear input' })}
            </button>
          )}
        </div>,
        document.body,
      )}

      {modelOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={modelMenu.panelRef}
          style={modelMenu.style || { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
          className={MENU_PANEL_CLASS}
          role="menu"
        >
          <div className="min-h-0 overflow-y-auto pb-1">
            <SectionHeading>{t('input.model', { defaultValue: 'Model' })}</SectionHeading>
            {CLAUDE_MODELS.OPTIONS.map((option) => {
              const selected = option.value === claudeModel;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    setClaudeModel(option.value);
                    try {
                      localStorage.setItem('claude-model', option.value);
                    } catch { /* storage unavailable (private mode / quota) — preference is non-critical */ }
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    selected ? 'bg-accent/60' : ''
                  }`}
                >
                  <span className="text-foreground">{option.label}</span>
                  {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })}
          </div>

          {/* Usage sits with the model: the context denominator is looked up
              from whichever model is selected, so the two belong together. */}
          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
            <div className="flex items-center gap-1.5" title={t('input.contextUsage', { defaultValue: 'Context used' })}>
              <TokenUsagePie used={used} total={total} />
            </div>
            <button
              type="button"
              onClick={() => {
                setAccountOpen(true);
                closeModel();
              }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <CircleUser className="h-3.5 w-3.5" />
              {t('accountUsage.title', { defaultValue: 'Account & Usage' })}
            </button>
          </div>
        </div>,
        document.body,
      )}

      {modeOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={modeMenu.panelRef}
          style={modeMenu.style || { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
          className={MENU_PANEL_CLASS}
          role="menu"
        >
          <div className="min-h-0 overflow-y-auto pb-1">
            <SectionHeading>{modesLabel}</SectionHeading>
            {modes.map((mode) => {
              const ModeIcon = mode.Icon;
              const selected = mode.id === permissionMode;
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    onPermissionModeChange(mode.id);
                    closeMode();
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent ${
                    selected ? 'bg-accent/60' : ''
                  }`}
                >
                  <ModeIcon className={`h-4 w-4 flex-shrink-0 ${mode.iconColor}`} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{mode.label}</span>
                  {selected && <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary" />}
                </button>
              );
            })}

            {isClaude && (
              <>
                <div className="mt-1 flex items-center justify-between border-t border-border/60 px-3 pb-1 pt-2.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('input.effort', { defaultValue: 'Effort' })}
                    {currentEffortLabel && (
                      <span className="ml-1 normal-case tracking-normal opacity-80">({currentEffortLabel})</span>
                    )}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={thinkingEnabled && canThinkAdaptively}
                    disabled={!canThinkAdaptively}
                    onClick={() => setThinkingEnabled(!thinkingEnabled)}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    title={
                      canThinkAdaptively
                        ? t('input.thinking', { defaultValue: 'Adaptive thinking' })
                        : `${modelLabel} has no adaptive thinking`
                    }
                  >
                    <Sparkles className={`h-3 w-3 ${thinkingEnabled && canThinkAdaptively ? 'text-primary' : ''}`} />
                    <span
                      className={`inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${
                        thinkingEnabled && canThinkAdaptively ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full bg-background transition-transform ${
                          thinkingEnabled && canThinkAdaptively ? 'translate-x-3' : 'translate-x-0.5'
                        }`}
                      />
                    </span>
                  </button>
                </div>

                <EffortSlider scale={effortScale} value={effort} onChange={setEffort} />
              </>
            )}
          </div>
        </div>,
        document.body,
      )}

      {accountOpen && <AccountUsagePanel onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
