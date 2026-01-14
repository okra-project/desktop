import { useEffect, useRef, useCallback, useState } from 'react';
import { useToast } from '../components/Toast';
import { useAppDispatch } from '../store';
import { setResultsFromMcp } from '../store/querySlice';
import type { QueryResultSet } from '../../shared/types/query';

interface McpToolCalledEvent {
  tool: string;
  params: Record<string, unknown>;
  timestamp: number;
}

interface McpToolCompletedEvent {
  tool: string;
  success: boolean;
  durationMs: number;
  error?: string;
  timestamp: number;
}

interface McpSessionEvent {
  sessionId: string;
  timestamp: number;
}

interface McpServerEvent {
  port?: number;
  timestamp: number;
}

interface McpAskUserEvent {
  requestId: string;
  question: string;
  options?: string[];
  context?: string;
  pageRef?: number;
  timestamp: number;
}

interface McpRequestReviewEvent {
  requestId: string;
  pageNumber: number;
  items: Array<{
    id: string;
    type: string;
    confidence: number;
    issue?: string;
  }>;
  urgency: 'low' | 'medium' | 'high';
  reasoning?: string;
  timestamp: number;
}

export interface McpVerifyApprovalEvent {
  requestId: string;
  workspaceId: string;
  pageNumber: number;
  analysis: {
    contentType: string;
    confidence: number;
    findings: string[];
    issues?: string[];
  };
  extractions: {
    docai?: string;
    openrouter?: string;
    'qwen-markdown'?: string;
    parse?: string;
  };
  timestamp: number;
}

export interface PendingHumanRequest {
  type: 'ask_user' | 'request_review' | 'verify_approval';
  requestId: string;
  data: McpAskUserEvent | McpRequestReviewEvent | McpVerifyApprovalEvent;
}

const TOOL_LABELS: Record<string, string> = {
  list_workspaces: 'List Workspaces',
  get_workspace: 'Get Workspace',
  search_workspace: 'Search Workspace',
  global_search: 'Global Search',
  show_result: 'Show Result',
  query: 'Query',
  codemode: 'Codemode',
};

/**
 * Hook to subscribe to MCP server events and surface them as toasts.
 * Call this once at app root level.
 */
export function useMcpEvents() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const activeSessionsRef = useRef<Set<string>>(new Set());
  const [pendingRequest, setPendingRequest] =
    useState<PendingHumanRequest | null>(null);

  const respondToRequest = useCallback(
    async (requestId: string, response: unknown) => {
      try {
        await window.electron.ipcRenderer.invoke('human-input:response', {
          requestId,
          response,
        });
        setPendingRequest(null);
        showToast('success', 'Response sent to agent', 2000);
      } catch (err) {
        console.error('[useMcpEvents] Failed to send response:', err);
        showToast('error', 'Failed to send response', 3000);
      }
    },
    [showToast],
  );

  const dismissRequest = useCallback(() => {
    setPendingRequest(null);
  }, []);

  useEffect(() => {
    window.electron.ipcRenderer
      .invoke('progress:renderer-ready')
      .catch((err) => {
        console.warn('[useMcpEvents] Failed to signal renderer ready:', err);
      });

    // Tool completed - show results
    const unsubToolCompleted = window.electron.ipcRenderer.on(
      'mcp:tool-completed',
      (data: unknown) => {
        const event = data as McpToolCompletedEvent;
        const toolLabel = TOOL_LABELS[event.tool] || event.tool;

        if (event.success) {
          showToast('info', `MCP: ${toolLabel} (${event.durationMs}ms)`, 3000);
        } else {
          showToast(
            'error',
            `MCP: ${toolLabel} failed${event.error ? `: ${event.error}` : ''}`,
            5000,
          );
        }
      },
    );

    // Session connected
    const unsubSessionConnected = window.electron.ipcRenderer.on(
      'mcp:session-connected',
      (data: unknown) => {
        const event = data as McpSessionEvent;
        activeSessionsRef.current.add(event.sessionId);
        showToast('success', 'MCP client connected', 3000);
      },
    );

    // Session disconnected
    const unsubSessionDisconnected = window.electron.ipcRenderer.on(
      'mcp:session-disconnected',
      (data: unknown) => {
        const event = data as McpSessionEvent;
        activeSessionsRef.current.delete(event.sessionId);
        showToast('info', 'MCP client disconnected', 3000);
      },
    );

    // Server started
    const unsubServerStarted = window.electron.ipcRenderer.on(
      'mcp:server-started',
      (data: unknown) => {
        const event = data as McpServerEvent;
        showToast('success', `MCP server started on port ${event.port}`, 3000);
      },
    );

    // Server stopped
    const unsubServerStopped = window.electron.ipcRenderer.on(
      'mcp:server-stopped',
      () => {
        activeSessionsRef.current.clear();
        showToast('info', 'MCP server stopped', 3000);
      },
    );

    const unsubQueryResults = window.electron.ipcRenderer.on(
      'query:results',
      (data: unknown) => {
        const event = data as { results: QueryResultSet; timestamp: number };
        dispatch(setResultsFromMcp(event.results));
        showToast(
          'info',
          `Query: ${event.results.totalCount} result(s) in ${event.results.executionMs}ms`,
          3000,
        );
      },
    );

    const unsubAskUser = window.electron.ipcRenderer.on(
      'human-input:ask-user',
      (data: unknown) => {
        const event = data as McpAskUserEvent;
        setPendingRequest({
          type: 'ask_user',
          requestId: event.requestId,
          data: event,
        });
        showToast('info', 'Agent is asking a question...', 5000);
      },
    );

    const unsubRequestReview = window.electron.ipcRenderer.on(
      'human-input:request-review',
      (data: unknown) => {
        const event = data as McpRequestReviewEvent;
        setPendingRequest({
          type: 'request_review',
          requestId: event.requestId,
          data: event,
        });
        showToast(
          event.urgency === 'high' ? 'error' : 'info',
          `Agent requests review of page ${event.pageNumber}`,
          5000,
        );
      },
    );

    const unsubVerifyApproval = window.electron.ipcRenderer.on(
      'human-input:verify-approval',
      (data: unknown) => {
        const event = data as McpVerifyApprovalEvent;
        setPendingRequest({
          type: 'verify_approval',
          requestId: event.requestId,
          data: event,
        });
        showToast(
          'info',
          `Page ${event.pageNumber}: ${event.analysis.contentType} - awaiting verification`,
          5000,
        );
      },
    );

    return () => {
      unsubToolCompleted();
      unsubSessionConnected();
      unsubSessionDisconnected();
      unsubServerStarted();
      unsubServerStopped();
      unsubQueryResults();
      unsubAskUser();
      unsubRequestReview();
      unsubVerifyApproval();
    };
  }, [showToast, dispatch]);

  return {
    activeSessions: activeSessionsRef.current.size,
    pendingRequest,
    respondToRequest,
    dismissRequest,
  };
}
