import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Loader2, TriangleAlert, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChatMessage } from '../../types/types';
import { useThinkingProgress } from '../../utils/thinkingProgress';

type ToolCallGroupProps = {
  messages: ChatMessage[];
  defaultOpen: boolean;
  /** The turn is still running: show only what it is doing right now. */
  live?: boolean;
  children: ReactNode;
};

/** `mcp__browser-headless__browser_evaluate` reads as `browser_evaluate`. */
function shortName(name: string | undefined): string {
  if (!name) return 'Tool';
  return name.startsWith('mcp__') ? name.split('__').slice(2).join('__') || name : name;
}

/** Groups the tools by name so the summary reads in verbs, not counts. */
function summarise(messages: ChatMessage[]): string {
  const counts = new Map<string, number>();
  for (const message of messages) {
    if (!message.isToolUse) continue;
    const name = shortName(message.toolName);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => (count > 1 ? name + ' x' + count : name))
    .join('、');
}

const BRIEF_FIELDS = ['command', 'description', 'file_path', 'path', 'pattern', 'query', 'url', 'skill', 'prompt'];

/** The one argument that says what a call is about, e.g. the command a Bash call runs. */
function brief(message: ChatMessage): string {
  let input: unknown = message.toolInput;
  if (typeof input === 'string') {
    const raw = input;
    try {
      input = JSON.parse(raw);
    } catch {
      return raw.slice(0, 80);
    }
  }
  if (!input || typeof input !== 'object') return '';
  const record = input as Record<string, unknown>;
  for (const field of BRIEF_FIELDS) {
    const value = record[field];
    if (typeof value !== 'string' || !value.trim()) continue;
    // A path reads best as the file it names.
    const text = field.endsWith('path') ? value.split(/[\\/]/).pop() || value : value;
    return text.replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  return '';
}

/** Ticks once a second while mounted, for the thinking timer. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * Everything a turn did on the way to its answer — tool calls, thinking, the
 * notes written in between — shown as one line until asked for.
 *
 * A working turn can fire dozens of tools, and on a phone the answer itself
 * scrolled off before it could be read. Once the turn is over the line counts
 * the calls and the failures; the failures are only counted, never quoted or
 * opened, since a quoted error took more room than the rest of the run. While
 * the turn runs the same line shows just the latest step, so there is still
 * something moving to say it is alive.
 */
export default function ToolCallGroup({ messages, defaultOpen, live = false, children }: ToolCallGroupProps) {
  const { t } = useTranslation('chat');
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const thinking = useThinkingProgress();
  const now = useNow(live && Boolean(thinking));

  const toolCount = messages.filter((message) => message.isToolUse).length;
  const failureCount = messages.filter((message) => message.isToolUse && message.toolResult?.isError).length;
  // Exact, from the finished messages; nothing streamed says it any sooner.
  const thinkingTokens = messages.reduce((sum, message) => sum + (Number(message.thinkingTokens) || 0), 0);
  // A turn that only thought is labelled by the thinking count alone.
  const label = toolCount > 0
    ? t('toolGroup.summary', { count: toolCount })
    : thinkingTokens > 0 ? '' : t('toolGroup.process');

  if (isOpen) {
    return (
      <div className="space-y-1.5 sm:space-y-2">
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="mx-3 flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground sm:mx-0"
        >
          <ChevronRight className="h-3 w-3 rotate-90 transition-transform" />
          {toolCount > 0 ? t('toolGroup.collapse', { count: toolCount }) : t('toolGroup.collapseProcess')}
        </button>
        {children}
      </div>
    );
  }

  if (live) {
    const latest = messages[messages.length - 1];
    let step: ReactNode;
    if (thinking) {
      const seconds = Math.max(0, Math.floor((now - thinking.startedAt) / 1000));
      step = (
        <>
          <span className="font-medium text-foreground/80">{t('toolGroup.thinking')}</span>
          <span className="ml-1.5 tabular-nums opacity-70">{t('toolGroup.seconds', { count: seconds })}</span>
        </>
      );
    } else if (latest?.isToolUse) {
      step = (
        <>
          <span className="opacity-70">{t('toolGroup.step', { count: toolCount })}</span>
          <span className="ml-1.5 font-medium text-foreground/80">{shortName(latest.toolName)}</span>
          <span className="ml-1.5 opacity-70">{brief(latest)}</span>
        </>
      );
    } else {
      step = <span className="font-medium text-foreground/80">{t('toolGroup.working')}</span>;
    }

    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mx-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded border border-border/40 bg-muted/30 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 sm:mx-0 sm:w-full"
      >
        <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin opacity-70" />
        <span className="min-w-0 flex-1 truncate">{step}</span>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="mx-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded border border-border/40 bg-muted/30 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground sm:mx-0 sm:w-full"
    >
      {failureCount > 0 ? (
        <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0 text-red-500/80" />
      ) : (
        <Wrench className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
      )}
      <span className="min-w-0 flex-1 truncate">
        {label}
        {failureCount > 0 && (
          <span className="ml-1.5 font-medium text-red-600 dark:text-red-400">
            {t('toolGroup.failed', { count: failureCount })}
          </span>
        )}
        {thinkingTokens > 0 && (
          <span className="ml-1.5 tabular-nums opacity-70">{t('toolGroup.thinkingTokens', { tokens: thinkingTokens.toLocaleString() })}</span>
        )}
        <span className="ml-1.5 opacity-70">{summarise(messages)}</span>
      </span>
      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
    </button>
  );
}
