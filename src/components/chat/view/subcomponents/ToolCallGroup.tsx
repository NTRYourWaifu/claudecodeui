import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Wrench } from 'lucide-react';
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

/**
 * A run of consecutive tool calls, shown as one line until asked for.
 *
 * A working turn can fire a dozen tools between two sentences, and each one
 * took a full row — on a phone the reply itself scrolled off before it could be
 * read. The calls are still every bit as available, one tap away.
 *
 * Errors are deliberately not folded in: whatever went wrong has to stay on
 * screen, so a run containing one is left expanded.
 */
export default function ToolCallGroup({ messages, defaultOpen, children }: ToolCallGroupProps) {
  const { t } = useTranslation('chat');
  const [isOpen, setIsOpen] = useState(defaultOpen);

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

  return (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="mx-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded border border-border/40 bg-muted/30 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground sm:mx-0 sm:w-full"
    >
      <Wrench className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 truncate">
        {t('toolGroup.summary', { count: messages.length })}
        <span className="ml-1.5 opacity-70">{summarise(messages)}</span>
      </span>
      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
    </button>
  );
}
