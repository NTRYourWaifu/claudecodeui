import fs from 'node:fs';
import readline from 'node:readline';

import { sessionsDb } from '@/modules/database/index.js';
import type { IProviderSessions } from '@/shared/interfaces.js';
import type { AnyRecord, FetchHistoryOptions, FetchHistoryResult, NormalizedMessage } from '@/shared/types.js';
import { createNormalizedMessage, generateMessageId, readObjectRecord } from '@/shared/utils.js';

const PROVIDER = 'grok';

/**
 * Grok wraps the real prompt in `<user_query>` and injects environment blocks
 * (`<user_info>`, `<rules>`, reminders) as extra user turns. Only the query is
 * conversation content; the rest is harness plumbing that must stay hidden.
 */
const INTERNAL_USER_PREFIXES = [
  '<system-reminder>',
  '<user_info>',
  '<rules>',
  '<git_status>',
  '<environment_details>',
] as const;

function isInternalUserText(value: string): boolean {
  const normalized = value.trimStart();
  return INTERNAL_USER_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function unwrapUserQuery(value: string): string {
  const normalized = value.trim();
  const openTag = '<user_query>';
  const closeTag = '</user_query>';

  if (!normalized.startsWith(openTag)) {
    return normalized;
  }

  const afterOpen = normalized.slice(openTag.length);
  const closeIndex = afterOpen.lastIndexOf(closeTag);
  return (closeIndex >= 0 ? afterOpen.slice(0, closeIndex) : afterOpen).trim();
}

/**
 * Tool arguments are stored as a JSON string in `chat_history.jsonl` but as an
 * object on the live stream. The frontend tool renderers expect an object.
 */
function parseToolArguments(rawArguments: unknown): unknown {
  if (typeof rawArguments !== 'string') {
    return rawArguments;
  }

  try {
    return JSON.parse(rawArguments);
  } catch {
    return rawArguments;
  }
}

function stringifyContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        const record = readObjectRecord(part);
        return typeof record?.text === 'string' ? record.text : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return value === undefined || value === null ? '' : JSON.stringify(value);
}

async function readHistoryEntries(filePath: string): Promise<AnyRecord[]> {
  const entries: AnyRecord[] = [];

  try {
    const fileStream = fs.createReadStream(filePath);
    const lineReader = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of lineReader) {
      if (!line.trim()) {
        continue;
      }

      try {
        entries.push(JSON.parse(line) as AnyRecord);
      } catch {
        // The CLI appends while we read; a torn final line is expected.
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[GrokProvider] Failed to read history ${filePath}:`, message);
  }

  return entries;
}

export class GrokSessionsProvider implements IProviderSessions {
  /**
   * Normalizes live `--output-format streaming-messages-json` events.
   *
   * Grok emits the Anthropic Messages API wire format, so the assistant/user
   * envelopes match Claude's. Persisted history uses Grok's own schema and is
   * normalized separately in fetchHistory().
   */
  normalizeMessage(rawMessage: unknown, sessionId: string | null): NormalizedMessage[] {
    const raw = readObjectRecord(rawMessage);
    if (!raw) {
      return [];
    }

    if (raw.type === 'content_block_delta' && raw.delta?.text) {
      return [createNormalizedMessage({
        kind: 'stream_delta',
        content: raw.delta.text,
        sessionId,
        provider: PROVIDER,
      })];
    }

    if (raw.type === 'content_block_stop') {
      return [createNormalizedMessage({ kind: 'stream_end', sessionId, provider: PROVIDER })];
    }

    const messages: NormalizedMessage[] = [];
    const ts = typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString();
    const baseId = typeof raw.uuid === 'string' ? raw.uuid : generateMessageId(PROVIDER);
    const content = raw.message?.content;

    if (raw.message?.role === 'assistant' && Array.isArray(content)) {
      let partIndex = 0;
      for (const part of content) {
        if (part?.type === 'text' && part.text) {
          messages.push(createNormalizedMessage({
            id: `${baseId}_${partIndex}`,
            sessionId,
            timestamp: ts,
            provider: PROVIDER,
            kind: 'text',
            role: 'assistant',
            content: part.text,
          }));
        } else if (part?.type === 'thinking' && part.thinking) {
          messages.push(createNormalizedMessage({
            id: `${baseId}_${partIndex}`,
            sessionId,
            timestamp: ts,
            provider: PROVIDER,
            kind: 'thinking',
            content: part.thinking,
          }));
        } else if (part?.type === 'tool_use') {
          messages.push(createNormalizedMessage({
            id: `${baseId}_${partIndex}`,
            sessionId,
            timestamp: ts,
            provider: PROVIDER,
            kind: 'tool_use',
            toolName: part.name,
            toolInput: parseToolArguments(part.input),
            toolId: part.id,
          }));
        }
        partIndex += 1;
      }

      return messages;
    }

    if (raw.message?.role === 'user' && Array.isArray(content)) {
      for (const part of content) {
        if (part?.type !== 'tool_result') {
          continue;
        }

        messages.push(createNormalizedMessage({
          id: `${baseId}_tr_${part.tool_use_id}`,
          sessionId,
          timestamp: ts,
          provider: PROVIDER,
          kind: 'tool_result',
          toolId: part.tool_use_id,
          content: stringifyContent(part.content),
          isError: Boolean(part.is_error),
        }));
      }

      return messages;
    }

    return messages;
  }

  /**
   * Loads persisted Grok history from the session's `chat_history.jsonl` and
   * attaches tool results to their originating tool calls.
   */
  async fetchHistory(
    sessionId: string,
    options: FetchHistoryOptions = {},
  ): Promise<FetchHistoryResult> {
    const { limit = null, offset = 0 } = options;
    const historyPath = sessionsDb.getSessionById(sessionId)?.jsonl_path;

    if (!historyPath) {
      return { messages: [], total: 0, hasMore: false, offset: 0, limit: null };
    }

    const entries = await readHistoryEntries(historyPath);
    const normalized = this.normalizeHistoryEntries(entries, sessionId);

    const totalNormalized = normalized.length;
    let total = 0;
    for (const message of normalized) {
      if (message.kind !== 'tool_result') {
        total += 1;
      }
    }

    const normalizedOffset = Math.max(0, offset);
    const normalizedLimit = limit === null ? null : Math.max(0, limit);
    const startIndex = normalizedLimit === null
      ? 0
      : Math.max(0, totalNormalized - normalizedOffset - normalizedLimit);
    const messages = normalizedLimit === null
      ? normalized
      : normalized.slice(startIndex, Math.max(0, totalNormalized - normalizedOffset));

    return {
      messages,
      total,
      hasMore: normalizedLimit === null ? false : startIndex > 0,
      offset: normalizedOffset,
      limit: normalizedLimit,
    };
  }

  /**
   * Converts Grok's native transcript rows into normalized messages.
   */
  private normalizeHistoryEntries(entries: AnyRecord[], sessionId: string): NormalizedMessage[] {
    const messages: NormalizedMessage[] = [];
    const toolUseMap = new Map<string, NormalizedMessage>();
    const baseTime = Date.now();

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const ts = new Date(baseTime + index * 100).toISOString();
      const baseId = typeof entry.id === 'string' ? entry.id : `${sessionId}_${index}`;

      if (entry.type === 'system') {
        continue;
      }

      if (entry.type === 'user') {
        const text = unwrapUserQuery(stringifyContent(entry.content));
        if (!text || isInternalUserText(text)) {
          continue;
        }

        messages.push(createNormalizedMessage({
          id: baseId,
          sessionId,
          timestamp: ts,
          provider: PROVIDER,
          kind: 'text',
          role: 'user',
          content: text,
        }));
        continue;
      }

      if (entry.type === 'reasoning') {
        const summary = Array.isArray(entry.summary)
          ? entry.summary
            .map((part: AnyRecord) => (typeof part?.text === 'string' ? part.text : ''))
            .filter(Boolean)
            .join('\n')
          : '';

        if (summary.trim()) {
          messages.push(createNormalizedMessage({
            id: baseId,
            sessionId,
            timestamp: ts,
            provider: PROVIDER,
            kind: 'thinking',
            content: summary,
          }));
        }
        continue;
      }

      if (entry.type === 'assistant') {
        const text = stringifyContent(entry.content);
        if (text.trim()) {
          messages.push(createNormalizedMessage({
            id: `${baseId}_text`,
            sessionId,
            timestamp: ts,
            provider: PROVIDER,
            kind: 'text',
            role: 'assistant',
            content: text,
          }));
        }

        const toolCalls = Array.isArray(entry.tool_calls) ? entry.tool_calls : [];
        for (let callIndex = 0; callIndex < toolCalls.length; callIndex += 1) {
          const call = toolCalls[callIndex] as AnyRecord;
          const toolId = typeof call?.id === 'string' ? call.id : `${baseId}_tool_${callIndex}`;
          const message = createNormalizedMessage({
            id: `${baseId}_${callIndex}`,
            sessionId,
            timestamp: ts,
            provider: PROVIDER,
            kind: 'tool_use',
            toolName: typeof call?.name === 'string' ? call.name : 'Unknown Tool',
            toolInput: parseToolArguments(call?.arguments ?? call?.input),
            toolId,
          });

          messages.push(message);
          toolUseMap.set(toolId, message);
        }
        continue;
      }

      if (entry.type === 'tool_result') {
        const toolId = typeof entry.tool_call_id === 'string' ? entry.tool_call_id : '';
        const resultContent = stringifyContent(entry.content);
        const isError = Boolean(entry.is_error);

        messages.push(createNormalizedMessage({
          id: `${baseId}_tr_${toolId}`,
          sessionId,
          timestamp: ts,
          provider: PROVIDER,
          kind: 'tool_result',
          toolId,
          content: resultContent,
          isError,
        }));

        const toolUse = toolUseMap.get(toolId);
        if (toolUse) {
          toolUse.toolResult = { content: resultContent, isError };
        }
      }
    }

    return messages;
  }
}
