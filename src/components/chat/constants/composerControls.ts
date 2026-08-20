import { Code2, Hand, Notebook, Unlock, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Shared definitions for the composer's control menu.
 *
 * These used to live inside the individual selector components. They are here
 * so the toolbar and anything else that needs them read from one definition
 * instead of drifting copies.
 */

export type PermissionModeDef = {
  id: string;
  label: string;
  Icon: LucideIcon;
  /** Tailwind colour token for the icon. */
  iconColor: string;
};

/**
 * Labels and order mirror the Claude Code mode switcher, so that someone who
 * knows the desktop client recognises this list at a glance. The descriptions
 * that used to sit under each label are gone: they turned every row into two
 * lines of prose for a choice that is made in a second, and on a phone that
 * cost most of the panel.
 */
export const CLAUDE_PERMISSION_MODES: PermissionModeDef[] = [
  {
    id: 'default',
    label: 'Manual',
    Icon: Hand,
    iconColor: 'text-orange-500',
  },
  {
    id: 'acceptEdits',
    label: 'Edit automatically',
    Icon: Code2,
    iconColor: 'text-green-500',
  },
  {
    id: 'plan',
    label: 'Plan',
    Icon: Notebook,
    iconColor: 'text-primary',
  },
  {
    id: 'auto',
    label: 'Auto',
    Icon: Zap,
    iconColor: 'text-amber-500',
  },
  {
    id: 'bypassPermissions',
    label: 'Bypass permissions',
    Icon: Unlock,
    iconColor: 'text-red-500',
  },
];

/** Codex / Gemini have no classifier-driven mode. */
export const NON_CLAUDE_PERMISSION_MODES: PermissionModeDef[] = CLAUDE_PERMISSION_MODES.filter(
  (mode) => mode.id !== 'auto',
);

export function getPermissionModes(provider: string): PermissionModeDef[] {
  return provider === 'claude' ? CLAUDE_PERMISSION_MODES : NON_CLAUDE_PERMISSION_MODES;
}

export type EffortOption = {
  value: string;
  label: string;
  hint: string;
};

export const ALL_EFFORT_OPTIONS: EffortOption[] = [
  { value: 'low', label: 'Low', hint: 'Minimal thinking, fastest' },
  { value: 'medium', label: 'Medium', hint: 'Moderate thinking' },
  { value: 'high', label: 'High', hint: 'Deep reasoning (default)' },
  { value: 'xhigh', label: 'XHigh', hint: 'Deeper than high' },
  { value: 'max', label: 'Max', hint: 'Maximum effort' },
];

/**
 * Effort levels differ per model: xhigh is Opus-only, max is Opus + Sonnet.
 * Offering an unsupported level would send a request the model rejects.
 */
export function getSupportedEfforts(model: string): Set<string> {
  if (model === 'claude-opus-5' || model === 'claude-opus-4-8') {
    return new Set(['low', 'medium', 'high', 'xhigh', 'max']);
  }
  if (model === 'claude-sonnet-5') {
    return new Set(['low', 'medium', 'high', 'max']);
  }
  // Haiku 4.5
  return new Set(['low', 'medium', 'high']);
}

/**
 * The effort levels a model actually offers, in order — this is the scale the
 * slider runs along, so its length changes with the model (5 steps on Opus,
 * 4 on Sonnet, 3 on Haiku).
 */
export function getEffortScale(model: string): EffortOption[] {
  const supported = getSupportedEfforts(model);
  return ALL_EFFORT_OPTIONS.filter((option) => supported.has(option.value));
}

/**
 * Pull an effort level back onto a model's scale.
 *
 * The stored preference is global while the scale is per-model, so switching
 * Opus (max) → Haiku leaves a value that model cannot serve. That used to be
 * invisible — the old list simply showed nothing ticked — but a slider has to
 * point somewhere, and the request would have gone out with an effort the
 * model rejects either way. Clamps down to the highest level on offer.
 */
export function clampEffort(model: string, effort: string): string {
  const scale = getEffortScale(model);
  if (scale.some((option) => option.value === effort)) return effort;
  return scale[scale.length - 1]?.value || 'high';
}

/** Haiku 4.5 supports extended thinking but not the adaptive variant. */
export const NO_ADAPTIVE_THINKING = new Set(['claude-haiku-4-5']);

export function supportsAdaptiveThinking(model: string): boolean {
  return !NO_ADAPTIVE_THINKING.has(model);
}
