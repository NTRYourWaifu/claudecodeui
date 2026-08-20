import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';

import { cn } from '../../../../lib/utils';
import type { Project, ProjectSession, LLMProvider } from '../../../../types/app';
import type { SessionWithProvider } from '../../types/types';

import SidebarSessionItem from './SidebarSessionItem';

/**
 * Must stay above `PREVIEW_ROWS` so the preview stage always has more rows than
 * it can show: that surplus is what makes the half row peek out and what gives
 * the inner scroller something to scroll.
 */
const INITIAL_VISIBLE_SESSIONS = 10;
const VISIBLE_SESSIONS_STEP = 5;

/** Rows fully visible in the preview stage, plus the half row that peeks below. */
const PREVIEW_ROWS = 5;
/** Rows visible in the taller stage before its own scrollbar takes over. */
const EXPANDED_ROWS = 10;
/** Vertical gap between rows, matching the `space-y-1` on the list container. */
const ROW_GAP_PX = 4;
/**
 * Used only until the first row has actually been measured. These are rough
 * estimates, so a wrong value shows up as one frame of slightly-off height
 * rather than a permanently wrong list.
 */
const FALLBACK_ROW_HEIGHT_MOBILE_PX = 56;
const FALLBACK_ROW_HEIGHT_DESKTOP_PX = 44;

type SidebarProjectSessionsProps = {
  project: Project;
  isExpanded: boolean;
  isFullyExpanded: boolean;
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
  onExpandFully: () => void;
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
  isFullyExpanded,
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
  onExpandFully,
  t,
}: SidebarProjectSessionsProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_SESSIONS);
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const firstRowRef = useRef<HTMLDivElement | null>(null);

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

  // Row height is measured rather than hard-coded: the mobile and desktop rows
  // are two separate layouts with different heights, so any fixed pixel value
  // would be wrong on one of them.
  const measureRow = useCallback(() => {
    const node = firstRowRef.current;
    if (!node) {
      return;
    }
    const measured = node.getBoundingClientRect().height;
    if (measured > 0) {
      setRowHeight((current) => (current !== null && Math.abs(current - measured) < 0.5 ? current : measured));
    }
  }, []);

  useLayoutEffect(() => {
    measureRow();
  });

  useEffect(() => {
    const node = firstRowRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => measureRow());
    observer.observe(node);
    return () => observer.disconnect();
  }, [measureRow, isExpanded, sessions.length]);

  // Infinite scroll: when the sentinel below the list comes into view, either
  // grow the local window or, if exhausted, ask the controller to fetch more
  // from the backend. The root is the inner scroller, because only the fully
  // expanded stage scrolls on its own.
  const hasMoreLocal = visibleCount < sessions.length;
  const reachedLocalEnd = !hasMoreLocal;
  const canFetchMore = reachedLocalEnd && hasMoreSessions && !isLoadingMoreSessions;

  useEffect(() => {
    if (!isExpanded || !isFullyExpanded) {
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
      { root: scrollRef.current, rootMargin: '120px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    isExpanded,
    isFullyExpanded,
    hasMoreLocal,
    canFetchMore,
    sessions.length,
    project.projectId,
    onLoadMoreSessions,
  ]);

  if (!isExpanded) {
    return null;
  }

  const hasSessions = sessions.length > 0;
  const visibleSessions = sessions.slice(0, visibleCount);
  const showSentinel = isFullyExpanded && hasSessions && (hasMoreLocal || hasMoreSessions);

  const effectiveRowHeight =
    rowHeight ??
    (typeof window !== 'undefined' && window.innerWidth < 768
      ? FALLBACK_ROW_HEIGHT_MOBILE_PX
      : FALLBACK_ROW_HEIGHT_DESKTOP_PX);

  // A peek row only makes sense once there is something below the fold.
  const canPeek = initialSessionsLoaded && sessions.length > PREVIEW_ROWS;
  const previewHeight =
    PREVIEW_ROWS * effectiveRowHeight + PREVIEW_ROWS * ROW_GAP_PX + effectiveRowHeight / 2;
  const expandedHeight = EXPANDED_ROWS * effectiveRowHeight + (EXPANDED_ROWS - 1) * ROW_GAP_PX;

  const maxHeight = isFullyExpanded ? expandedHeight : canPeek ? previewHeight : undefined;

  return (
    <div className="relative ml-3 border-l border-border pl-3">
      <div
        ref={scrollRef}
        className="space-y-1 overflow-y-auto overscroll-contain scrollbar-hide"
        style={maxHeight === undefined ? undefined : { maxHeight }}
      >
        {!initialSessionsLoaded ? (
          <SessionListSkeleton />
        ) : !hasSessions ? (
          <div className="px-3 py-2 text-left">
            <p className="text-xs text-muted-foreground">{t('sessions.noSessions')}</p>
          </div>
        ) : (
          <>
            {visibleSessions.map((session, index) => (
              <div key={session.id} ref={index === 0 ? firstRowRef : undefined}>
                <SidebarSessionItem
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
              </div>
            ))}

            {showSentinel && (
              <div ref={sentinelRef} className="flex h-8 items-center justify-center">
                {isLoadingMoreSessions ? (
                  <span className="text-xs text-muted-foreground">{t('sessions.loadingSessions')}</span>
                ) : (
                  <span className="text-xs text-muted-foreground/60">
                    {hasMoreLocal ? `${visibleCount} / ${sessions.length}` : hasMoreSessions ? '...' : ''}
                  </span>
                )}
              </div>
            )}

            {/*
              The half-visible row doubles as the control that opens the taller
              stage. This lives *inside* the scroller and sticks to its bottom
              edge rather than floating above it: as a child of the scrolling
              box, a touch-drag starting here pans the list natively, while a
              tap still fires the click. An absolutely positioned overlay would
              swallow the drag instead.
            */}
            {!isFullyExpanded && canPeek && (
              <button
                type="button"
                className="sticky bottom-0 z-10 -mb-px flex w-full items-end justify-center bg-gradient-to-b from-background/40 via-background/85 to-background pb-0.5"
                style={{ height: effectiveRowHeight / 2 + ROW_GAP_PX }}
                onClick={(event) => {
                  event.stopPropagation();
                  onExpandFully();
                }}
                aria-label={t('sessions.showMore')}
                title={t('sessions.showMore')}
              >
                <span className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
                  {t('sessions.showMore')}
                </span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
