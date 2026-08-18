import { Hand, Code2, Bot, ClipboardList, Zap } from 'lucide-react';
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
  description: string;
  Icon: LucideIcon;
  /** Tailwind colour token for the icon. */
  iconColor: string;
  /** Colour of the dot shown next to the active mode on the trigger. */
  dotClass: string;
};

export const CLAUDE_PERMISSION_MODES: PermissionModeDef[] = [
  {
    id: 'default',
    label: 'Ask before edits',
    description: 'Claude will ask for approval before making each edit',
    Icon: Hand,
    iconColor: 'text-orange-500',
    dotClass: 'bg-muted-foreground',
  },
  {
    id: 'acceptEdits',
    label: 'Edit automatically',
    description: 'Claude will edit your selected text or the whole file',
    Icon: Code2,
    iconColor: 'text-green-500',
    dotClass: 'bg-green-500',
  },
  {
    id: 'auto',
    label: 'Auto (classifier)',
    description: 'A classifier decides per tool call whether to approve. Hands-off, but safer than Bypass.',
    Icon: Bot,
    iconColor: 'text-blue-500',
    dotClass: 'bg-blue-500',
  },
  {
    id: 'plan',
    label: 'Plan mode',
    description: 'Claude will explore the code and present a plan before editing',
    Icon: ClipboardList,
    iconColor: 'text-primary',
    dotClass: 'bg-primary',
  },
  {
    id: 'bypassPermissions',
    label: 'Bypass permissions',
    description: 'Claude will not ask for approval before running potentially dangerous commands',
    Icon: Zap,
    iconColor: 'text-orange-500',
    dotClass: 'bg-orange-500',
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
  { value: 'xhigh', label: 'XHigh', hint: 'Deeper than high — Opus 5/4.8 only' },
  { value: 'max', label: 'Max', hint: 'Maximum effort — Opus 5/4.8, Sonnet 5' },
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

/** Haiku 4.5 supports extended thinking but not the adaptive variant. */
export const NO_ADAPTIVE_THINKING = new Set(['claude-haiku-4-5']);

export function supportsAdaptiveThinking(model: string): boolean {
  return !NO_ADAPTIVE_THINKING.has(model);
}
