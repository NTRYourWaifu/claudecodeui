import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '../../../utils/api';
import { CLAUDE_MODELS, CODEX_MODELS, CURSOR_MODELS, GEMINI_MODELS } from '../../../../shared/modelConstants';
import type { PendingPermissionRequest, PermissionMode } from '../types/types';
import type { ProjectSession, LLMProvider } from '../../../types/app';

const getPermissionModesForProvider = (provider: LLMProvider): PermissionMode[] => {
  if (provider === 'codex') {
    return ['default', 'acceptEdits', 'bypassPermissions'];
  }
  if (provider === 'claude') {
    return ['default', 'auto', 'acceptEdits', 'bypassPermissions', 'plan'];
  }
  return ['default', 'acceptEdits', 'bypassPermissions', 'plan'];
};

interface UseChatProviderStateArgs {
  selectedSession: ProjectSession | null;
}

/**
 * 讀出上次選的 model，但必須是**目前清單裡還存在的**才採用。
 *
 * 模型會退場（例如 Opus 4.7 被 Opus 5 取代後從清單移除），而 localStorage 存的是
 * 當時選的字串。若不驗證就直接用，UI 會顯示生的 model ID（找不到對應 label）、
 * effort 支援度也會比對不到任何分支而掉到最保守的那一組。
 */
function readStoredModel(key: string, options: { value: string }[], fallback: string): string {
  try {
    const stored = localStorage.getItem(key);
    if (stored && options.some((o) => o.value === stored)) return stored;
  } catch {
    // localStorage 被隱私模式擋掉時，直接用預設值
  }
  return fallback;
}

export function useChatProviderState({ selectedSession }: UseChatProviderStateArgs) {
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');
  const [pendingPermissionRequests, setPendingPermissionRequests] = useState<PendingPermissionRequest[]>([]);
  const [provider, setProvider] = useState<LLMProvider>(() => {
    return (localStorage.getItem('selected-provider') as LLMProvider) || 'claude';
  });
  const [cursorModel, setCursorModel] = useState<string>(() => {
    return readStoredModel('cursor-model', CURSOR_MODELS.OPTIONS, CURSOR_MODELS.DEFAULT);
  });
  const [claudeModel, setClaudeModel] = useState<string>(() => {
    return readStoredModel('claude-model', CLAUDE_MODELS.OPTIONS, CLAUDE_MODELS.DEFAULT);
  });
  const [codexModel, setCodexModel] = useState<string>(() => {
    return readStoredModel('codex-model', CODEX_MODELS.OPTIONS, CODEX_MODELS.DEFAULT);
  });
  const [geminiModel, setGeminiModel] = useState<string>(() => {
    return readStoredModel('gemini-model', GEMINI_MODELS.OPTIONS, GEMINI_MODELS.DEFAULT);
  });

  const lastProviderRef = useRef(provider);

  useEffect(() => {
    if (!selectedSession?.id) {
      return;
    }

    const savedMode = localStorage.getItem(`permissionMode-${selectedSession.id}`) as PermissionMode | null;
    const validModes = getPermissionModesForProvider(provider);
    setPermissionMode(savedMode && validModes.includes(savedMode) ? savedMode : 'default');
  }, [selectedSession?.id, provider]);

  useEffect(() => {
    if (!selectedSession?.__provider || selectedSession.__provider === provider) {
      return;
    }

    setProvider(selectedSession.__provider);
    localStorage.setItem('selected-provider', selectedSession.__provider);
  }, [provider, selectedSession]);

  useEffect(() => {
    if (lastProviderRef.current === provider) {
      return;
    }
    setPendingPermissionRequests([]);
    lastProviderRef.current = provider;
  }, [provider]);

  useEffect(() => {
    setPendingPermissionRequests((previous) =>
      previous.filter((request) => !request.sessionId || request.sessionId === selectedSession?.id),
    );
  }, [selectedSession?.id]);

  useEffect(() => {
    if (provider !== 'cursor') {
      return;
    }

    authenticatedFetch('/api/cursor/config')
      .then((response) => response.json())
      .then((data) => {
        if (!data.success || !data.config?.model?.modelId) {
          return;
        }

        const modelId = data.config.model.modelId as string;
        if (!localStorage.getItem('cursor-model')) {
          setCursorModel(modelId);
        }
      })
      .catch((error) => {
        console.error('Error loading Cursor config:', error);
      });
  }, [provider]);

  const cyclePermissionMode = useCallback(() => {
    const modes = getPermissionModesForProvider(provider);

    const currentIndex = modes.indexOf(permissionMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];
    setPermissionMode(nextMode);

    if (selectedSession?.id) {
      localStorage.setItem(`permissionMode-${selectedSession.id}`, nextMode);
    }
  }, [permissionMode, provider, selectedSession?.id]);

  return {
    provider,
    setProvider,
    cursorModel,
    setCursorModel,
    claudeModel,
    setClaudeModel,
    codexModel,
    setCodexModel,
    geminiModel,
    setGeminiModel,
    permissionMode,
    setPermissionMode,
    pendingPermissionRequests,
    setPendingPermissionRequests,
    cyclePermissionMode,
  };
}
