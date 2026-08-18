import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, CircleUser, ImageIcon, Plus, SlidersHorizontal, Sparkles, XIcon } from 'lucide-react';

import { CLAUDE_MODELS } from '../../../../../shared/modelConstants';
import {
  ALL_EFFORT_OPTIONS,
  getPermissionModes,
  getSupportedEfforts,
  supportsAdaptiveThinking,
} from '../../constants/composerControls';
import { useUpwardPopover } from '../../hooks/useUpwardPopover';
import AccountUsagePanel from './AccountUsagePanel';
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
};

const MENU_PANEL_CLASS =
  'flex flex-col overflow-hidden rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-xl';

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
 * on the left (add context, slash commands) and a single settings menu on the
 * right. Previously seven separate controls sat here, most of them rarely
 * touched, which left little room for the input itself on a phone.
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
}: ComposerToolbarProps) {
  const { t } = useTranslation('chat');
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const closeAdd = useCallback(() => setAddOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const addMenu = useUpwardPopover(addOpen, closeAdd, 240);
  const settingsMenu = useUpwardPopover(settingsOpen, closeSettings, 320);

  const isClaude = provider === 'claude';
  const modes = getPermissionModes(provider);
  const currentMode = modes.find((mode) => mode.id === permissionMode) || modes[0];
  const CurrentModeIcon = currentMode.Icon;

  const supportedEfforts = getSupportedEfforts(claudeModel);
  const efforts = ALL_EFFORT_OPTIONS.filter((option) => supportedEfforts.has(option.value));
  const modelLabel = CLAUDE_MODELS.OPTIONS.find((o) => o.value === claudeModel)?.label || claudeModel;
  const canThinkAdaptively = supportsAdaptiveThinking(claudeModel);

  const total = tokenBudget?.total || contextWindowFallback;
  const used = tokenBudget?.used || 0;

  return (
    <div className="flex w-full items-center justify-between gap-2">
      {/* Left: add context, slash commands */}
      <div className="flex items-center gap-1">
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

      {/* Right: one settings menu, labelled with the state it controls */}
      <button
        ref={settingsMenu.triggerRef}
        type="button"
        onClick={() => setSettingsOpen((prev) => !prev)}
        className="flex min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title={t('input.composerSettings', { defaultValue: 'Model, effort and permissions' })}
        aria-haspopup="menu"
        aria-expanded={settingsOpen}
      >
        <CurrentModeIcon className={`h-3.5 w-3.5 flex-shrink-0 ${currentMode.iconColor}`} />
        {isClaude && <span className="hidden truncate font-medium sm:inline">{modelLabel}</span>}
        <SlidersHorizontal className="h-3 w-3 flex-shrink-0 opacity-60" />
      </button>

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

      {settingsOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={settingsMenu.panelRef}
          style={settingsMenu.style || { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
          className={MENU_PANEL_CLASS}
          role="menu"
        >
          <div className="min-h-0 overflow-y-auto pb-1">
            <SectionHeading>{t('input.permissionMode', { defaultValue: 'Permissions' })}</SectionHeading>
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
                    closeSettings();
                  }}
                  className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent ${
                    selected ? 'bg-accent/60' : ''
                  }`}
                >
                  <ModeIcon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${mode.iconColor}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground">{mode.label}</span>
                      {selected && <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary" />}
                    </div>
                    <div className="text-[11px] leading-snug text-muted-foreground">{mode.description}</div>
                  </div>
                </button>
              );
            })}

            {isClaude && (
              <>
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

                <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('input.effort', { defaultValue: 'Effort' })}
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

                {efforts.map((option) => {
                  const selected = option.value === effort;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => setEffort(option.value)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent ${
                        selected ? 'bg-accent/60' : ''
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="text-sm text-foreground">{option.label}</span>
                        <span className="ml-1.5 text-[11px] text-muted-foreground">{option.hint}</span>
                      </span>
                      {selected && <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </>
            )}
          </div>

          {/* Usage lives at the bottom: it is status, not a setting. */}
          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
            <div className="flex items-center gap-1.5" title={t('input.contextUsage', { defaultValue: 'Context used' })}>
              <TokenUsagePie used={used} total={total} />
            </div>
            {isClaude && (
              <button
                type="button"
                onClick={() => {
                  setAccountOpen(true);
                  closeSettings();
                }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <CircleUser className="h-3.5 w-3.5" />
                {t('accountUsage.title', { defaultValue: 'Account & Usage' })}
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}

      {accountOpen && <AccountUsagePanel onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
