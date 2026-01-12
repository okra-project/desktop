/**
 * State Handlers - Local verification state management
 */

import { ipcMain } from 'electron';
import {
  initializeState,
  loadState,
  getPageState,
  updatePageState,
  resolvePageStatus,
  getTableState,
  updateTableStatus,
  updateTableMarkdown,
  getVerificationSummary,
  syncTablesFromManifest,
} from '../local-state';

export function registerStateHandlers(): void {
  ipcMain.handle(
    'state:initialize',
    async (
      _event,
      workspacePath: string,
      documentName: string,
      totalPages: number,
    ) => {
      return initializeState(workspacePath, documentName, totalPages);
    },
  );

  ipcMain.handle('state:load', async (_event, workspacePath: string) => {
    return loadState(workspacePath);
  });

  ipcMain.handle(
    'state:get-page',
    async (_event, workspacePath: string, pageNum: number) => {
      return getPageState(workspacePath, pageNum);
    },
  );

  ipcMain.handle(
    'state:update-page',
    async (
      _event,
      workspacePath: string,
      pageNum: number,
      updates: Record<string, unknown>,
    ) => {
      return updatePageState(workspacePath, pageNum, updates);
    },
  );

  ipcMain.handle(
    'state:resolve-page',
    async (
      _event,
      workspacePath: string,
      pageNum: number,
      status: 'pending' | 'verified' | 'flagged' | 'rejected',
      resolution?: string,
      classification?: string,
    ) => {
      resolvePageStatus(
        workspacePath,
        pageNum,
        status,
        resolution,
        classification,
      );
      return { success: true };
    },
  );

  ipcMain.handle(
    'state:get-table',
    async (_event, workspacePath: string, tableId: string) => {
      return getTableState(workspacePath, tableId);
    },
  );

  ipcMain.handle(
    'state:update-table-status',
    async (
      _event,
      workspacePath: string,
      tableId: string,
      status: 'pending' | 'verified' | 'flagged' | 'rejected',
    ) => {
      updateTableStatus(workspacePath, tableId, status);
      return { success: true };
    },
  );

  ipcMain.handle(
    'state:update-table-markdown',
    async (_event, workspacePath: string, tableId: string, markdown: string) => {
      updateTableMarkdown(workspacePath, tableId, markdown, 'user_edit');
      return { success: true };
    },
  );

  ipcMain.handle('state:get-summary', async (_event, workspacePath: string) => {
    return getVerificationSummary(workspacePath);
  });

  ipcMain.handle('state:sync-tables', async (_event, workspacePath: string) => {
    syncTablesFromManifest(workspacePath);
    return { success: true };
  });
}
