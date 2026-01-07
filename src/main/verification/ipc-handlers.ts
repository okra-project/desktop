/**
 * Verification IPC Handlers
 *
 * Handles communication between main and renderer processes
 * for the verification system.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { VerificationRuntime, runtimeManager } from './runtime';
import { eventStreamManager, EventStream } from './eventStream';
import type {
  SessionConfig,
  VerificationSession,
  PermissionResponse,
  Action,
  PageVerificationState,
} from '../../shared/types/verification';

// ============================================
// Session State Storage (in-memory for now)
// ============================================

const sessions: Map<string, VerificationSession> = new Map();

// ============================================
// Helper Functions
// ============================================

function createInitialPageState(pageNumber: number): PageVerificationState {
  return {
    pageNumber,
    status: 'pending',
    extractions: [],
    reviewHistory: [],
    mergedToSource: false,
  };
}

function getWebContents(): Electron.WebContents | null {
  const windows = BrowserWindow.getAllWindows();
  return windows[0]?.webContents || null;
}

// ============================================
// Session Management Handlers
// ============================================

export function setupVerificationIpcHandlers(): void {
  console.error('[Verification IPC] Setting up handlers...');

  // ==========================================
  // Session Lifecycle
  // ==========================================

  /**
   * Start a new verification session
   */
  ipcMain.handle('verification:start-session', async (_event, config: SessionConfig) => {
    try {
      console.error('[Verification] Starting session for document:', config.documentId);

      const sessionId = uuidv4();
      const now = new Date();

      // Initialize page states
      const pageStates: Record<number, PageVerificationState> = {};
      for (let i = 1; i <= config.totalPages; i++) {
        pageStates[i] = createInitialPageState(i);
      }

      // Create session
      const session: VerificationSession = {
        id: sessionId,
        documentId: config.documentId,
        documentName: config.documentName,
        startedAt: now,
        status: 'active',
        permissionLevel: config.permissionLevel,
        agentType: config.agentType,
        currentPageIndex: 1,
        totalPages: config.totalPages,
        events: [],
        pageStates,
      };

      // Store session
      sessions.set(sessionId, session);

      // Create event stream
      eventStreamManager.getStream(sessionId);

      // Create runtime
      const runtime = runtimeManager.createRuntime(sessionId, {
        permissionLevel: config.permissionLevel,
        autoCommitDelay: config.permissionLevel === 'yolo' ? 2000 : undefined,
      });

      // Initialize runtime with webContents
      const webContents = getWebContents();
      if (webContents) {
        runtime.initialize(session, webContents);
      }

      console.error('[Verification] Session started:', sessionId);

      return {
        success: true,
        session: {
          ...session,
          startedAt: session.startedAt.toISOString(),
        },
      };
    } catch (error) {
      console.error('[Verification] Failed to start session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Pause a verification session
   */
  ipcMain.handle('verification:pause-session', async (_event, sessionId: string) => {
    try {
      const session = sessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      session.status = 'paused';
      runtimeManager.getRuntime(sessionId)?.pause();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Resume a verification session
   */
  ipcMain.handle('verification:resume-session', async (_event, sessionId: string) => {
    try {
      const session = sessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      session.status = 'active';
      runtimeManager.getRuntime(sessionId)?.resume();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * End a verification session
   */
  ipcMain.handle('verification:end-session', async (_event, sessionId: string) => {
    try {
      const session = sessions.get(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      session.status = 'completed';
      session.completedAt = new Date();

      // Clean up runtime
      runtimeManager.removeRuntime(sessionId);

      console.error('[Verification] Session ended:', sessionId);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * Get session details
   */
  ipcMain.handle('verification:get-session', async (_event, sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    return {
      success: true,
      session: {
        ...session,
        startedAt: session.startedAt.toISOString(),
        completedAt: session.completedAt?.toISOString(),
      },
    };
  });

  /**
   * List all sessions
   */
  ipcMain.handle('verification:list-sessions', async () => {
    const sessionList = Array.from(sessions.values()).map((s) => ({
      id: s.id,
      documentId: s.documentId,
      documentName: s.documentName,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      completedAt: s.completedAt?.toISOString(),
      progress: {
        approved: Object.values(s.pageStates).filter((p) => p.status === 'approved').length,
        total: s.totalPages,
      },
    }));

    return { success: true, sessions: sessionList };
  });

  // ==========================================
  // Permission Flow
  // ==========================================

  /**
   * Handle permission response from renderer
   */
  ipcMain.on('verification:permission-response', (_event, response: PermissionResponse) => {
    const { requestId, approved } = response;

    // Find the runtime that has this pending approval
    for (const [sessionId] of sessions) {
      const runtime = runtimeManager.getRuntime(sessionId);
      if (runtime) {
        runtime.handlePermissionResponse(requestId, approved);
        break;
      }
    }
  });

  // ==========================================
  // Event Stream
  // ==========================================

  /**
   * Get events for a session
   */
  ipcMain.handle('verification:get-events', async (_event, sessionId: string) => {
    const stream = eventStreamManager.getStream(sessionId);
    return {
      success: true,
      events: stream.getAll().map((e) => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })),
    };
  });

  /**
   * Get events since a specific index
   */
  ipcMain.handle(
    'verification:get-events-since',
    async (_event, sessionId: string, index: number) => {
      const stream = eventStreamManager.getStream(sessionId);
      return {
        success: true,
        events: stream.getSince(index).map((e) => ({
          ...e,
          timestamp: e.timestamp.toISOString(),
        })),
      };
    }
  );

  // ==========================================
  // Action Execution (from agent)
  // ==========================================

  /**
   * Execute an action from the agent
   */
  ipcMain.handle(
    'verification:execute-action',
    async (_event, sessionId: string, action: Action) => {
      try {
        const runtime = runtimeManager.getRuntime(sessionId);
        if (!runtime) {
          return { success: false, error: 'Runtime not found' };
        }

        // Add action to event stream
        const stream = eventStreamManager.getStream(sessionId);
        stream.push({
          ...action,
          timestamp: new Date(action.timestamp),
        });

        // Execute action
        const observation = await runtime.executeAction(action);

        return {
          success: true,
          observation: {
            ...observation,
            timestamp: observation.timestamp.toISOString(),
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // ==========================================
  // rrweb Recording Events
  // ==========================================

  /**
   * Store rrweb events for session replay
   */
  ipcMain.on('verification:rrweb-event', (_event, data: { sessionId: string; event: any }) => {
    const session = sessions.get(data.sessionId);
    if (!session) return;

    // Store the rrweb event path or append to session
    // For now, we just log it - persistence will be added later
    console.error('[Verification] rrweb event received for session:', data.sessionId);
  });

  // ==========================================
  // State Change Notifications
  // ==========================================

  /**
   * Receive state changes from renderer (Redux sync)
   */
  ipcMain.on('verification:state-changed', (_event, data: { type: string; payload: any }) => {
    console.error('[Verification] State changed:', data.type);
    // This can be used to sync state or trigger persistence
  });

  console.error('[Verification IPC] Handlers registered');
}

// ============================================
// Cleanup Function
// ============================================

export function cleanupVerificationIpcHandlers(): void {
  // Clean up all runtimes
  runtimeManager.clearAll();

  // Clear event streams
  eventStreamManager.clearAll();

  // Clear sessions
  sessions.clear();

  console.error('[Verification IPC] Cleaned up');
}
