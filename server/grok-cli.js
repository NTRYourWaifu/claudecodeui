import { spawn } from 'child_process';
import crossSpawn from 'cross-spawn';
import { notifyRunFailed, notifyRunStopped } from './services/notification-orchestrator.js';
import { sessionsService } from './modules/providers/services/sessions.service.js';
import { providerAuthService } from './modules/providers/services/provider-auth.service.js';
import { createNormalizedMessage } from './shared/utils.js';
import { resolveGrokExecutable } from './shared/grok-executable.js';

// Use cross-spawn on Windows for better command execution
const spawnFunction = process.platform === 'win32' ? crossSpawn : spawn;

let activeGrokProcesses = new Map(); // Track active processes by session ID

const GROK_PERMISSION_MODES = new Set([
  'default',
  'acceptEdits',
  'auto',
  'dontAsk',
  'bypassPermissions',
  'plan'
]);

const GROK_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

/**
 * Maps the UI permission mode onto a mode the grok CLI accepts.
 *
 * Headless runs cannot answer an interactive approval prompt, so an explicit
 * "skip permissions" toggle wins over whatever mode the session carries.
 */
function resolvePermissionMode(permissionMode, skipPermissions) {
  if (skipPermissions) {
    return 'bypassPermissions';
  }

  return GROK_PERMISSION_MODES.has(permissionMode) ? permissionMode : 'default';
}

async function spawnGrok(command, options = {}, ws) {
  return new Promise(async (resolve, reject) => {
    const {
      sessionId,
      projectPath,
      cwd,
      resume,
      toolsSettings,
      skipPermissions,
      model,
      effort,
      permissionMode,
      sessionSummary
    } = options;

    let capturedSessionId = sessionId;
    let sessionCreatedSent = false;
    let settled = false;
    let stdoutLineBuffer = '';
    let terminalNotificationSent = false;

    const settings = toolsSettings || {
      allowedShellCommands: [],
      skipPermissions: false
    };

    const args = [];

    // Presence of a session id means "continue that conversation", matching how
    // the other CLI providers treat resume.
    if (sessionId) {
      args.push('--resume', sessionId);
    }

    args.push('-p', command || '');
    args.push('--output-format', 'streaming-messages-json');
    // Emits content_block_delta events so the chat panel can render token by token.
    args.push('--include-partial-messages');

    if (model) {
      args.push('--model', model);
    }

    if (effort && GROK_REASONING_EFFORTS.has(effort)) {
      args.push('--reasoning-effort', effort);
    }

    args.push('--permission-mode', resolvePermissionMode(permissionMode, skipPermissions || settings.skipPermissions));

    const workingDir = cwd || projectPath || process.cwd();
    // Windows spawn cannot always honor a cwd on another drive, so the CLI gets
    // the working directory explicitly as well.
    args.push('--cwd', workingDir);

    const processKey = capturedSessionId || Date.now().toString();

    const settleOnce = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };

    const notifyTerminalState = ({ code = null, error = null } = {}) => {
      if (terminalNotificationSent) {
        return;
      }

      terminalNotificationSent = true;

      const finalSessionId = capturedSessionId || sessionId || processKey;
      if (code === 0 && !error) {
        notifyRunStopped({
          userId: ws?.userId || null,
          provider: 'grok',
          sessionId: finalSessionId,
          sessionName: sessionSummary,
          stopReason: 'completed'
        });
        return;
      }

      notifyRunFailed({
        userId: ws?.userId || null,
        provider: 'grok',
        sessionId: finalSessionId,
        sessionName: sessionSummary,
        error: error || `Grok CLI exited with code ${code}`
      });
    };

    console.log('Spawning Grok CLI:', resolveGrokExecutable(), args.join(' '));
    console.log('Working directory:', workingDir);
    console.log('Session info - Input sessionId:', sessionId, 'Resume:', resume);

    const grokProcess = spawnFunction(resolveGrokExecutable(), args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    activeGrokProcesses.set(processKey, grokProcess);

    const captureSessionId = (newSessionId, response) => {
      if (!newSessionId || capturedSessionId) {
        return;
      }

      capturedSessionId = newSessionId;

      if (processKey !== capturedSessionId) {
        activeGrokProcesses.delete(processKey);
        activeGrokProcesses.set(capturedSessionId, grokProcess);
      }

      if (typeof ws.setSessionId === 'function') {
        ws.setSessionId(capturedSessionId);
      }

      if (!sessionId && !sessionCreatedSent) {
        sessionCreatedSent = true;
        ws.send(createNormalizedMessage({
          kind: 'session_created',
          newSessionId: capturedSessionId,
          model: response?.model,
          cwd: response?.cwd,
          sessionId: capturedSessionId,
          provider: 'grok'
        }));
      }
    };

    const emitNormalized = (payload) => {
      const normalized = sessionsService.normalizeMessage(
        'grok',
        payload,
        capturedSessionId || sessionId || null
      );
      for (const message of normalized) {
        ws.send(message);
      }
    };

    const processGrokOutputLine = (line) => {
      if (!line || !line.trim()) {
        return;
      }

      let response;
      try {
        response = JSON.parse(line);
      } catch {
        // Non-JSON output is CLI chatter (update notices, warnings); log only.
        console.log('Grok CLI stdout (non-JSON):', line);
        return;
      }

      captureSessionId(response.session_id, response);

      switch (response.type) {
        case 'system':
          // The init payload only carries session metadata handled above.
          break;

        case 'stream_event':
          // Unwrap partial-message events into the Anthropic block shape the
          // session adapter understands.
          if (response.event) {
            emitNormalized(response.event);
          }
          break;

        case 'assistant':
        case 'user':
          emitNormalized(response);
          break;

        case 'result': {
          const resultText = typeof response.result === 'string' ? response.result : '';
          ws.send(createNormalizedMessage({
            kind: 'complete',
            exitCode: response.is_error ? 1 : 0,
            resultText,
            isError: Boolean(response.is_error),
            sessionId: capturedSessionId || sessionId,
            provider: 'grok'
          }));
          break;
        }

        default:
          // Unknown message types — ignore.
      }
    };

    grokProcess.stdout.on('data', (data) => {
      // Stream chunks can split JSON objects across packets; keep trailing partial line.
      stdoutLineBuffer += data.toString();
      const completeLines = stdoutLineBuffer.split(/\r?\n/);
      stdoutLineBuffer = completeLines.pop() || '';

      completeLines.forEach((line) => {
        processGrokOutputLine(line.trim());
      });
    });

    grokProcess.stderr.on('data', (data) => {
      const stderrText = data.toString();
      console.error('Grok CLI stderr:', stderrText);

      ws.send(createNormalizedMessage({
        kind: 'error',
        content: stderrText,
        sessionId: capturedSessionId || sessionId || null,
        provider: 'grok'
      }));
    });

    grokProcess.on('close', async (code) => {
      const finalSessionId = capturedSessionId || sessionId || processKey;
      activeGrokProcesses.delete(finalSessionId);
      activeGrokProcesses.delete(processKey);

      if (stdoutLineBuffer.trim()) {
        processGrokOutputLine(stdoutLineBuffer.trim());
        stdoutLineBuffer = '';
      }

      ws.send(createNormalizedMessage({
        kind: 'complete',
        exitCode: code,
        isNewSession: !sessionId && !!command,
        sessionId: finalSessionId,
        provider: 'grok'
      }));

      notifyTerminalState({ code });

      if (code === 0) {
        settleOnce(() => resolve());
      } else {
        settleOnce(() => reject(new Error(`Grok CLI exited with code ${code}`)));
      }
    });

    grokProcess.on('error', async (error) => {
      console.error('Grok CLI process error:', error);

      const finalSessionId = capturedSessionId || sessionId || processKey;
      activeGrokProcesses.delete(finalSessionId);
      activeGrokProcesses.delete(processKey);

      const installed = await providerAuthService.isProviderInstalled('grok');
      const errorContent = !installed
        ? 'Grok CLI is not installed. Install it from https://grok.com/build'
        : error.message;

      ws.send(createNormalizedMessage({
        kind: 'error',
        content: errorContent,
        sessionId: capturedSessionId || sessionId || null,
        provider: 'grok'
      }));
      notifyTerminalState({ error });

      settleOnce(() => reject(error));
    });

    // Headless grok reads the prompt from argv, so stdin stays closed.
    grokProcess.stdin.end();
  });
}

function abortGrokSession(sessionId) {
  const grokProcess = activeGrokProcesses.get(sessionId);
  if (grokProcess) {
    console.log(`Aborting Grok session: ${sessionId}`);
    grokProcess.kill('SIGTERM');
    activeGrokProcesses.delete(sessionId);
    return true;
  }
  return false;
}

function isGrokSessionActive(sessionId) {
  return activeGrokProcesses.has(sessionId);
}

function getActiveGrokSessions() {
  return Array.from(activeGrokProcesses.keys());
}

export {
  spawnGrok,
  abortGrokSession,
  isGrokSessionActive,
  getActiveGrokSessions
};
