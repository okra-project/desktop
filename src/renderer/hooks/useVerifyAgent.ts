import { useEffect, useState, useCallback } from 'react';
import type { ChatMessage } from '../components/types';
import {
  detectTodoListInMessage,
  TodoItem,
} from '../components/utils/todoDetection';

interface VerifyAgentState {
  sessionId: string | null;
  messages: ChatMessage[];
  isRunning: boolean;
  error: string | null;
  todos: TodoItem[];
}

interface SDKAssistantMessage {
  type: 'assistant';
  uuid: string;
  session_id: string;
  message: {
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: unknown;
    }>;
  };
}

interface SDKResultMessage {
  type: 'result';
  subtype: string;
  session_id: string;
}

interface SDKSystemMessage {
  type: 'system';
  subtype: string;
  session_id: string;
}

type SDKMessage =
  | SDKAssistantMessage
  | SDKResultMessage
  | SDKSystemMessage
  | { type: string; session_id?: string };

export function useVerifyAgent() {
  const [state, setState] = useState<VerifyAgentState>({
    sessionId: null,
    messages: [],
    isRunning: false,
    error: null,
    todos: [],
  });

  useEffect(() => {
    const unsubEvent = window.electron.ipcRenderer.on(
      'verify-agent:event',
      (data: unknown) => {
        const message = data as SDKMessage;

        if (
          message.type === 'system' &&
          (message as SDKSystemMessage).subtype === 'init'
        ) {
          setState((prev) => ({
            ...prev,
            sessionId: message.session_id || null,
            isRunning: true,
            error: null,
          }));
          return;
        }

        if (message.type === 'assistant') {
          const assistantMsg = message as SDKAssistantMessage;
          const textContent = assistantMsg.message.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text || '')
            .join('');

          const chatMessage: ChatMessage = {
            id: assistantMsg.uuid || Date.now().toString(),
            type: 'assistant',
            content: textContent,
            contentBlocks: assistantMsg.message
              .content as ChatMessage['contentBlocks'],
            timestamp: new Date(),
            raw: assistantMsg as unknown as ChatMessage['raw'],
          };

          const todos = detectTodoListInMessage(JSON.stringify(message));

          setState((prev) => ({
            ...prev,
            messages: [...prev.messages, chatMessage],
            todos: todos && todos.length > 0 ? todos : prev.todos,
          }));
        }

        if (message.type === 'result') {
          const resultMsg = message as SDKResultMessage;
          setState((prev) => ({
            ...prev,
            isRunning: false,
            error: resultMsg.subtype.startsWith('error_')
              ? resultMsg.subtype
              : null,
          }));
        }
      },
    );

    const unsubError = window.electron.ipcRenderer.on(
      'verify-agent:error',
      (data: unknown) => {
        const event = data as { error: string };
        setState((prev) => ({
          ...prev,
          isRunning: false,
          error: event.error,
        }));
      },
    );

    return () => {
      unsubEvent();
      unsubError();
    };
  }, []);

  const startVerification = useCallback(
    async (params: {
      workspaceId: string;
      workspacePath: string;
      totalPages: number;
      prompt?: string;
      resumeSessionId?: string;
    }) => {
      setState((prev) => ({
        ...prev,
        messages: [],
        isRunning: true,
        error: null,
        todos: [],
      }));

      const result = await window.electron.ipcRenderer.invoke(
        'verify-agent:start',
        params,
      );

      if (!result.success) {
        setState((prev) => ({
          ...prev,
          isRunning: false,
          error: result.error,
        }));
      }

      return result;
    },
    [],
  );

  const abortVerification = useCallback(async () => {
    if (!state.sessionId) return { success: false, error: 'No active session' };

    const result = await window.electron.ipcRenderer.invoke(
      'verify-agent:abort',
      state.sessionId,
    );

    if (result.success) {
      setState((prev) => ({ ...prev, isRunning: false }));
    }

    return result;
  }, [state.sessionId]);

  const clearMessages = useCallback(() => {
    setState((prev) => ({ ...prev, messages: [], todos: [] }));
  }, []);

  return {
    ...state,
    startVerification,
    abortVerification,
    clearMessages,
  };
}
