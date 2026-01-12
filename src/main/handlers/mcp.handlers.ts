/**
 * MCP Handlers - MCP server control
 */

import { ipcMain } from 'electron';
import { storeService } from '../services/store.service';
import { mcpService } from '../services/mcp.service';

export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:get-settings', async () => {
    return storeService.getMcpServerSettings();
  });

  ipcMain.handle(
    'mcp:set-settings',
    async (_event, settings: { enabled: boolean; port: number }) => {
      storeService.setMcpServerSettings(settings);
      if (settings.enabled) {
        await mcpService.start();
      } else {
        await mcpService.stop();
      }
      return { success: true };
    },
  );

  ipcMain.handle('mcp:get-status', async () => {
    const settings = storeService.getMcpServerSettings();
    return {
      enabled: settings.enabled,
      port: settings.port,
      running: mcpService.isRunning(),
    };
  });

  ipcMain.handle('mcp:start', async () => {
    try {
      await mcpService.start();
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('mcp:stop', async () => {
    await mcpService.stop();
    return { success: true };
  });
}
