import { safeJsonParse } from '../../../lib/utils.js';
import type { ChatMessage, ClaudePermissionSuggestion, PermissionGrantResult } from '../types/types.js';
import { CLAUDE_SETTINGS_KEY, getClaudeSettings, safeLocalStorage } from './chatStorage';

export function buildClaudeToolPermissionEntry(toolName?: string, toolInput?: unknown) {
  if (!toolName) return null;
  if (toolName !== 'Bash') return toolName;

  const parsed = safeJsonParse(toolInput);
  const command = typeof parsed?.command === 'string' ? parsed.command.trim() : '';
  if (!command) return toolName;

  const tokens = command.split(/\s+/);
  if (tokens.length === 0) return toolName;

  if (tokens[0] === 'git' && tokens[1]) {
    return `Bash(${tokens[0]} ${tokens[1]}:*)`;
  }
  return `Bash(${tokens[0]}:*)`;
}

export function formatToolInputForDisplay(input: unknown) {
  if (input === undefined || input === null) return '';
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

/**
 * Every message this app can produce when it refuses a tool.
 *
 * Taken verbatim from the `canUseTool` callback in server/claude-sdk.js, which
 * is the only place a refusal originates on our side. Matching exact strings
 * rather than sniffing for permission-sounding words is deliberate: a command
 * that fails on its own (a missing file, a syntax error) must not be dressed up
 * as a permission problem, because granting the tool then changes nothing and
 * the offered rule is pure noise in the allow list.
 */
const OWN_DENIAL_MESSAGES = [
  'Tool disallowed by settings',
  'User denied tool use',
  'Permission request timed out',
  'Permission request cancelled',
];

/**
 * Refusals raised by the CLI itself, before our callback is consulted.
 *
 * Unlike the list above these were not read out of our own source, so the
 * wording is a best guess and this pattern is kept deliberately narrow. It is
 * safe in the direction that matters: a miss only costs a button that could
 * have been offered, while a false match is the exact bug being fixed here.
 */
const CLI_DENIAL_PATTERN = /requested permissions|permission to use|haven.t granted|not allowed to use/i;

function isPermissionDenial(toolResultContent: unknown): boolean {
  // Matches how MessageComponent renders it, so the check sees the same text.
  const text = String(toolResultContent || '');
  if (!text) return false;
  if (OWN_DENIAL_MESSAGES.some((message) => text.includes(message))) return true;
  return CLI_DENIAL_PATTERN.test(text);
}

export function getClaudePermissionSuggestion(
  message: ChatMessage | null | undefined,
  provider: string,
): ClaudePermissionSuggestion | null {
  if (provider !== 'claude') return null;
  if (!message?.toolResult?.isError) return null;
  // An error alone used to be enough, which meant every failed command offered
  // to grant a permission it never lacked.
  if (!isPermissionDenial(message.toolResult.content)) return null;

  const toolName = message?.toolName;
  const entry = buildClaudeToolPermissionEntry(toolName, message.toolInput);
  if (!entry) return null;

  const settings = getClaudeSettings();
  const isAllowed = settings.allowedTools.includes(entry);
  return { toolName: toolName || 'UnknownTool', entry, isAllowed };
}

export function grantClaudeToolPermission(entry: string | null): PermissionGrantResult {
  if (!entry) return { success: false };

  const settings = getClaudeSettings();
  const alreadyAllowed = settings.allowedTools.includes(entry);
  const nextAllowed = alreadyAllowed ? settings.allowedTools : [...settings.allowedTools, entry];
  const nextDisallowed = settings.disallowedTools.filter((tool) => tool !== entry);
  const updatedSettings = {
    ...settings,
    allowedTools: nextAllowed,
    disallowedTools: nextDisallowed,
    lastUpdated: new Date().toISOString(),
  };

  safeLocalStorage.setItem(CLAUDE_SETTINGS_KEY, JSON.stringify(updatedSettings));
  return { success: true, alreadyAllowed, updatedSettings };
}
