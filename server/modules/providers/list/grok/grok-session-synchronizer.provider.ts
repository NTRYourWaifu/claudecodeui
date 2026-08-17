import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';

import { sessionsDb } from '@/modules/database/index.js';
import { getGrokHome } from '@/shared/grok-executable.js';
import type { IProviderSessionSynchronizer } from '@/shared/interfaces.js';
import {
  findFilesRecursivelyCreatedAfter,
  normalizeSessionName,
  readFileTimestamps,
} from '@/shared/utils.js';

const UNTITLED_SESSION = 'Untitled Grok Session';
const SUMMARY_FILE = 'summary.json';
const HISTORY_FILE = 'chat_history.jsonl';

type ParsedSession = {
  sessionId: string;
  projectPath: string;
  sessionName: string;
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Session indexer for Grok Build transcript artifacts.
 *
 * Grok stores one directory per session under
 * `~/.grok/sessions/<url-encoded cwd>/<session-uuid>/`. `summary.json` carries
 * the canonical id, cwd, and generated title, while `chat_history.jsonl` holds
 * the transcript the chat panel renders.
 */
export class GrokSessionSynchronizer implements IProviderSessionSynchronizer {
  private readonly provider = 'grok' as const;

  private get sessionsRoot(): string {
    return path.join(getGrokHome(), 'sessions');
  }

  /**
   * Scans ~/.grok/sessions and upserts discovered sessions into DB.
   */
  async synchronize(since?: Date): Promise<number> {
    const files = await findFilesRecursivelyCreatedAfter(this.sessionsRoot, '.json', since ?? null);

    let processed = 0;
    for (const filePath of files) {
      if (path.basename(filePath) !== SUMMARY_FILE) {
        continue;
      }

      const indexed = await this.indexSummaryFile(filePath);
      if (indexed) {
        processed += 1;
      }
    }

    return processed;
  }

  /**
   * Parses and upserts one Grok session artifact.
   *
   * Watcher events arrive for both `summary.json` and `chat_history.jsonl`;
   * either one identifies the session directory, and the summary is always the
   * authoritative metadata source.
   */
  async synchronizeFile(filePath: string): Promise<string | null> {
    const fileName = path.basename(filePath);
    if (fileName !== SUMMARY_FILE && fileName !== HISTORY_FILE) {
      return null;
    }

    const summaryPath = fileName === SUMMARY_FILE
      ? filePath
      : path.join(path.dirname(filePath), SUMMARY_FILE);

    return this.indexSummaryFile(summaryPath);
  }

  /**
   * Reads one summary.json and upserts the session it describes.
   */
  private async indexSummaryFile(summaryPath: string): Promise<string | null> {
    const parsed = await this.readSummary(summaryPath);
    if (!parsed) {
      return null;
    }

    const historyPath = path.join(path.dirname(summaryPath), HISTORY_FILE);
    try {
      const historyStats = await stat(historyPath);
      if (!historyStats.isFile()) {
        return null;
      }
    } catch {
      // A session directory without a transcript has nothing to render yet.
      return null;
    }

    const timestamps = await readFileTimestamps(historyPath);

    return sessionsDb.createSession(
      parsed.sessionId,
      this.provider,
      parsed.projectPath,
      parsed.sessionName,
      parsed.createdAt ?? timestamps.createdAt,
      parsed.updatedAt ?? timestamps.updatedAt,
      historyPath
    );
  }

  /**
   * Extracts session metadata from one Grok summary.json.
   */
  private async readSummary(summaryPath: string): Promise<ParsedSession | null> {
    let summary: Record<string, unknown>;
    try {
      summary = JSON.parse(await readFile(summaryPath, 'utf8')) as Record<string, unknown>;
    } catch {
      // Summaries are rewritten in place, so a partial read is expected.
      return null;
    }

    const info = summary.info as Record<string, unknown> | undefined;
    const sessionId = typeof info?.id === 'string' ? info.id : undefined;
    const projectPath = typeof info?.cwd === 'string' ? info.cwd : undefined;

    if (!sessionId || !projectPath) {
      return null;
    }

    const existingName = sessionsDb.getSessionById(sessionId)?.custom_name;
    if (existingName && existingName !== UNTITLED_SESSION) {
      return {
        sessionId,
        projectPath,
        sessionName: normalizeSessionName(existingName, UNTITLED_SESSION),
        createdAt: typeof summary.created_at === 'string' ? summary.created_at : undefined,
        updatedAt: typeof summary.last_active_at === 'string' ? summary.last_active_at : undefined,
      };
    }

    const generatedTitle = typeof summary.generated_title === 'string' ? summary.generated_title : undefined;
    const sessionSummary = typeof summary.session_summary === 'string' ? summary.session_summary : undefined;

    return {
      sessionId,
      projectPath,
      sessionName: normalizeSessionName(generatedTitle || sessionSummary, UNTITLED_SESSION),
      createdAt: typeof summary.created_at === 'string' ? summary.created_at : undefined,
      updatedAt: typeof summary.last_active_at === 'string' ? summary.last_active_at : undefined,
    };
  }
}
