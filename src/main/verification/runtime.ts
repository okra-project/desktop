/**
 * VerificationRuntime - Action Executor
 *
 * Executes agent actions and produces observations.
 * Handles permission checking, ghost overlays, and
 * communication with the renderer process.
 */

import { BrowserWindow, WebContents, ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { EventStream, eventStreamManager } from './eventStream';
import type {
  VerificationSession,
  Action,
  Observation,
  ActionType,
  ObservationType,
  PermissionLevel,
  PermissionRequest,
  GhostOverlay,
  GhostType,
  requiresPermission,
} from '../../shared/types/verification';
import { VERIFICATION_TOOLS } from '../../shared/types/verification';

// ============================================
// Types
// ============================================

interface PermissionResult {
  allowed: boolean;
  needsApproval: boolean;
  reason?: string;
}

interface RuntimeConfig {
  permissionLevel: PermissionLevel;
  autoCommitDelay?: number; // ms, for YOLO mode
}

// ============================================
// VerificationRuntime Class
// ============================================

export class VerificationRuntime {
  private session: VerificationSession | null = null;
  private eventStream: EventStream | null = null;
  private webContents: WebContents | null = null;
  private config: RuntimeConfig;
  private pendingApproval: Map<string, {
    resolve: (approved: boolean) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private isRunning: boolean = false;

  constructor(config: RuntimeConfig) {
    this.config = config;
  }

  // ==========================================
  // Session Management
  // ==========================================

  /**
   * Initialize runtime with a session
   */
  initialize(
    session: VerificationSession,
    webContents: WebContents
  ): void {
    this.session = session;
    this.webContents = webContents;
    this.eventStream = eventStreamManager.getStream(session.id);
    this.isRunning = true;

    console.error('[Runtime] Initialized for session:', session.id);
  }

  /**
   * Check if runtime is ready
   */
  isReady(): boolean {
    return !!(this.session && this.eventStream && this.webContents);
  }

  /**
   * Pause the runtime
   */
  pause(): void {
    this.isRunning = false;
    console.error('[Runtime] Paused');
  }

  /**
   * Resume the runtime
   */
  resume(): void {
    this.isRunning = true;
    console.error('[Runtime] Resumed');
  }

  /**
   * Stop the runtime
   */
  stop(): void {
    this.isRunning = false;
    this.pendingApproval.clear();
    console.error('[Runtime] Stopped');
  }

  // ==========================================
  // Permission Checking
  // ==========================================

  /**
   * Check if an action requires permission based on current level
   */
  private checkPermission(action: Action): PermissionResult {
    const level = this.config.permissionLevel;

    // YOLO mode - allow everything
    if (level === 'yolo') {
      return { allowed: true, needsApproval: false };
    }

    // Get tool definition
    const toolDef = VERIFICATION_TOOLS[action.type];
    if (!toolDef) {
      return { allowed: true, needsApproval: false };
    }

    // Check permission level
    const toolLevel = toolDef.permissionLevel;

    // Query-level actions are always allowed
    if (toolLevel === 'none') {
      return { allowed: true, needsApproval: false };
    }

    // Explicit permission always requires approval
    if (toolLevel === 'explicit') {
      return { allowed: true, needsApproval: true };
    }

    // Page-level permission
    if (level === 'page') {
      if (toolLevel === 'page' || toolLevel === 'edit') {
        return { allowed: true, needsApproval: true };
      }
    }

    // Edit-level permission (most restrictive)
    if (level === 'edit') {
      if (toolLevel === 'edit') {
        return { allowed: true, needsApproval: true };
      }
    }

    return { allowed: true, needsApproval: false };
  }

  // ==========================================
  // Ghost Overlay
  // ==========================================

  /**
   * Show a ghost overlay for an action
   */
  private async showGhostOverlay(action: Action): Promise<void> {
    if (!this.webContents) return;

    const ghostType = this.getGhostType(action.type);
    const ghost: GhostOverlay = {
      id: uuidv4(),
      type: ghostType,
      pageNumber: this.extractPageNumber(action),
      timestamp: new Date(),
      autoCommitDelay: this.config.permissionLevel === 'yolo'
        ? this.config.autoCommitDelay || 2000
        : undefined,
      content: {
        reasoning: this.extractReasoning(action),
        confidence: 0.9, // TODO: Get from agent
        ...this.extractGhostContent(action),
      },
    };

    this.webContents.send('verification:ghost-show', ghost);
  }

  /**
   * Hide the current ghost overlay
   */
  private hideGhostOverlay(): void {
    if (!this.webContents) return;
    this.webContents.send('verification:ghost-hide');
  }

  /**
   * Map action type to ghost type
   */
  private getGhostType(actionType: ActionType): GhostType {
    switch (actionType) {
      case 'edit_extraction':
        return 'field_correction';
      case 'approve_page':
      case 'reject_page':
        return 'status_change';
      case 'add_annotation':
        return 'annotation';
      case 'navigate':
        return 'navigation';
      case 'think':
      default:
        return 'thinking';
    }
  }

  /**
   * Extract page number from action payload
   */
  private extractPageNumber(action: Action): number {
    const payload = action.payload as any;
    return payload?.pageNumber || this.session?.currentPageIndex || 1;
  }

  /**
   * Extract reasoning from action payload
   */
  private extractReasoning(action: Action): string {
    const payload = action.payload as any;
    return payload?.reasoning || payload?.thought || `Executing ${action.type}`;
  }

  /**
   * Extract ghost content from action
   */
  private extractGhostContent(action: Action): Partial<{
    fieldName: string;
    currentValue: unknown;
    proposedValue: unknown;
    proposedStatus: 'pending' | 'in_review' | 'approved' | 'rejected' | 'needs_correction';
  }> {
    const payload = action.payload as any;

    if (action.type === 'edit_extraction') {
      return {
        fieldName: payload.field,
        proposedValue: payload.newValue,
      };
    }

    if (action.type === 'approve_page' || action.type === 'reject_page') {
      return {
        proposedStatus: action.type === 'approve_page' ? 'approved' : 'rejected',
      };
    }

    return {};
  }

  // ==========================================
  // Approval Flow
  // ==========================================

  /**
   * Wait for user approval
   */
  private async waitForApproval(action: Action): Promise<boolean> {
    if (!this.webContents) return false;

    return new Promise((resolve, reject) => {
      const requestId = uuidv4();

      // Store pending approval
      this.pendingApproval.set(requestId, { resolve, reject });

      // Create permission request
      const request: PermissionRequest = {
        id: requestId,
        sessionId: this.session?.id || '',
        timestamp: new Date(),
        action: {
          type: action.type as any,
          ...(action.payload as any),
        },
        context: {
          pageNumber: this.extractPageNumber(action),
          reasoning: this.extractReasoning(action),
        },
        status: 'pending',
      };

      // Send to renderer
      this.webContents?.send('verification:permission-request', request);

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.pendingApproval.has(requestId)) {
          this.pendingApproval.delete(requestId);
          resolve(false);
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Handle permission response from renderer
   */
  handlePermissionResponse(requestId: string, approved: boolean): void {
    const pending = this.pendingApproval.get(requestId);
    if (pending) {
      this.pendingApproval.delete(requestId);
      pending.resolve(approved);
    }
  }

  // ==========================================
  // Action Execution
  // ==========================================

  /**
   * Execute an action and produce an observation
   */
  async executeAction(action: Action): Promise<Observation> {
    if (!this.eventStream || !this.session) {
      throw new Error('Runtime not initialized');
    }

    // Check permissions
    const permissionResult = this.checkPermission(action);

    if (!permissionResult.allowed) {
      return this.createObservation(action, 'permission_denied', false, {
        actionType: action.type,
        reason: permissionResult.reason || 'Action not allowed',
      });
    }

    // Show ghost overlay
    await this.showGhostOverlay(action);

    // Wait for approval if needed
    if (permissionResult.needsApproval) {
      const approved = await this.waitForApproval(action);
      if (!approved) {
        this.hideGhostOverlay();
        return this.createObservation(action, 'permission_denied', false, {
          actionType: action.type,
          reason: 'User rejected action',
        });
      }
    }

    // Execute the action
    try {
      const observation = await this.executeActionInternal(action);
      this.hideGhostOverlay();
      return observation;
    } catch (error) {
      this.hideGhostOverlay();
      return this.createObservation(
        action,
        'permission_denied',
        false,
        {
          actionType: action.type,
          reason: error instanceof Error ? error.message : 'Execution failed',
        }
      );
    }
  }

  /**
   * Internal action execution
   */
  private async executeActionInternal(action: Action): Promise<Observation> {
    switch (action.type) {
      case 'navigate':
        return this.executeNavigate(action);
      case 'query_extractions':
        return this.executeQuery(action);
      case 'edit_extraction':
        return this.executeEdit(action);
      case 'approve_page':
        return this.executeApprove(action);
      case 'reject_page':
        return this.executeReject(action);
      case 'add_annotation':
        return this.executeAnnotation(action);
      case 'think':
        return this.executeThink(action);
      default:
        return this.createObservation(action, 'permission_denied', false, {
          actionType: action.type,
          reason: `Unknown action type: ${action.type}`,
        });
    }
  }

  // ==========================================
  // Action Handlers
  // ==========================================

  private async executeNavigate(action: Action): Promise<Observation> {
    const payload = action.payload as { pageNumber: number };

    // Update session state
    if (this.session) {
      this.session.currentPageIndex = payload.pageNumber;
    }

    // Notify renderer
    this.webContents?.send('verification:navigate', payload.pageNumber);

    return this.createObservation(action, 'page_content', true, {
      pageNumber: payload.pageNumber,
      extractionCount: this.session?.pageStates[payload.pageNumber]?.extractions?.length || 0,
    });
  }

  private async executeQuery(action: Action): Promise<Observation> {
    const payload = action.payload as { pageNumber?: number; query?: string };
    const pageNumber = payload.pageNumber || this.session?.currentPageIndex || 1;

    const extractions = this.session?.pageStates[pageNumber]?.extractions || [];

    return this.createObservation(action, 'extraction_data', true, {
      extractions,
      totalCount: extractions.length,
    });
  }

  private async executeEdit(action: Action): Promise<Observation> {
    const payload = action.payload as {
      extractionId: string;
      field: string;
      newValue: unknown;
    };

    // Send to renderer for UI update
    this.webContents?.send('verification:edit-extraction', payload);

    return this.createObservation(action, 'edit_result', true, {
      extractionId: payload.extractionId,
      field: payload.field,
      oldValue: null, // TODO: Get from state
      newValue: payload.newValue,
    });
  }

  private async executeApprove(action: Action): Promise<Observation> {
    const payload = action.payload as { pageNumber: number; confidence: number };

    // Update page status
    if (this.session?.pageStates[payload.pageNumber]) {
      this.session.pageStates[payload.pageNumber].status = 'approved';
    }

    // Notify renderer
    this.webContents?.send('verification:page-status', {
      pageNumber: payload.pageNumber,
      status: 'approved',
    });

    return this.createObservation(action, 'status_result', true, {
      pageNumber: payload.pageNumber,
      status: 'approved',
    });
  }

  private async executeReject(action: Action): Promise<Observation> {
    const payload = action.payload as { pageNumber: number; reason: string };

    // Update page status
    if (this.session?.pageStates[payload.pageNumber]) {
      this.session.pageStates[payload.pageNumber].status = 'rejected';
    }

    // Notify renderer
    this.webContents?.send('verification:page-status', {
      pageNumber: payload.pageNumber,
      status: 'rejected',
    });

    return this.createObservation(action, 'status_result', true, {
      pageNumber: payload.pageNumber,
      status: 'rejected',
    });
  }

  private async executeAnnotation(action: Action): Promise<Observation> {
    const payload = action.payload as {
      pageNumber: number;
      boundingBox: any;
      content: string;
    };

    // Notify renderer
    this.webContents?.send('verification:add-annotation', payload);

    return this.createObservation(action, 'edit_result', true, {
      extractionId: 'annotation',
      field: 'annotation',
      oldValue: null,
      newValue: payload.content,
    });
  }

  private async executeThink(action: Action): Promise<Observation> {
    const payload = action.payload as { thought: string };

    // Just log the thought - no state change
    console.error('[Agent Thinking]', payload.thought);

    // Notify renderer for UI display
    this.webContents?.send('verification:agent-thinking', payload.thought);

    return this.createObservation(action, 'page_content', true, {
      pageNumber: this.session?.currentPageIndex || 1,
      extractionCount: 0,
    });
  }

  // ==========================================
  // Helpers
  // ==========================================

  /**
   * Create an observation from an action result
   */
  private createObservation(
    action: Action,
    type: ObservationType,
    success: boolean,
    payload: any,
    error?: string
  ): Observation {
    const observation: Observation = {
      id: uuidv4(),
      timestamp: new Date(),
      sessionId: this.session?.id || '',
      kind: 'observation',
      type,
      payload,
      actionId: action.id,
      success,
      error,
    };

    // Add to event stream
    this.eventStream?.push(observation);

    // Notify renderer
    this.webContents?.send('verification:event', observation);

    return observation;
  }
}

// ============================================
// Runtime Manager
// ============================================

/**
 * Manages verification runtimes
 */
class RuntimeManager {
  private runtimes: Map<string, VerificationRuntime> = new Map();

  /**
   * Create a new runtime for a session
   */
  createRuntime(
    sessionId: string,
    config: RuntimeConfig
  ): VerificationRuntime {
    const runtime = new VerificationRuntime(config);
    this.runtimes.set(sessionId, runtime);
    return runtime;
  }

  /**
   * Get runtime for a session
   */
  getRuntime(sessionId: string): VerificationRuntime | undefined {
    return this.runtimes.get(sessionId);
  }

  /**
   * Remove a runtime
   */
  removeRuntime(sessionId: string): void {
    const runtime = this.runtimes.get(sessionId);
    if (runtime) {
      runtime.stop();
      this.runtimes.delete(sessionId);
    }
  }

  /**
   * Clear all runtimes
   */
  clearAll(): void {
    for (const runtime of this.runtimes.values()) {
      runtime.stop();
    }
    this.runtimes.clear();
  }
}

export const runtimeManager = new RuntimeManager();
