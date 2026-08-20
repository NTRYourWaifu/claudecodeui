import { Folder, MessageSquare } from 'lucide-react';
import type { TFunction } from 'i18next';

import { cn } from '../../../../lib/utils';
import type { Project, ProjectSession } from '../../../../types/app';
import type { SessionWithProvider } from '../../types/types';
import SessionProviderLogo from '../../../llm-logo-provider/SessionProviderLogo';
import { collectRecentSessions, createSessionViewModel, formatCompactSessionAge } from '../../utils/utils';
import SessionActivityDot from './SessionActivityDot';

const RECENT_SESSIONS_LIMIT = 50;

type SidebarRecentConversationsProps = {
  projects: Project[];
  selectedSession: ProjectSession | null;
  currentTime: Date;
  searchFilter: string;
  isLoading: boolean;
  onSelect: (project: Project, session: SessionWithProvider) => void;
  t: TFunction;
};

/**
 * Flat, recency-sorted conversation list for the sidebar's Conversations tab.
 * Unlike the Projects tab it does not group by project — each row carries its
 * own project label so recent work across every workspace reads as one stream.
 */
export default function SidebarRecentConversations({
  projects,
  selectedSession,
  currentTime,
  searchFilter,
  isLoading,
  onSelect,
  t,
}: SidebarRecentConversationsProps) {
  const recentSessions = collectRecentSessions(projects, searchFilter, RECENT_SESSIONS_LIMIT);

  if (isLoading) {
    return (
      <div className="px-4 py-12 text-center md:py-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
        <p className="text-sm text-muted-foreground">{t('search.searching')}</p>
      </div>
    );
  }

  if (recentSessions.length === 0) {
    return (
      <div className="px-4 py-12 text-center md:py-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
          <MessageSquare className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-base font-medium text-foreground md:mb-1">
          {searchFilter.trim()
            ? t('search.noResults')
            : t('search.recentEmptyTitle', 'No conversations yet')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {searchFilter.trim()
            ? t('search.tryDifferentQuery')
            : t('search.recentEmptyDescription', 'Start a session in any project and it will show up here.')}
        </p>
      </div>
    );
  }

  return (
    <div className="pb-safe-area-inset-bottom space-y-0.5 px-2">
      <p className="px-1 py-1 text-xs text-muted-foreground">
        {t('search.recentHeading', 'Recent conversations')}
      </p>
      {recentSessions.map(({ project, session }) => {
        const sessionView = createSessionViewModel(session, t);
        const isSelected = selectedSession?.id === session.id;
        const compactAge = formatCompactSessionAge(sessionView.sessionTime, currentTime);

        return (
          <button
            key={`${project.projectId}-${session.__provider}-${session.id}`}
            className={cn(
              'w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50',
              isSelected && 'bg-accent text-accent-foreground',
            )}
            onClick={() => onSelect(project, session)}
          >
            <div className="flex items-center gap-2">
              <SessionActivityDot
                sessionId={session.id}
                lastActivity={sessionView.sessionTime}
                sizeClassName="h-1.5 w-1.5"
                t={t}
              />
              <SessionProviderLogo provider={session.__provider} className="h-3 w-3 flex-shrink-0" />
              <span className="truncate text-xs font-medium text-foreground">{sessionView.sessionName}</span>
              {compactAge && (
                <span className="ml-auto flex-shrink-0 text-[11px] text-muted-foreground">{compactAge}</span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 pl-5">
              <Folder className="h-3 w-3 flex-shrink-0 text-muted-foreground/70" />
              <span className="truncate text-[11px] text-muted-foreground">
                {project.displayName || project.projectId}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
