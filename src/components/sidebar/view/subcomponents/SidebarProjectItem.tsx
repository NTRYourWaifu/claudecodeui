import { useCallback, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Edit3, Folder, FolderOpen, MoreHorizontal, Plus, Star, Trash2, X } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Button } from '../../../../shared/view/ui';
import { cn } from '../../../../lib/utils';
import { useAnchoredMenu } from '../../../../hooks/useAnchoredMenu';
import type { Project, ProjectSession, LLMProvider } from '../../../../types/app';
import type { MCPServerStatus, SessionWithProvider } from '../../types/types';
import { getTaskIndicatorStatus } from '../../utils/utils';

import TaskIndicator from './TaskIndicator';
import SidebarProjectSessions from './SidebarProjectSessions';

const MENU_PANEL_CLASS =
  'flex flex-col overflow-hidden rounded-xl border border-border/60 bg-popover text-popover-foreground shadow-xl';
const MENU_ITEM_CLASS = 'flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent';

type SidebarProjectItemProps = {
  project: Project;
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  isExpanded: boolean;
  isFullyExpanded: boolean;
  isDeleting: boolean;
  isStarred: boolean;
  editingProject: string | null;
  editingName: string;
  sessions: SessionWithProvider[];
  initialSessionsLoaded: boolean;
  isLoadingMoreSessions: boolean;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  tasksEnabled: boolean;
  mcpServerStatus: MCPServerStatus;
  onEditingNameChange: (name: string) => void;
  onToggleProject: (projectName: string) => void;
  onSetFullyExpandedProject: (projectId: string | null) => void;
  onProjectSelect: (project: Project) => void;
  onToggleStarProject: (projectName: string) => void;
  onStartEditingProject: (project: Project) => void;
  onCancelEditingProject: () => void;
  onSaveProjectName: (projectName: string) => void;
  onDeleteProject: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (
    projectName: string,
    sessionId: string,
    sessionTitle: string,
    provider: LLMProvider,
  ) => void;
  onLoadMoreSessions: (projectId: string) => void;
  onNewSession: (project: Project) => void;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  t: TFunction;
};

const getSessionCountDisplay = (project: Project, sessions: SessionWithProvider[]): string => {
  const total = Number(project.sessionMeta?.total ?? sessions.length);
  return String(total);
};

export default function SidebarProjectItem({
  project,
  selectedProject,
  selectedSession,
  isExpanded,
  isFullyExpanded,
  isDeleting,
  isStarred,
  editingProject,
  editingName,
  sessions,
  initialSessionsLoaded,
  isLoadingMoreSessions,
  currentTime,
  editingSession,
  editingSessionName,
  tasksEnabled,
  mcpServerStatus,
  onEditingNameChange,
  onToggleProject,
  onSetFullyExpandedProject,
  onProjectSelect,
  onToggleStarProject,
  onStartEditingProject,
  onCancelEditingProject,
  onSaveProjectName,
  onDeleteProject,
  onSessionSelect,
  onDeleteSession,
  onLoadMoreSessions,
  onNewSession,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  t,
}: SidebarProjectItemProps) {
  // Project identity is tracked by the DB-assigned `projectId` everywhere
  // after the projectName → projectId migration.
  const isSelected = selectedProject?.projectId === project.projectId;
  const isEditing = editingProject === project.projectId;
  const totalSessionCount = Number(project.sessionMeta?.total ?? sessions.length);
  const sessionCountDisplay = getSessionCountDisplay(project, sessions);
  const sessionCountLabel = `${sessionCountDisplay} session${totalSessionCount === 1 ? '' : 's'}`;
  const taskStatus = getTaskIndicatorStatus(project, mcpServerStatus);

  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const menu = useAnchoredMenu(menuOpen, closeMenu, { maxWidth: 220, placement: 'auto' });

  const toggleProject = () => onToggleProject(project.projectId);
  const toggleStarProject = () => onToggleStarProject(project.projectId);

  const saveProjectName = () => {
    onSaveProjectName(project.projectId);
  };

  const selectAndToggleProject = () => {
    if (selectedProject?.projectId !== project.projectId) {
      onProjectSelect(project);
    }

    toggleProject();
  };

  // The row itself is the expand/collapse control, so every button sitting on it
  // has to stop the click from bubbling — otherwise starting a new session would
  // also toggle the project open or shut.
  const startNewSession = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onProjectSelect(project);
    onNewSession(project);
  };

  // The mobile and desktop rows are two separate layouts that are both mounted,
  // with one hidden by CSS. Anchoring on the button that was actually clicked
  // avoids measuring the hidden copy, which reports a zero-sized rect.
  const openMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    menu.triggerRef.current = event.currentTarget;
    setMenuOpen((previous) => !previous);
  };

  const runMenuAction = (action: () => void) => {
    closeMenu();
    action();
  };

  const rowActions = (
    <>
      <button
        type="button"
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary/90 active:scale-90"
        onClick={startNewSession}
        title={t('sessions.newSession')}
        aria-label={t('sessions.newSession')}
      >
        <Plus className="h-4 w-4" />
      </button>

      <button
        type="button"
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 transition-colors hover:bg-muted active:scale-90"
        onClick={openMenu}
        title={t('tooltips.moreActions')}
        aria-label={t('tooltips.moreActions')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </button>
    </>
  );

  return (
    <div className={cn('md:space-y-1', isDeleting && 'opacity-50 pointer-events-none')}>
      <div className="md:group group">
        <div className="md:hidden">
          <div
            className={cn(
              'px-2.5 py-2 mx-2 my-0.5 rounded-md bg-card border border-border/50 active:scale-[0.98] transition-all duration-150',
              isSelected && 'bg-primary/5 border-primary/20',
              isStarred &&
                !isSelected &&
                'bg-yellow-50/50 dark:bg-yellow-900/5 border-yellow-200/30 dark:border-yellow-800/30',
            )}
            onClick={toggleProject}
          >
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                    isExpanded ? 'bg-primary/10' : 'bg-muted',
                  )}
                >
                  {isExpanded ? (
                    <FolderOpen className="h-4 w-4 text-primary" />
                  ) : (
                    <Folder className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(event) => onEditingNameChange(event.target.value)}
                      className="w-full rounded-lg border-2 border-primary/40 bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-all duration-200 focus:border-primary focus:shadow-md focus:outline-none"
                      placeholder={t('projects.projectNamePlaceholder')}
                      autoFocus
                      autoComplete="off"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          saveProjectName();
                        }

                        if (event.key === 'Escape') {
                          onCancelEditingProject();
                        }
                      }}
                      style={{
                        fontSize: '16px',
                        WebkitAppearance: 'none',
                        borderRadius: '8px',
                      }}
                    />
                  ) : (
                    <>
                      <div className="flex min-w-0 flex-1 items-center justify-between">
                        <h3 className="truncate text-sm font-medium text-foreground">{project.displayName}</h3>
                        {tasksEnabled && (
                          <TaskIndicator
                            status={taskStatus}
                            size="xs"
                            className="ml-2 hidden flex-shrink-0 md:inline-flex"
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{sessionCountLabel}</p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {isEditing ? (
                  <>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500 shadow-sm transition-all duration-150 active:scale-90 active:shadow-none dark:bg-green-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        saveProjectName();
                      }}
                    >
                      <Check className="h-4 w-4 text-white" />
                    </button>
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-500 shadow-sm transition-all duration-150 active:scale-90 active:shadow-none dark:bg-gray-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCancelEditingProject();
                      }}
                    >
                      <X className="h-4 w-4 text-white" />
                    </button>
                  </>
                ) : (
                  rowActions
                )}
              </div>
            </div>
          </div>
        </div>

        {/* The action buttons live beside the row button rather than inside it:
            a <button> cannot legally nest another one, and they are now always
            visible instead of appearing on hover. */}
        <div className="hidden w-full items-center gap-1.5 pr-1 md:flex">
        <Button
          variant="ghost"
          className={cn(
            'flex min-w-0 flex-1 justify-between p-2 h-auto font-normal hover:bg-accent/50',
            isSelected && 'bg-accent text-accent-foreground',
            isStarred &&
              !isSelected &&
              'bg-yellow-50/50 dark:bg-yellow-900/10 hover:bg-yellow-100/50 dark:hover:bg-yellow-900/20',
          )}
          onClick={selectAndToggleProject}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 flex-shrink-0 text-primary" />
            ) : (
              <Folder className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1 text-left">
              {isEditing ? (
                <div className="space-y-1">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(event) => onEditingNameChange(event.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:ring-2 focus:ring-primary/20"
                    placeholder={t('projects.projectNamePlaceholder')}
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        saveProjectName();
                      }
                      if (event.key === 'Escape') {
                        onCancelEditingProject();
                      }
                    }}
                  />
                  <div className="truncate text-xs text-muted-foreground" title={project.fullPath}>
                    {project.fullPath}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="truncate text-sm font-semibold text-foreground" title={project.displayName}>
                    {project.displayName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {sessionCountDisplay}
                    {project.fullPath !== project.displayName && (
                      <span className="ml-1 opacity-60" title={project.fullPath}>
                        {' - '}
                        {project.fullPath.length > 25 ? `...${project.fullPath.slice(-22)}` : project.fullPath}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

        </Button>

          <div className="flex flex-shrink-0 items-center gap-1.5">
            {isEditing ? (
              <>
                <button
                  type="button"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-green-600 transition-colors hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-900/20"
                  onClick={(event) => {
                    event.stopPropagation();
                    saveProjectName();
                  }}
                  title={t('tooltips.save')}
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-gray-800"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCancelEditingProject();
                  }}
                  title={t('tooltips.cancel')}
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              rowActions
            )}
          </div>
        </div>
      </div>

      {menuOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menu.panelRef}
          style={menu.style || { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
          className={MENU_PANEL_CLASS}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM_CLASS}
            onClick={(event) => {
              event.stopPropagation();
              runMenuAction(toggleStarProject);
            }}
          >
            <Star
              className={cn(
                'h-4 w-4 flex-shrink-0',
                isStarred ? 'fill-current text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground',
              )}
            />
            {isStarred ? t('tooltips.removeFromFavorites') : t('tooltips.addToFavorites')}
          </button>

          <button
            type="button"
            role="menuitem"
            className={cn(MENU_ITEM_CLASS, 'border-t border-border/60')}
            onClick={(event) => {
              event.stopPropagation();
              runMenuAction(() => onStartEditingProject(project));
            }}
          >
            <Edit3 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            {t('tooltips.renameProject')}
          </button>

          <button
            type="button"
            role="menuitem"
            className={cn(MENU_ITEM_CLASS, 'border-t border-border/60 text-red-600 dark:text-red-400')}
            onClick={(event) => {
              event.stopPropagation();
              runMenuAction(() => onDeleteProject(project));
            }}
          >
            <Trash2 className="h-4 w-4 flex-shrink-0" />
            {t('tooltips.deleteProject')}
          </button>
        </div>,
        document.body,
      )}

      <SidebarProjectSessions
        project={project}
        isExpanded={isExpanded}
        isFullyExpanded={isFullyExpanded}
        sessions={sessions}
        selectedSession={selectedSession}
        initialSessionsLoaded={initialSessionsLoaded}
        hasMoreSessions={Boolean(project.sessionMeta?.hasMore)}
        isLoadingMoreSessions={isLoadingMoreSessions}
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
        onLoadMoreSessions={onLoadMoreSessions}
        onExpandFully={() => onSetFullyExpandedProject(project.projectId)}
        t={t}
      />
    </div>
  );
}
