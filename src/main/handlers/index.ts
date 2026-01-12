/**
 * Handler Registry - ComfyUI-inspired modular handler registration
 *
 * Pattern: Each handler module exports a register function.
 * This file orchestrates loading all handlers.
 */

import type { BrowserWindow } from 'electron';
import { registerWorkspaceHandlers } from './workspace.handlers';
import { registerExtractionHandlers } from './extraction.handlers';
import { registerWorkflowHandlers } from './workflow.handlers';
import { registerStateHandlers } from './state.handlers';
import { registerTelemetryHandlers } from './telemetry.handlers';
import { registerAgentHandlers } from './agent.handlers';
import { registerFileHandlers } from './file.handlers';
import { registerMcpHandlers } from './mcp.handlers';

export interface HandlerContext {
  mainWindow: BrowserWindow | null;
  workspacesDir: string;
  getCurrentWorkspacePath: () => string | null;
  setCurrentWorkspacePath: (path: string | null) => void;
}

let handlerContext: HandlerContext | null = null;

export function setHandlerContext(ctx: HandlerContext): void {
  handlerContext = ctx;
}

export function getHandlerContext(): HandlerContext {
  if (!handlerContext) {
    throw new Error('Handler context not initialized');
  }
  return handlerContext;
}

/**
 * Register all IPC handlers
 * Called once during app initialization
 */
export function registerAllHandlers(): void {
  console.error('[handlers] Registering all IPC handlers...');

  registerFileHandlers();
  registerWorkspaceHandlers();
  registerExtractionHandlers();
  registerWorkflowHandlers();
  registerStateHandlers();
  registerTelemetryHandlers();
  registerAgentHandlers();
  registerMcpHandlers();

  console.error('[handlers] All IPC handlers registered');
}

/**
 * Cleanup handlers (currently no-op, but available for future use)
 */
export function cleanupAllHandlers(): void {
  // Individual handlers can implement cleanup if needed
}
