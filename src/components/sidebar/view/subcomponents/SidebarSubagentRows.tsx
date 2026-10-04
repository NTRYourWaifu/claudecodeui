import { useState } from 'react';
import { Bot, ChevronRight } from 'lucide-react';
import type { TFunction } from 'i18next';

import { cn } from '../../../../lib/utils';
import type { ProjectSession } from '../../../../types/app';
import type { SessionWithProvider } from '../../types/types';
import { createSessionViewModel, formatCompactSessionAge } from '../../utils/utils';

type SidebarSubagentRowsProps = {
  parent: SessionWithProvider;
  selectedSession: ProjectSession | null;
  currentTime: Date;
  onSelect: (session: SessionWithProvider) => void;
  t: TFunction;
};

/**
 * The subagent runs a conversation started, tucked under it.
 *
 * Each is a conversation of its own and opens like one, but listed alongside
 * the rest they read as conversations the user had, which they were not.
 * Folded by default, since a single turn can start a dozen; open on its own
 * while one of them is the conversation being viewed.
 */
export default function SidebarSubagentRows({
  parent,
  selectedSession,
  currentTime,
  onSelect,
  t,
}: SidebarSubagentRowsProps) {
  const subagents = (Array.isArray(parent.subagents) ? parent.subagents : []) as ProjectSession[];
  const holdsSelected = subagents.some((session) => session.id === selectedSession?.id);
  const [isOpen, setIsOpen] = useState(holdsSelected);

  if (subagents.length === 0) return null;
  const open = isOpen || holdsSelected;

  return (
    <div className="ml-4">
      <button
        type="button"
        onClick={() => setIsOpen(!open)}
        className="flex items-center gap-1 px-1 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
        {t('sessions.subagents', { count: subagents.length, defaultValue: '{{count}} subagents' })}
      </button>
      {open && (
        <div className="space-y-0.5 border-l border-border/60 pl-2">
          {subagents.map((session) => {
            const child: SessionWithProvider = { ...session, __provider: parent.__provider };
            const view = createSessionViewModel(child, t);
            const age = formatCompactSessionAge(view.sessionTime, currentTime);
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelect(child)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent/50',
                  selectedSession?.id === session.id && 'bg-accent text-accent-foreground',
                )}
              >
                <Bot className="h-3 w-3 flex-shrink-0 opacity-70" />
                <span className="truncate">{view.sessionName}</span>
                {age && <span className="ml-auto flex-shrink-0 opacity-70">{age}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
