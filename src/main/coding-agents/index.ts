import { ipcMain } from 'electron';
import { detectInstalledAgents, getAllAgentsWithStatus } from './detector';

export function registerCodingAgentHandlers(): void {
  ipcMain.handle('coding-agents:detect', async () => {
    return detectInstalledAgents();
  });

  ipcMain.handle('coding-agents:list-all', async () => {
    return getAllAgentsWithStatus();
  });
}

export * from './types';
export * from './registry';
export * from './detector';
