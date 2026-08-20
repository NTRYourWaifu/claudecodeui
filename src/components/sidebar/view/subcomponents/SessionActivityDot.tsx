import type { TFunction } from 'i18next';

import { cn } from '../../../../lib/utils';
import { useSessionActivity } from '../../../../contexts/SessionActivityContext';

type SessionActivityDotProps = {
  sessionId: string;
  lastActivity: string | number | Date | null | undefined;
  /** Tailwind size classes, so each list can match its own row density. */
  sizeClassName?: string;
  className?: string;
  t: TFunction;
};

/**
 * The status dot next to a session in the sidebar.
 *
 * Orange and pulsing means the session is running. Steady green means it
 * finished and the result has not been opened yet. Nothing at all means there
 * is no reason to go in.
 */
export default function SessionActivityDot({
  sessionId,
  lastActivity,
  sizeClassName = 'h-2 w-2',
  className,
  t,
}: SessionActivityDotProps) {
  const { isSessionRunning, hasUnseenResult } = useSessionActivity();

  const isRunning = isSessionRunning(sessionId);
  const isUnseen = !isRunning && hasUnseenResult(sessionId, lastActivity);

  if (!isRunning && !isUnseen) return null;

  const label = isRunning
    ? t('sessions.statusRunning', 'Working')
    : t('sessions.statusUnread', 'Finished, not opened yet');

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        // `block` is load-bearing: a bare span stays inline, where width and
        // height are ignored and the dot renders as a 0x0 box.
        'block flex-shrink-0 rounded-full',
        sizeClassName,
        isRunning ? 'animate-pulse bg-orange-500' : 'bg-green-500',
        className,
      )}
    />
  );
}
