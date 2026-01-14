import React, { useState, useEffect, useCallback, useRef } from 'react';
import { type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { selectIsAnthropicConfigured, selectIsHydrated } from '@okrapdf/redux';
import { useAppSelector } from '../store';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { ChatMessage, OutputFile } from './types';
import { detectTodoListInMessage, TodoItem } from './utils/todoDetection';

interface ChatInterfaceProps {
  onOpenSettings: () => void;
  workspaceId?: string;
  workspacePath?: string;
  totalPages?: number;
}

function ChatInterface({
  onOpenSettings,
  workspaceId,
  workspacePath,
  totalPages,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTodos, setCurrentTodos] = useState<TodoItem[]>([]);
  const verifySessionId = useRef<string | null>(null);

  const isHydrated = useAppSelector(selectIsHydrated);
  const hasApiKey = useAppSelector(selectIsAnthropicConfigured);

  useEffect(() => {
    // Set up listeners for Claude Code responses
    const removeResponseListener = window.electron.ipcRenderer.on(
      'claude-code:response',
      (message: SDKMessage) => {
        if (message.type === 'assistant') {
          setMessages((prev) => {
            const existingIndex = prev.findIndex(
              (m) => m.type === 'assistant' && !m.content,
            );

            // Extract text content for backward compatibility
            const textContent = message.message.content
              .filter((c) => c.type === 'text')
              .map((c) => (c.type === 'text' ? c.text : ''))
              .join('');

            // Preserve all content blocks (text, tool_use, thinking)
            const contentBlocks = message.message.content;

            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = {
                ...updated[existingIndex],
                content: textContent,
                contentBlocks: contentBlocks as any,
                raw: message,
                isThinking: false,
              };

              // Check for todo list in this message
              const todos = detectTodoListInMessage(JSON.stringify(message));
              if (todos && todos.length > 0) {
                setCurrentTodos(todos);
              }
              return updated;
            }

            const newMessage = {
              id: Date.now().toString(),
              type: 'assistant',
              content: textContent,
              contentBlocks: contentBlocks as any,
              timestamp: new Date(),
              raw: message,
            };

            // Check for todo list in this message
            const todos = detectTodoListInMessage(JSON.stringify(message));
            if (todos && todos.length > 0) {
              setCurrentTodos(todos);
            }

            return [...prev, newMessage];
          });
        } else if (message.type === 'result') {
          setIsLoading(false);
        }
      },
    );

    const removeErrorListener = window.electron.ipcRenderer.on(
      'claude-code:error',
      (errorMessage: string) => {
        setError(errorMessage);
        setIsLoading(false);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            type: 'error',
            content: `Error: ${errorMessage}`,
            timestamp: new Date(),
          },
        ]);
      },
    );

    const removeOutputFilesListener = window.electron.ipcRenderer.on(
      'claude-code:output-files',
      (outputFiles: OutputFile[]) => {
        console.log('Received output files:', outputFiles);
        setMessages((prev) => {
          const updated = [...prev];
          const lastAssistantIndex = updated.findLastIndex(
            (m) => m.type === 'assistant',
          );

          if (lastAssistantIndex >= 0) {
            updated[lastAssistantIndex] = {
              ...updated[lastAssistantIndex],
              outputFiles,
            };
          }

          return updated;
        });
      },
    );

    // Verify agent events - converge into same message stream
    const removeVerifyEventListener = window.electron.ipcRenderer.on(
      'verify-agent:event',
      (data: unknown) => {
        const message = data as {
          type: string;
          session_id?: string;
          subtype?: string;
          uuid?: string;
          message?: { content: Array<{ type: string; text?: string }> };
        };

        if (message.type === 'system' && message.subtype === 'init') {
          verifySessionId.current = message.session_id || null;
          return;
        }

        if (message.type === 'assistant' && message.message) {
          const textContent = message.message.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text || '')
            .join('');

          const chatMessage: ChatMessage = {
            id: message.uuid || Date.now().toString(),
            type: 'assistant',
            content: textContent,
            contentBlocks: message.message.content as ChatMessage['contentBlocks'],
            timestamp: new Date(),
            raw: message as unknown as ChatMessage['raw'],
          };

          const todos = detectTodoListInMessage(JSON.stringify(message));

          setMessages((prev) => [...prev, chatMessage]);
          if (todos && todos.length > 0) {
            setCurrentTodos(todos);
          }
        }

        if (message.type === 'result') {
          setIsLoading(false);
          verifySessionId.current = null;
        }
      },
    );

    const removeVerifyErrorListener = window.electron.ipcRenderer.on(
      'verify-agent:error',
      (data: unknown) => {
        const event = data as { error: string };
        setError(event.error);
        setIsLoading(false);
        verifySessionId.current = null;
      },
    );

    return () => {
      removeResponseListener();
      removeErrorListener();
      removeOutputFilesListener();
      removeVerifyEventListener();
      removeVerifyErrorListener();
    };
  }, []);

  const sendMessage = useCallback(
    async (content: string, files?: File[]) => {
      if ((!content.trim() && !files?.length) || isLoading) return;

      // Create user message content with file info
      let displayContent = content;
      if (files?.length) {
        const fileList = files.map((f) => f.name).join(', ');
        displayContent = content
          ? `${content}\n\nFiles: ${fileList}`
          : `Files: ${fileList}`;
      }

      // Add user message
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'user',
        content: displayContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Add placeholder for assistant response
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: '',
          timestamp: new Date(),
          isThinking: true,
        },
      ]);

      setIsLoading(true);
      setError(null);

      // Send query to main process with files (convert File objects to transferable format)
      const sendQuery = async () => {
        let fileData: { name: string; buffer: ArrayBuffer }[] | undefined;

        if (files?.length) {
          fileData = await Promise.all(
            files.map(async (file) => ({
              name: file.name,
              buffer: await file.arrayBuffer(),
            })),
          );
        }

        window.electron.ipcRenderer.sendMessage('claude-code:query', {
          content,
          files: fileData,
        });
      };

      sendQuery();
    },
    [isLoading],
  );

  if (!isHydrated) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-okra-yellow" />
        </div>
      </div>
    );
  }

  if (!hasApiKey) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-4">🔑</div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">
              API Key Required
            </h2>
            <p className="text-gray-600 mb-4">
              Add your Anthropic API key to start chatting with your document.
            </p>
            <button
              onClick={onOpenSettings}
              className="px-4 py-2 bg-okra-yellow text-gray-900 rounded-lg font-medium hover:bg-okra-yellow/90 transition-colors"
            >
              Open Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleStartVerify = useCallback(async () => {
    if (!workspaceId || !workspacePath || !totalPages) {
      setError('Workspace info not available');
      return;
    }

    // Add system message to chat
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: 'user',
        content: 'Verify all page extractions',
        timestamp: new Date(),
      },
      {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: '',
        timestamp: new Date(),
        isThinking: true,
      },
    ]);

    setIsLoading(true);
    setError(null);

    const result = await window.electron.ipcRenderer.invoke('verify-agent:start', {
      workspaceId,
      workspacePath,
      totalPages,
    });

    if (!result.success) {
      setError(result.error);
      setIsLoading(false);
    }
  }, [workspaceId, workspacePath, totalPages]);

  const quickActions = [
    {
      label: 'Verify Extractions',
      icon: '✓',
      action: handleStartVerify,
    },
    {
      label: 'Export Tables',
      prompt:
        'Find and extract all tables from this document into a single Excel file. Include page numbers as a column.',
      icon: '📊',
    },
    {
      label: 'Summarize Document',
      prompt:
        'Give me a brief summary of this document. What are the key sections and main takeaways?',
      icon: '📝',
    },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        {messages.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <div className="text-4xl mb-4">📄</div>
            <h2 className="text-lg font-medium text-ink mb-2">
              What would you like to do?
            </h2>
            <p className="text-sidebar-text text-sm mb-6 text-center max-w-md">
              Ask questions about your document, extract data, or verify
              extractions.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() =>
                    action.action
                      ? action.action()
                      : action.prompt && sendMessage(action.prompt)
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-sidebar-border rounded-lg hover:border-okra-yellow hover:bg-okra-yellow/5 transition-colors text-sm text-ink"
                >
                  <span>{action.icon}</span>
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList
            messages={messages}
            isLoading={isLoading}
            currentTodos={currentTodos}
          />
        )}
      </div>

      <div className="border-t border-sidebar-border bg-white">
        <MessageInput onSendMessage={sendMessage} disabled={isLoading} />
      </div>

      {error && (
        <div className="absolute top-4 right-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}

export default ChatInterface;
