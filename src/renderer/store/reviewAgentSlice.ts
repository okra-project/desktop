/**
 * reviewAgentSlice
 *
 * Redux slice for managing the review agent chat state.
 * Handles message history, streaming status, tool calls, and edited content.
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './index';

// ============================================================================
// Types
// ============================================================================

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallReference[];
}

export interface ToolCallReference {
  id: string;
  name: string;
}

export interface ToolCall {
  id: string;
  name: string;
  status: 'pending' | 'completed' | 'error';
  result?: string;
  isError?: boolean;
  updatedContent?: string;
}

export interface AgentContext {
  jobId: string;
  documentName?: string;
  currentPage?: number;
  selectedEntityId?: string;
  selectedEntityType?: string;
  tableMarkdown?: string;
}

export type ReviewAgentStatus = 'idle' | 'streaming' | 'error';

export interface ReviewAgentState {
  messages: AgentMessage[];
  status: ReviewAgentStatus;
  error: string | null;
  context: AgentContext | null;
  toolCalls: Record<string, ToolCall>;
  activeToolCallId: string | null;
  editedContent: string | null;
  editedTableId: string | null;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: ReviewAgentState = {
  messages: [],
  status: 'idle',
  error: null,
  context: null,
  toolCalls: {},
  activeToolCallId: null,
  editedContent: null,
  editedTableId: null,
};

// ============================================================================
// Async Thunks
// ============================================================================

/**
 * Send a message to the review agent and stream the response.
 * Uses the bundled Claude Code agent via IPC (not HTTP).
 */
export const sendReviewMessage = createAsyncThunk(
  'reviewAgent/sendMessage',
  async (
    {
      content,
      context,
    }: {
      content: string;
      context?: AgentContext;
    },
    { dispatch, getState, rejectWithValue }
  ) => {
    const messageId = `msg-${Date.now()}`;
    const assistantId = `assistant-${Date.now()}`;
    const sessionId = `review-${Date.now()}`;

    // Add user message
    dispatch(
      addMessage({
        id: messageId,
        role: 'user',
        content,
        timestamp: Date.now(),
      })
    );

    // Add empty assistant message for streaming
    dispatch(
      addMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      })
    );

    dispatch(setStatus('streaming'));

    try {
      const state = getState() as RootState;
      const currentContext = context || state.reviewAgent.context;

      if (!currentContext?.jobId) {
        throw new Error('No job context provided');
      }

      // Check if electron IPC is available
      if (!window.electron?.ipcRenderer) {
        throw new Error('Electron IPC not available');
      }

      // Set up response listeners
      return new Promise<{ success: boolean }>((resolve, reject) => {
        let resolved = false;

        // Listen for responses
        const unsubscribeResponse = window.electron!.ipcRenderer.on(
          'review-agent:response',
          (...args: unknown[]) => {
            const data = args[0] as { sessionId: string; type: string; content: string };
            if (data.sessionId !== sessionId) return;

            switch (data.type) {
              case 'text':
                dispatch(updateLastMessage(data.content));
                break;
              case 'tool_result':
                // For now, just append tool results as text
                dispatch(updateLastMessage(`\n[Tool Result]: ${data.content}\n`));
                break;
            }
          }
        );

        // Listen for done
        const unsubscribeDone = window.electron!.ipcRenderer.on(
          'review-agent:done',
          (...args: unknown[]) => {
            const data = args[0] as { sessionId: string };
            if (data.sessionId !== sessionId) return;
            if (resolved) return;
            resolved = true;

            dispatch(setStatus('idle'));
            unsubscribeResponse();
            unsubscribeDone();
            unsubscribeError();
            resolve({ success: true });
          }
        );

        // Listen for errors
        const unsubscribeError = window.electron!.ipcRenderer.on(
          'review-agent:error',
          (...args: unknown[]) => {
            const data = args[0] as { sessionId: string; error: string };
            if (data.sessionId !== sessionId) return;
            if (resolved) return;
            resolved = true;

            dispatch(setError(data.error));
            dispatch(setStatus('error'));
            unsubscribeResponse();
            unsubscribeDone();
            unsubscribeError();
            reject(new Error(data.error));
          }
        );

        // Send the query via IPC
        window.electron!.ipcRenderer.sendMessage('review-agent:query', {
          sessionId,
          message: content,
          context: {
            jobId: currentContext.jobId,
            documentName: currentContext.documentName,
            currentPage: currentContext.currentPage,
            tableMarkdown: currentContext.tableMarkdown,
          },
        });

        // Timeout after 2 minutes
        setTimeout(() => {
          if (resolved) return;
          resolved = true;

          dispatch(setError('Request timed out'));
          dispatch(setStatus('error'));
          unsubscribeResponse();
          unsubscribeDone();
          unsubscribeError();

          // Send abort
          window.electron!.ipcRenderer.sendMessage('review-agent:abort', sessionId);
          reject(new Error('Request timed out'));
        }, 120000);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      dispatch(setError(errorMessage));
      dispatch(setStatus('error'));
      return rejectWithValue(errorMessage);
    }
  }
);

// ============================================================================
// Slice
// ============================================================================

const reviewAgentSlice = createSlice({
  name: 'reviewAgent',
  initialState,
  reducers: {
    // Set the OCR context for the agent
    setContext: (state, action: PayloadAction<AgentContext>) => {
      state.context = action.payload;
    },

    // Add a new message to the conversation
    addMessage: (state, action: PayloadAction<AgentMessage>) => {
      state.messages.push(action.payload);
    },

    // Update the last message content (for streaming)
    updateLastMessage: (state, action: PayloadAction<string>) => {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        lastMessage.content += action.payload;
      }
    },

    // Set the agent status
    setStatus: (state, action: PayloadAction<ReviewAgentStatus>) => {
      state.status = action.payload;
    },

    // Set an error message
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      if (action.payload) {
        state.status = 'error';
      }
    },

    // Track a tool call
    trackToolCall: (
      state,
      action: PayloadAction<{ id: string; name: string }>
    ) => {
      const { id, name } = action.payload;
      state.toolCalls[id] = {
        id,
        name,
        status: 'pending',
      };
      state.activeToolCallId = id;
    },

    // Update tool call result
    updateToolResult: (
      state,
      action: PayloadAction<{
        id: string;
        result?: string;
        updatedContent?: string;
        isError?: boolean;
      }>
    ) => {
      const { id, result, updatedContent, isError } = action.payload;
      const toolCall = state.toolCalls[id];
      if (toolCall) {
        toolCall.status = isError ? 'error' : 'completed';
        toolCall.result = result;
        toolCall.isError = isError;
        toolCall.updatedContent = updatedContent;
      }
      if (state.activeToolCallId === id) {
        state.activeToolCallId = null;
      }
      // Sync edited content if tool provided updated content
      if (updatedContent && !isError) {
        state.editedContent = updatedContent;
      }
    },

    // Set edited content manually
    setEditedContent: (state, action: PayloadAction<string | null>) => {
      state.editedContent = action.payload;
    },

    // Set the table ID being edited
    setEditedTableId: (state, action: PayloadAction<string | null>) => {
      state.editedTableId = action.payload;
    },

    // Clear all messages and reset state
    clearMessages: (state) => {
      state.messages = [];
      state.status = 'idle';
      state.error = null;
      state.toolCalls = {};
      state.activeToolCallId = null;
      state.editedContent = null;
      state.editedTableId = null;
    },

    // Reset edited content to original
    resetEditedContent: (state) => {
      state.editedContent = null;
    },
  },
});

// ============================================================================
// Actions
// ============================================================================

export const {
  setContext,
  addMessage,
  updateLastMessage,
  setStatus,
  setError,
  trackToolCall,
  updateToolResult,
  setEditedContent,
  setEditedTableId,
  clearMessages,
  resetEditedContent,
} = reviewAgentSlice.actions;

// ============================================================================
// Selectors
// ============================================================================

export const selectReviewMessages = (state: RootState) =>
  state.reviewAgent.messages;

export const selectReviewStatus = (state: RootState) =>
  state.reviewAgent.status;

export const selectReviewError = (state: RootState) =>
  state.reviewAgent.error;

export const selectReviewContext = (state: RootState) =>
  state.reviewAgent.context;

export const selectIsReviewStreaming = (state: RootState) =>
  state.reviewAgent.status === 'streaming';

export const selectToolCalls = (state: RootState) =>
  state.reviewAgent.toolCalls;

export const selectActiveToolCallId = (state: RootState) =>
  state.reviewAgent.activeToolCallId;

export const selectActiveToolCall = (state: RootState) => {
  const id = state.reviewAgent.activeToolCallId;
  return id ? state.reviewAgent.toolCalls[id] : null;
};

export const selectEditedContent = (state: RootState) =>
  state.reviewAgent.editedContent;

export const selectEditedTableId = (state: RootState) =>
  state.reviewAgent.editedTableId;

export const selectHasEdits = (state: RootState) => {
  const context = state.reviewAgent.context;
  const edited = state.reviewAgent.editedContent;
  if (!edited || !context?.tableMarkdown) return false;
  return edited !== context.tableMarkdown;
};

// ============================================================================
// Reducer
// ============================================================================

export default reviewAgentSlice.reducer;
