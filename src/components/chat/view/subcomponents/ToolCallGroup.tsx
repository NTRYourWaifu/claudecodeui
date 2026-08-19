import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, TriangleAlert, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChatMessage } from '../../types/types';

type ToolCallGroupProps = {
  messages: ChatMessage[];
  defaultOpen: boolean;
  children: ReactNode;
};

/** Groups the tools by name so the summary reads in verbs, not counts. */
function summarise(messages: ChatMessage[]): string {
  const counts = new Map<string, number>();
  for (const message of messages) {
    const name = message.toolName || 'Tool';
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => (count > 1 ? name + ' x' + count : name))
    .join('、');
}

/** The first line of the first failure, which is the part worth reading. */
function firstFailure(messages: ChatMessage[]): string {
  const failed = messages.find((message) => message.toolResult?.isError);
  if (!failed) return '';
  return String(failed.toolResult?.content || '')
    .split('\n')
    .map((line) => line.trim())
    // Skip the markdown scaffolding the error is wrapped in — a row reading
    // "### Error" says nothing the red already said.
    .find((line) => line.length > 0 && !/^[#>*`_-]+\s*$/.test(line) && !/^#{1,6}\s/.test(line) && !line.startsWith('```')) || '';
}

/**
 * A run of consecutive tool calls, shown as one line until asked for.
 *
 * A working turn can fire a dozen tools between two sentences, and each one
 * took a full row — on a phone the reply itself scrolled off before it could be
 * read. The calls are still every bit as available, one tap away.
 *
 * Failures are folded in like the rest, but never silently: the row turns red,
 * counts them, and quotes the first one. Holding them out of the group instead
 * split a run into fragments around each failure, which took more room than
 * grouping had saved.
 */
export default function ToolCallGroup({ messages, defaultOpen, children }: ToolCallGroupProps) {
  const { t } = useTranslation('chat');
  const failureCount = messages.filter((message) => message.toolResult?.isError).length;
  // A run that failed opens on its own: the detail is the reason you are looking.
  const [isOpen, setIsOpen] = useState(defaultOpen || failureCount > 0);

  if (isOpen) {
    return (
      <div className="space-y-1.5 sm:space-y-2">
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="mx-3 flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground sm:mx-0"
        >
          <ChevronRight className="h-3 w-3 rotate-90 transition-transform" />
          {t('toolGroup.collapse', { count: messages.length })}
        </button>
        {children}
      </div>
    );
  }

  const failure = firstFailure(messages);

  return (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className={`mx-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded border px-2.5 py-1.5 text-left text-xs transition-colors sm:mx-0 sm:w-full ${
        failureCount > 0
          ? 'border-red-300/50 bg-red-50/40 text-red-700 hover:bg-red-50/70 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-300 dark:hover:bg-red-950/30'
          : 'border-border/40 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      }`}
    >
      {failureCount > 0 ? (
        <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0" />
      ) : (
        <Wrench className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
      )}
      <span className="min-w-0 flex-1 truncate">
        {t('toolGroup.summary', { count: messages.length })}
        {failureCount > 0 && (
          <span className="ml-1.5 font-medium">
            {t('toolGroup.failed', { count: failureCount })}
          </span>
        )}
        <span className="ml-1.5 opacity-70">{failure || summarise(messages)}</span>
      </span>
      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
    </button>
  );
}
