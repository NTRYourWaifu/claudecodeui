import type { RealtimeClientConnection } from '@/shared/types.js';

/**
 * Numeric readyState for an open WebSocket connection.
 *
 * We keep this in module state so services that broadcast updates do not need
 * to import `ws` directly just to compare open/closed state.
 */
export const WS_OPEN_STATE = 1;

/**
 * Shared registry of active chat WebSocket connections.
 *
 * Project/session services publish realtime updates by iterating this set.
 */
export const connectedClients = new Set<RealtimeClientConnection>();

/**
 * Sends one payload to every connected chat client.
 *
 * Session run-state and other cross-device signals ride on this so the sidebar
 * of a phone can reflect a run that a desktop started.
 */
export function broadcastToClients(payload: unknown): void {
  const message = JSON.stringify(payload);

  connectedClients.forEach((client: RealtimeClientConnection) => {
    if (client.readyState === WS_OPEN_STATE) {
      client.send(message);
    }
  });
}

/**
 * Announces that a session started or finished running.
 *
 * @param sessionId - Session identifier
 * @param provider - Provider that owns the session
 * @param isRunning - True when the session just started, false when it ended
 */
export function broadcastSessionRunState(
  sessionId: string,
  provider: string,
  isRunning: boolean
): void {
  if (!sessionId) return;

  console.log(
    `[INFO] Session run state: ${provider} ${sessionId} running=${isRunning} clients=${connectedClients.size}`
  );

  broadcastToClients({
    type: 'session-run-state',
    sessionId,
    provider,
    isRunning,
  });
}
