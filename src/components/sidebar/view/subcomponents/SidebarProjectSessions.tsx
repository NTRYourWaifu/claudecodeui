import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Button } from '../../../../shared/view/ui';
import type { Project, ProjectSession, LLMProvider } from '../../../../types/app';
import type { SessionWithProvider } from '../../types/types';

import SidebarSessionItem from './SidebarSessionItem';

const INITIAL_VISIBLE_SESSIONS = 5;
const VISIBLE_SESSIONS_STEP = 5;

type SidebarProjectSessionsProps = {
  project: Project;
  isExpanded: boolean;
  sessions: SessionWithProvider[];
  selectedSession: ProjectSession | null;
  initialSessionsLoaded: boolean;
  hasMoreSessions: boolean;
  isLoadingMoreSessions: boolean;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (
    projectName: string,
    sessionId: string,
    sessionTitle: string,
    provider: LLMProvider,
  ) => void;
  onLoadMoreSessions: (projectId: string) => void;
  onNewSession: (project: Project) => void;
  t: TFunction;
};

function SessionListSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-md p-2">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 h-3 w-3 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1">
              <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${60 + index * 15}%` }} />
              <div className="h-2 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export default function SidebarProjectSessions({
  project,
  isExpanded,
  sessions,
  selectedSession,
  initialSessionsLoaded,
  hasMoreSessions,
  isLoadingMoreSessions,
  currentTime,
  editingSession,
  editingSessionName,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onProjectSelect,
  onSessionSelect,
  onDeleteSession,
  onLoadMoreSessions,
  onNewSession,
  t,
}: SidebarProjectSessionsProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_SESSIONS);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset the visible window whenever the panel collapses or the project context
  // changes, so re-opening a project always starts from the most recent N entries.
  useEffect(() => {
    if (!isExpanded) {
      setVisibleCount(INITIAL_VISIBLE_SESSIONS);
    }
  }, [isExpanded, project.projectId]);

  // Clamp visibleCount back down if sessions shrink (e.g. after deletion) so we
  // never render a stale "show more" gap.
  useEffect(() => {
    setVisibleCount((current) => {
      const target = Math.max(INITIAL_VISIBLE_SESSIONS, Math.min(current, sessions.length || INITIAL_VISIBLE_SESSIONS));
      return target;
    });
  }, [sessions.length]);

  const hasMoreLocal = visibleCount < sessions.length;
  const reachedLocalEnd = !hasMoreLocal;
  const canFetchMore = reachedLocalEnd && hasMoreSessions && !isLoadingMoreSessions;

  // Infinite scroll: when the sentinel below the list comes into view, either
  // grow the local window or, if exhausted, ask the controller to fetch more
  // from the backend. The observer only attaches while the panel is expanded.
  useEffect(() => {
    if (!isExpanded) {
      return;
    }
    const node = sentinelRef.current;
    if (!node) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }
        if (hasMoreLocal) {
          setVisibleCount((current) => Math.min(current + VISIBLE_SESSIONS_STEP, sessions.length));
        } else if (canFetchMore) {
          onLoadMoreSessions(project.projectId);
        }
      },
      { rootMargin: '120px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isExpanded, hasMoreLocal, canFetchMore, sessions.length, project.projectId, onLoadMoreSessions]);

  if (!isExpanded) {
    return null;
  }

  const hasSessions = sessions.length > 0;
  const visibleSessions = sessions.slice(0, visibleCount);
  const showSentinel = hasSessions && (hasMoreLocal || hasMoreSessions);

  return (
    <div className="ml-3 space-y-1 border-l border-border pl-3">
      <div className="px-3 pb-1 pt-1 md:hidden">
        <button
          className="flex h-8 w-full items-center justify-center gap-2 rounded-md bg-primary text-xs font-medium text-primary-foreground transition-all duration-150 hover:bg-primary/90 active:scale-[0.98]"
          onClick={() => {
            onProjectSelect(project);
            onNewSession(project);
          }}
        >
          <Plus className="h-3 w-3" />
          {t('sessions.newSession')}
        </button>
      </div>

      <Button
        variant="default"
        size="sm"
        className="hidden h-8 w-full justify-start gap-2 bg-primary text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 md:flex"
        onClick={() => onNewSession(project)}
      >
        <Plus className="h-3 w-3" />
        {t('sessions.newSession')}
      </Button>

      {!initialSessionsLoaded ? (
        <SessionListSkeleton />
      ) : !hasSessions ? (
        <div className="px-3 py-2 text-left">
          <p className="text-xs text-muted-foreground">{t('sessions.noSessions')}</p>
        </div>
      ) : (
        <>
          {visibleSessions.map((session) => (
            <SidebarSessionItem
              key={session.id}
              project={project}
              session={session}
              selectedSession={selectedSession}
              currentTime={currentTime}
              editingSession={editingSession}
              editingSessionName={editingSessionName}
              onEditingSessionNameChange={onEditingSessionNameChange}
              onStartEditingSession={onStartEditingSession}
              onCancelEditingSession={onCancelEditingSession}
              onSaveEditingSession={onSaveEditingSession}
              onProjectSelect={onProjectSelect}
              onSessionSelect={onSessionSelect}
              onDeleteSession={onDeleteSession}
              t={t}
            />
          ))}

          {showSentinel && (
            <div ref={sentinelRef} className="flex h-8 items-center justify-center">
              {isLoadingMoreSessions ? (
                <span className="text-xs text-muted-foreground">{t('sessions.loadingSessions')}</span>
              ) : (
                <span className="text-xs text-muted-foreground/60">
                  {hasMoreLocal
                    ? `${visibleCount} / ${sessions.length}`
                    : hasMoreSessions
                      ? '...'
                      : ''}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
