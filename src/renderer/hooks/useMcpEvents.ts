import { useEffect, useRef } from 'react';
import { useToast } from '../components/Toast';

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

const TOOL_LABELS: Record<string, string> = {
  list_workspaces: 'List Workspaces',
  get_workspace: 'Get Workspace',
  search_workspace: 'Search Workspace',
  global_search: 'Global Search',
  show_result: 'Show Result',
};

/**
 * Hook to subscribe to MCP server events and surface them as toasts.
 * Call this once at app root level.
 */
export function useMcpEvents() {
  const { showToast } = useToast();
  const activeSessionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Signal to main process that renderer is ready to receive events
    // This flushes any queued MCP events that were sent before we subscribed
    window.electron.ipcRenderer.invoke('progress:renderer-ready').catch((err) => {
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

    return () => {
      unsubToolCompleted();
      unsubSessionConnected();
      unsubSessionDisconnected();
      unsubServerStarted();
      unsubServerStopped();
    };
  }, [showToast]);

  return {
    activeSessions: activeSessionsRef.current.size,
  };
}
