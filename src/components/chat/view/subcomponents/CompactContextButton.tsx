import { useTranslation } from 'react-i18next';

import TokenUsagePie from './TokenUsagePie';

/**
 * Context usage passes this before the button appears. Below it the gauge stays
 * tucked away in the settings menu, since there is nothing to act on yet.
 *
 * 40% is deliberately early: compacting is most useful while there is still
 * room to keep working afterwards, and a warning that only arrives near the
 * limit leaves no time to act on it.
 */
export const COMPACT_PROMPT_THRESHOLD = 0.4;

type CompactContextButtonProps = {
  used: number;
  total: number;
  onCompact: () => void;
  disabled?: boolean;
};

/**
 * The context gauge, promoted to a button once the conversation is long enough
 * that compacting is worth offering.
 *
 * Mirrors how Claude Code surfaces this: a small live gauge that only shows up
 * near the limit, explains itself on hover, and compacts when clicked. Kept
 * silent below the threshold so it is not one more permanent icon in a row the
 * rest of this overhaul spent effort thinning out.
 */
export default function CompactContextButton({
  used,
  total,
  onCompact,
  disabled,
}: CompactContextButtonProps) {
  const { t } = useTranslation('chat');

  if (!total || total <= 0) return null;

  const ratio = used / total;
  if (ratio < COMPACT_PROMPT_THRESHOLD) return null;

  const remainingPercent = Math.max(0, Math.round((1 - ratio) * 100));

  return (
    <button
      type="button"
      onClick={onCompact}
      disabled={disabled}
      title={t('input.compactHint', {
        defaultValue: '{{percent}}% of context remaining. Click to compact now.',
        percent: remainingPercent,
      })}
      aria-label={t('input.compactAria', { defaultValue: 'Compact conversation to free up context' })}
      className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-1 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      <TokenUsagePie used={used} total={total} />
    </button>
  );
}
