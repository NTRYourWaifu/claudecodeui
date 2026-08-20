import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useWebSocket } from './WebSocketContext';

/**
 * Tracks two things the sidebar dot needs and nothing else knows:
 *
 * 1. Which sessions are running right now — sourced from the server, so a run
 *    started on the desktop still shows as running on the phone.
 * 2. Which finished sessions the user has not looked at yet.
 *
 * The old dot only meant "touched within ten minutes", which collapsed both
 * states into one colour and left no way to tell a run in progress from a
 * result waiting to be read.
 */

const SEEN_STORAGE_KEY = 'session-seen-at';
const FINISHED_STORAGE_KEY = 'session-finished-at';
const BASELINE_STORAGE_KEY = 'session-seen-baseline';

/** Bound on the stored maps so they cannot grow without limit. */
const MAX_TRACKED_SESSIONS = 300;

/** Fallback poll for providers that do not broadcast their run state. */
const ACTIVE_SESSIONS_POLL_MS = 15000;

/** Refresh the seen stamp of the open session on this cadence. */
const VIEWED_SESSION_HEARTBEAT_MS = 10000;

/**
 * Server and browser clocks are not identical, so an activity stamp a few
 * seconds past the seen stamp is treated as already read.
 */
const CLOCK_SKEW_TOLERANCE_MS = 5000;

type TimestampMap = Record<string, number>;

type SessionActivityContextType = {
  /** Session ids the server reports as currently running. */
  runningSessions: Set<string>;
  isSessionRunning: (sessionId?: string | null) => boolean;
  /** True when the session finished with activity the user has not opened. */
  hasUnseenResult: (sessionId?: string | null, lastActivity?: string | number | Date | null) => boolean;
  markSessionSeen: (sessionId?: string | null, activityTimestamp?: string | number | Date | null) => void;
  /** Tells the provider which session is on screen so it can stay marked read. */
  setViewedSession: (sessionId?: string | null) => void;
};

const SessionActivityContext = createContext<SessionActivityContextType | null>(null);

export const useSessionActivity = () => {
  const context = useContext(SessionActivityContext);
  if (!context) {
    throw new Error('useSessionActivity must be used within a SessionActivityProvider');
  }
  return context;
};

const toTimestamp = (value?: string | number | Date | null): number => {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const readTimestampMap = (key: string): TimestampMap => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.entries(parsed).reduce<TimestampMap>((accumulator, [sessionId, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        accumulator[sessionId] = value;
      }
      return accumulator;
    }, {});
  } catch {
    return {};
  }
};

const writeTimestampMap = (key: string, map: TimestampMap) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // A full or unavailable storage only costs us the dot state, so it is not
    // worth interrupting the user over.
  }
};

/** Keeps the newest entries so long-lived installs do not accumulate forever. */
const trimTimestampMap = (map: TimestampMap): TimestampMap => {
  const entries = Object.entries(map);
  if (entries.length <= MAX_TRACKED_SESSIONS) return map;

  return entries
    .sort(([, left], [, right]) => right - left)
    .slice(0, MAX_TRACKED_SESSIONS)
    .reduce<TimestampMap>((accumulator, [sessionId, value]) => {
      accumulator[sessionId] = value;
      return accumulator;
    }, {});
};

/**
 * Sessions that already existed the first time this ran were never "seen", so
 * without a baseline every one of them would light up green at once. The
 * baseline treats everything older than the first launch as already read.
 */
const readOrCreateBaseline = (): number => {
  try {
    const raw = window.localStorage.getItem(BASELINE_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;

    const now = Date.now();
    window.localStorage.setItem(BASELINE_STORAGE_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
};

const collectSessionIds = (sessions: unknown): string[] => {
  if (!sessions || typeof sessions !== 'object') return [];

  return Object.values(sessions as Record<string, unknown>).flatMap((entry) => {
    if (!Array.isArray(entry)) return [];
    return entry.filter((id): id is string => typeof id === 'string' && id.length > 0);
  });
};

const useSessionActivityProviderState = (): SessionActivityContextType => {
  const { sendMessage, subscribe, isConnected } = useWebSocket();

  const [runningSessions, setRunningSessions] = useState<Set<string>>(new Set());
  const [seenMap, setSeenMap] = useState<TimestampMap>(() => readTimestampMap(SEEN_STORAGE_KEY));
  const [finishedMap, setFinishedMap] = useState<TimestampMap>(() => readTimestampMap(FINISHED_STORAGE_KEY));
  const baselineRef = useRef<number>(readOrCreateBaseline());
  const viewedSessionIdRef = useRef<string | null>(null);
  const [viewedSessionId, setViewedSessionIdState] = useState<string | null>(null);

  const markSessionSeen = useCallback<SessionActivityContextType['markSessionSeen']>(
    (sessionId, activityTimestamp) => {
      if (!sessionId) return;

      // Taking the later of the two guards against a session whose recorded
      // activity is slightly ahead of this browser's clock.
      const stamp = Math.max(Date.now(), toTimestamp(activityTimestamp));

      setSeenMap((previous) => {
        if ((previous[sessionId] ?? 0) >= stamp) return previous;

        const next = trimTimestampMap({ ...previous, [sessionId]: stamp });
        writeTimestampMap(SEEN_STORAGE_KEY, next);
        return next;
      });

      // Once read, the local completion stamp has no further use.
      setFinishedMap((previous) => {
        if (!(sessionId in previous)) return previous;

        const next = { ...previous };
        delete next[sessionId];
        writeTimestampMap(FINISHED_STORAGE_KEY, next);
        return next;
      });
    },
    [],
  );

  const setViewedSession = useCallback<SessionActivityContextType['setViewedSession']>(
    (sessionId) => {
      const normalized = sessionId || null;
      if (viewedSessionIdRef.current === normalized) return;

      // Mark the session being left as read before switching away from it.
      if (viewedSessionIdRef.current) {
        markSessionSeen(viewedSessionIdRef.current);
      }

      viewedSessionIdRef.current = normalized;
      setViewedSessionIdState(normalized);

      if (normalized) {
        markSessionSeen(normalized);
      }
    },
    [markSessionSeen],
  );

  const requestActiveSessions = useCallback(() => {
    sendMessage({ type: 'get-active-sessions' });
  }, [sendMessage]);

  // Ask for the full running set on connect, then poll. Claude broadcasts its
  // own transitions, but the other providers register runs in several places
  // and do not, so the poll is what keeps them honest.
  useEffect(() => {
    if (!isConnected) {
      setRunningSessions(new Set());
      return undefined;
    }

    requestActiveSessions();
    const timer = window.setInterval(requestActiveSessions, ACTIVE_SESSIONS_POLL_MS);

    return () => window.clearInterval(timer);
  }, [isConnected, requestActiveSessions]);

  // These arrive as one-off events, so they are read straight off the socket.
  // Going through `latestMessage` would lose them: a run starts and the reply
  // stream follows immediately, and whichever message lands second in the same
  // React batch overwrites the first.
  useEffect(() => subscribe((message: any) => {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'websocket-reconnected') {
      requestActiveSessions();
      return;
    }

    if (message.type === 'active-sessions') {
      const ids = collectSessionIds(message.sessions);
      setRunningSessions(new Set(ids));
      return;
    }

    if (message.type === 'session-run-state') {
      const sessionId = typeof message.sessionId === 'string' ? message.sessionId : '';
      if (!sessionId) return;

      setRunningSessions((previous) => {
        const next = new Set(previous);
        if (message.isRunning) {
          next.add(sessionId);
        } else {
          next.delete(sessionId);
        }
        return next;
      });

      // The session list is rebuilt from files a watcher picks up, so its
      // activity stamp can lag the end of a run. Recording the finish locally
      // means the green dot appears the moment the run ends.
      if (!message.isRunning) {
        if (viewedSessionIdRef.current === sessionId) {
          markSessionSeen(sessionId);
          return;
        }

        setFinishedMap((previous) => {
          const next = trimTimestampMap({ ...previous, [sessionId]: Date.now() });
          writeTimestampMap(FINISHED_STORAGE_KEY, next);
          return next;
        });
      }
    }
  }), [markSessionSeen, requestActiveSessions, subscribe]);

  // Keep the open session marked as read while it keeps producing output.
  useEffect(() => {
    if (!viewedSessionId) return undefined;

    const timer = window.setInterval(() => {
      markSessionSeen(viewedSessionId);
    }, VIEWED_SESSION_HEARTBEAT_MS);

    return () => window.clearInterval(timer);
  }, [markSessionSeen, viewedSessionId]);


  const isSessionRunning = useCallback<SessionActivityContextType['isSessionRunning']>(
    (sessionId) => Boolean(sessionId && runningSessions.has(sessionId)),
    [runningSessions],
  );

  const hasUnseenResult = useCallback<SessionActivityContextType['hasUnseenResult']>(
    (sessionId, lastActivity) => {
      if (!sessionId) return false;
      if (runningSessions.has(sessionId)) return false;

      const activityAt = Math.max(toTimestamp(lastActivity), finishedMap[sessionId] ?? 0);
      if (!activityAt) return false;

      const seenAt = Math.max(baselineRef.current, seenMap[sessionId] ?? 0);
      return activityAt > seenAt + CLOCK_SKEW_TOLERANCE_MS;
    },
    [finishedMap, runningSessions, seenMap],
  );

  return useMemo(
    () => ({
      runningSessions,
      isSessionRunning,
      hasUnseenResult,
      markSessionSeen,
      setViewedSession,
    }),
    [hasUnseenResult, isSessionRunning, markSessionSeen, runningSessions, setViewedSession],
  );
};

export const SessionActivityProvider = ({ children }: { children: React.ReactNode }) => {
  const value = useSessionActivityProviderState();

  return <SessionActivityContext.Provider value={value}>{children}</SessionActivityContext.Provider>;
};

export default SessionActivityContext;
