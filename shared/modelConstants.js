/**
 * Centralized Model Definitions
 * Single source of truth for all supported AI models
 */

/**
 * Claude (Anthropic) Models
 *
 * Note: Claude uses two different formats:
 * - SDK format ('sonnet', 'opus') - used by the UI and claude-sdk.js
 * - API format ('claude-sonnet-4.5') - used by slash commands for display
 */
export const CLAUDE_MODELS = {
  // 根據 Anthropic 官方 docs (platform.claude.com/docs/en/about-claude/models/overview)
  // 一律用 versioned ID（官方建議：避免 alias 在新版發佈時自動切換造成行為改變）
  OPTIONS: [
    { value: "claude-opus-5", label: "Opus 5" },         // 旗艦最新 (1M context, adaptive thinking, $5/$25, 2026-07-24, cutoff 2026-05)
    { value: "claude-opus-4-8", label: "Opus 4.8" },     // 旗艦上一代 (1M context, adaptive thinking, fast mode, $5/$25)
    { value: "claude-sonnet-5", label: "Sonnet 5" },     // 平衡最新 (1M context, ext+adaptive thinking, $3/$15, 2026-06-30)
    { value: "claude-haiku-4-5", label: "Haiku 4.5" },   // 最快 (200k context, extended thinking 無 adaptive, $1/$5)
  ],

  DEFAULT: "claude-opus-5",
};

/**
 * Context window sizes, in tokens, used as the denominator of the context
 * usage gauge.
 *
 * These are matched by substring rather than by exact id on purpose: the ids
 * that actually arrive at runtime carry date suffixes (e.g. the key of the
 * SDK's `modelUsage` map, or the `model` field inside a transcript line), and
 * an exact-match table silently falls back to the default every time a new
 * dated build ships.
 *
 * Order matters — the first matching entry wins.
 */
const CLAUDE_CONTEXT_WINDOW_RULES = [
  { match: "haiku", contextWindow: 200_000 },
  { match: "opus", contextWindow: 1_000_000 },
  { match: "sonnet", contextWindow: 1_000_000 },
];

/** Used when the model is unknown/absent. Deliberately the smaller value: */
/** under-reporting the budget is safer than claiming headroom that isn't there. */
export const DEFAULT_CLAUDE_CONTEXT_WINDOW = 200_000;

/**
 * Resolve the context window for a Claude model id.
 *
 * `CONTEXT_WINDOW` in the environment still wins when set, so a deliberate
 * per-machine budget override keeps working; it is read by the callers rather
 * than here so this stays a pure function.
 *
 * @param {string | null | undefined} model
 * @returns {number} context window in tokens
 */
export function getClaudeContextWindow(model) {
  if (!model || typeof model !== "string") return DEFAULT_CLAUDE_CONTEXT_WINDOW;
  const normalized = model.toLowerCase();
  const rule = CLAUDE_CONTEXT_WINDOW_RULES.find((candidate) => normalized.includes(candidate.match));
  return rule ? rule.contextWindow : DEFAULT_CLAUDE_CONTEXT_WINDOW;
}

/**
 * Cursor Models
 */
export const CURSOR_MODELS = {
  OPTIONS: [
    { value: "opus-4.6-thinking", label: "Claude 4.6 Opus (Thinking)" },
    { value: "gpt-5.3-codex", label: "GPT-5.3" },
    { value: "gpt-5.2-high", label: "GPT-5.2 High" },
    { value: "gemini-3-pro", label: "Gemini 3 Pro" },
    { value: "opus-4.5-thinking", label: "Claude 4.5 Opus (Thinking)" },
    { value: "gpt-5.2", label: "GPT-5.2" },
    { value: "gpt-5.1", label: "GPT-5.1" },
    { value: "gpt-5.1-high", label: "GPT-5.1 High" },
    { value: "composer-1", label: "Composer 1" },
    { value: "auto", label: "Auto" },
    { value: "sonnet-4.5", label: "Claude 4.5 Sonnet" },
    { value: "sonnet-4.5-thinking", label: "Claude 4.5 Sonnet (Thinking)" },
    { value: "opus-4.5", label: "Claude 4.5 Opus" },
    { value: "gpt-5.1-codex", label: "GPT-5.1 Codex" },
    { value: "gpt-5.1-codex-high", label: "GPT-5.1 Codex High" },
    { value: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max" },
    { value: "gpt-5.1-codex-max-high", label: "GPT-5.1 Codex Max High" },
    { value: "opus-4.1", label: "Claude 4.1 Opus" },
    { value: "grok", label: "Grok" },
  ],

  DEFAULT: "gpt-5.3-codex",
};

/**
 * Codex (OpenAI) Models
 */
export const CODEX_MODELS = {
  OPTIONS: [
    { value: "gpt-5.5", label: "GPT-5.5" },
    { value: "gpt-5.4", label: "GPT-5.4" },
    { value: "gpt-5.4-mini", label: "GPT-5.4 mini" },
    { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
    { value: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
    { value: "gpt-5.2", label: "GPT-5.2" },
    { value: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max" },
    { value: "o3", label: "O3" },
    { value: "o4-mini", label: "O4-mini" },
  ],

  DEFAULT: "gpt-5.4",
};

/**
 * Gemini Models
 */
export const GEMINI_MODELS = {
  OPTIONS: [
    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
    { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-2.0-pro-exp", label: "Gemini 2.0 Pro Experimental" },
    {
      value: "gemini-2.0-flash-thinking-exp",
      label: "Gemini 2.0 Flash Thinking",
    },
  ],

  DEFAULT: "gemini-3.1-pro-preview",
};

/**
 * Grok (xAI) Models
 *
 * Mirrors `grok models`; Grok Build exposes only the two current builds.
 */
export const GROK_MODELS = {
  OPTIONS: [
    { value: "grok-4.6", label: "Grok 4.6" },   // 預設
    { value: "grok-4.5", label: "Grok 4.5" },
  ],

  DEFAULT: "grok-4.6",
};

/**
 * Ordered provider registry. Display order in selection UIs.
 */
export const PROVIDERS = [
  { id: "claude", name: "Anthropic", models: CLAUDE_MODELS },
  { id: "codex", name: "OpenAI", models: CODEX_MODELS },
  { id: "gemini", name: "Google", models: GEMINI_MODELS },
  { id: "cursor", name: "Cursor", models: CURSOR_MODELS },
  { id: "grok", name: "xAI", models: GROK_MODELS },
];
