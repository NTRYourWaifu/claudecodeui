import { useTranslation } from 'react-i18next';
import { useCallback, useMemo, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ChatMessage } from '../../types/types';
import type { Project, ProjectSession, LLMProvider } from '../../../../types/app';
import { getIntrinsicMessageKey } from '../../utils/messageKeys';
import MessageComponent from './MessageComponent';
import ProviderSelectionEmptyState from './ProviderSelectionEmptyState';
import ConversationScrollMarks from './ConversationScrollMarks';
import ToolCallGroup from './ToolCallGroup';

interface ChatMessagesPaneProps {
  scrollContainerRef: RefObject<HTMLDivElement>;
  onWheel: () => void;
  onTouchMove: () => void;
  isLoadingSessionMessages: boolean;
  chatMessages: ChatMessage[];
  selectedSession: ProjectSession | null;
  currentSessionId: string | null;
  provider: LLMProvider;
  setProvider: (provider: LLMProvider) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  claudeModel: string;
  setClaudeModel: (model: string) => void;
  cursorModel: string;
  setCursorModel: (model: string) => void;
  codexModel: string;
  setCodexModel: (model: string) => void;
  geminiModel: string;
  setGeminiModel: (model: string) => void;
  tasksEnabled: boolean;
  isTaskMasterInstalled: boolean | null;
  onShowAllTasks?: (() => void) | null;
  setInput: Dispatch<SetStateAction<string>>;
  isLoadingMoreMessages: boolean;
  hasMoreMessages: boolean;
  totalMessages: number;
  sessionMessagesCount: number;
  visibleMessageCount: number;
  visibleMessages: ChatMessage[];
  loadEarlierMessages: () => void;
  loadAllMessages: () => void;
  allMessagesLoaded: boolean;
  isLoadingAllMessages: boolean;
  loadAllJustFinished: boolean;
  showLoadAllOverlay: boolean;
  createDiff: any;
  onFileOpen?: (filePath: string, diffInfo?: unknown) => void;
  onShowSettings?: () => void;
  onGrantToolPermission: (suggestion: { entry: string; toolName: string }) => { success: boolean };
  autoExpandTools?: boolean;
  showRawParameters?: boolean;
  showThinking?: boolean;
  selectedProject: Project;
  isLoading?: boolean;
}

export default function ChatMessagesPane({
  scrollContainerRef,
  onWheel,
  onTouchMove,
  isLoadingSessionMessages,
  chatMessages,
  selectedSession,
  currentSessionId,
  provider,
  setProvider,
  textareaRef,
  claudeModel,
  setClaudeModel,
  cursorModel,
  setCursorModel,
  codexModel,
  setCodexModel,
  geminiModel,
  setGeminiModel,
  tasksEnabled,
  isTaskMasterInstalled,
  onShowAllTasks,
  setInput,
  isLoadingMoreMessages,
  hasMoreMessages,
  totalMessages,
  sessionMessagesCount,
  visibleMessageCount,
  visibleMessages,
  loadEarlierMessages,
  loadAllMessages,
  allMessagesLoaded,
  isLoadingAllMessages,
  loadAllJustFinished,
  showLoadAllOverlay,
  createDiff,
  onFileOpen,
  onShowSettings,
  onGrantToolPermission,
  autoExpandTools,
  showRawParameters,
  showThinking,
  selectedProject,
  isLoading = false,
}: ChatMessagesPaneProps) {
  const { t } = useTranslation('chat');
  const messageKeyMapRef = useRef<WeakMap<ChatMessage, string>>(new WeakMap());
  const allocatedKeysRef = useRef<Set<string>>(new Set());
  const generatedMessageKeyCounterRef = useRef(0);

  // Each turn's way to its answer — tool calls, thinking, the notes written in
  // between — gathered so it can be shown as one row, leaving the request and
  // the answer on screen.
  //
  // Grouping is purely presentational and deliberately stops here rather than
  // reshaping the message list: the scroll anchoring and pagination both count
  // on the messages staying as they are.
  const toolRuns = useMemo(() => {
    type Run = { grouped: boolean; live: boolean; messages: ChatMessage[] };
    const runs: Run[] = [];

    const isReply = (message: ChatMessage) =>
      message.type === 'assistant'
      && !message.isToolUse
      && !message.isThinking
      && !message.isTaskNotification
      && !message.isInteractivePrompt
      && !message.isCompactSummary;

    const addTurn = (turn: ChatMessage[], isLastTurn: boolean) => {
      // The answer is the run of plain replies the turn ends on; what came
      // before it is the working. A turn still running ends on whatever it
      // last wrote, which stays out until the next step folds it in.
      let answerStart = turn.length;
      while (answerStart > 0 && isReply(turn[answerStart - 1])) answerStart -= 1;

      const turnRuns: Run[] = [];
      let group: Run | null = null;
      turn.forEach((message, index) => {
        // A background task reporting in mid-turn is part of the working too;
        // left out, it split the turn's one row into two.
        const foldable = index < answerStart
          && (message.isToolUse || message.isThinking || message.isTaskNotification || isReply(message));
        if (!foldable) {
          group = null;
          turnRuns.push({ grouped: false, live: false, messages: [message] });
          return;
        }
        if (!group) {
          group = { grouped: true, live: false, messages: [] };
          turnRuns.push(group);
        }
        group.messages.push(message);
      });

      const live = isLastTurn && isLoading;
      if (live) {
        const lastGroup = [...turnRuns].reverse().find((run) => run.grouped);
        if (lastGroup) {
          lastGroup.live = true;
        } else {
          // Nothing to fold yet, but the turn is already thinking: the row
          // goes where the working will be.
          const at = turnRuns.length > 0 && turnRuns[0].messages[0]?.type === 'user' ? 1 : 0;
          turnRuns.splice(at, 0, { grouped: true, live: true, messages: [] });
        }
      }
      runs.push(...turnRuns);
    };

    let turn: ChatMessage[] = [];
    for (const message of visibleMessages) {
      if (message.type === 'user' && turn.length > 0) {
        addTurn(turn, false);
        turn = [];
      }
      turn.push(message);
    }
    if (turn.length > 0 || isLoading) addTurn(turn, true);
    return runs;
  }, [visibleMessages, isLoading]);

  // Keep keys stable across prepends so existing MessageComponent instances retain local state.
  const getMessageKey = useCallback((message: ChatMessage) => {
    const existingKey = messageKeyMapRef.current.get(message);
    if (existingKey) {
      return existingKey;
    }

    const intrinsicKey = getIntrinsicMessageKey(message);
    let candidateKey = intrinsicKey;

    if (!candidateKey || allocatedKeysRef.current.has(candidateKey)) {
      do {
        generatedMessageKeyCounterRef.current += 1;
        candidateKey = intrinsicKey
          ? `${intrinsicKey}-${generatedMessageKeyCounterRef.current}`
          : `message-generated-${generatedMessageKeyCounterRef.current}`;
      } while (allocatedKeysRef.current.has(candidateKey));
    }

    allocatedKeysRef.current.add(candidateKey);
    messageKeyMapRef.current.set(message, candidateKey);
    return candidateKey;
  }, []);

  return (
    // The rail is a sibling of the scroller, not a child of it. Inside, its
    // absolute positioning resolved against the full scrollable height, so it
    // scrolled away with the conversation and was almost never on screen.
    <div className="relative flex min-h-0 flex-1 flex-col">
    <div
      ref={scrollContainerRef}
      onWheel={onWheel}
      onTouchMove={onTouchMove}
      className="flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden overscroll-y-contain px-0 py-2 sm:space-y-2 sm:px-3 sm:py-2.5"
    >
      {isLoadingSessionMessages && chatMessages.length === 0 ? (
        <div className="mt-8 text-center text-gray-500 dark:text-gray-400">
          <div className="flex items-center justify-center space-x-2">
            <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-gray-400" />
            <p>{t('session.loading.sessionMessages')}</p>
          </div>
        </div>
      ) : chatMessages.length === 0 ? (
        <ProviderSelectionEmptyState
          selectedSession={selectedSession}
          currentSessionId={currentSessionId}
          provider={provider}
          setProvider={setProvider}
          textareaRef={textareaRef}
          claudeModel={claudeModel}
          setClaudeModel={setClaudeModel}
          cursorModel={cursorModel}
          setCursorModel={setCursorModel}
          codexModel={codexModel}
          setCodexModel={setCodexModel}
          geminiModel={geminiModel}
          setGeminiModel={setGeminiModel}
          tasksEnabled={tasksEnabled}
          isTaskMasterInstalled={isTaskMasterInstalled}
          onShowAllTasks={onShowAllTasks}
          setInput={setInput}
        />
      ) : (
        <>
          {/* Loading indicator for older messages (hide when load-all is active) */}
          {isLoadingMoreMessages && !isLoadingAllMessages && !allMessagesLoaded && (
            <div className="py-3 text-center text-gray-500 dark:text-gray-400">
              <div className="flex items-center justify-center space-x-2">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-gray-400" />
                <p className="text-sm">{t('session.loading.olderMessages')}</p>
              </div>
            </div>
          )}

          {/* Indicator showing there are more messages to load (hide when all loaded) */}
          {hasMoreMessages && !isLoadingMoreMessages && !allMessagesLoaded && (
            <div className="border-b border-gray-200 py-2 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {totalMessages > 0 && (
                <span>
                  {t('session.messages.showingOf', { shown: sessionMessagesCount, total: totalMessages })}{' '}
                  <span className="text-xs">{t('session.messages.scrollToLoad')}</span>
                </span>
              )}
            </div>
          )}

          {/* Floating "Load all messages" overlay */}
          {(showLoadAllOverlay || isLoadingAllMessages || loadAllJustFinished) && (
            <div className="pointer-events-none sticky top-2 z-20 flex justify-center">
              {loadAllJustFinished ? (
                <div className="flex items-center space-x-2 rounded-full bg-green-600 px-4 py-1.5 text-xs font-medium text-white shadow-lg dark:bg-green-500">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{t('session.messages.allLoaded')}</span>
                </div>
              ) : (
                <button
                  className="pointer-events-auto flex items-center space-x-2 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-lg transition-colors duration-200 hover:bg-primary/90 disabled:cursor-wait disabled:opacity-75"
                  onClick={loadAllMessages}
                  disabled={isLoadingAllMessages}
                >
                  {isLoadingAllMessages && (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  )}
                  <span>
                    {isLoadingAllMessages
                      ? t('session.messages.loadingAll')
                      : <>{t('session.messages.loadAll')} {totalMessages > 0 && `(${totalMessages})`}</>
                    }
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Legacy message count indicator (for non-paginated view) */}
          {!hasMoreMessages && chatMessages.length > visibleMessageCount && (
            <div className="border-b border-gray-200 py-2 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {t('session.messages.showingLast', { count: visibleMessageCount, total: chatMessages.length })} |
              <button className="ml-1 text-primary underline hover:text-primary/80" onClick={loadEarlierMessages}>
                {t('session.messages.loadEarlier')}
              </button>
              {' | '}
              <button
                className="text-primary underline hover:text-primary/80"
                onClick={loadAllMessages}
              >
                {t('session.messages.loadAll')}
              </button>
            </div>
          )}

          {toolRuns.map((run) => {
            const rendered = run.messages.map((message) => {
              const index = visibleMessages.indexOf(message);
              const prevMessage = index > 0 ? visibleMessages[index - 1] : null;
              return (
                <MessageComponent
                  key={getMessageKey(message)}
                  message={message}
                  prevMessage={prevMessage}
                  createDiff={createDiff}
                  onFileOpen={onFileOpen}
                  onShowSettings={onShowSettings}
                  onGrantToolPermission={onGrantToolPermission}
                  autoExpandTools={autoExpandTools}
                  showRawParameters={showRawParameters}
                  showThinking={showThinking}
                  selectedProject={selectedProject}
                  provider={provider}
                />
              );
            });

            if (!run.grouped) return rendered;
            return (
              <ToolCallGroup
                key={run.messages[0] ? `tool-run-${getMessageKey(run.messages[0])}` : 'tool-run-live'}
                messages={run.messages}
                defaultOpen={Boolean(autoExpandTools)}
                live={run.live}
              >
                {rendered}
              </ToolCallGroup>
            );
          })}
        </>
      )}
    </div>

      <ConversationScrollMarks
        scrollContainerRef={scrollContainerRef}
        messageSignature={`${visibleMessages.length}:${chatMessages.length}`}
      />
    </div>
  );
}

