/**
 * File Handlers - Download, open directory, etc.
 */

import { ipcMain, dialog, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { getHandlerContext } from './index';

export function registerFileHandlers(): void {
  // IPC example (ping/pong)
  ipcMain.on('ipc-example', async (event, arg) => {
    const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
    console.error(msgTemplate(arg));
    event.reply('ipc-example', msgTemplate('pong'));
  });

  // Handle file download requests
  ipcMain.handle('download-file', async (_event, filePath: string) => {
    try {
      const ctx = getHandlerContext();
      if (!fs.existsSync(filePath)) {
        throw new Error('File not found');
      }

      const result = await dialog.showSaveDialog(ctx.mainWindow!, {
        defaultPath: path.basename(filePath),
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
          { name: 'PDF Files', extensions: ['pdf'] },
          { name: 'Word Files', extensions: ['docx', 'doc'] },
        ],
      });

      if (!result.canceled && result.filePath) {
        await fs.promises.copyFile(filePath, result.filePath);
        return { success: true, savedPath: result.filePath };
      }

      return { success: false, error: 'Download cancelled' };
    } catch (error) {
      console.error('Download error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Handle requests to open output directory
  ipcMain.handle('open-output-directory', async () => {
    const outputDir = path.join(process.cwd(), 'agent');
    try {
      if (fs.existsSync(outputDir)) {
        shell.openPath(outputDir);
        return { success: true };
      }
      return { success: false, error: 'Output directory not found' };
    } catch (error) {
      console.error('Error opening directory:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Session recorder: Save session logs to disk
  ipcMain.handle(
    'recorder:save-session',
    async (_event, data: { name: string; events: unknown[] }) => {
      try {
        const sessionsDir = path.join(
          app.getPath('home'),
          '.okrapdf',
          'sessions',
        );

        if (!fs.existsSync(sessionsDir)) {
          fs.mkdirSync(sessionsDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `${data.name}_${timestamp}.json`;
        const filePath = path.join(sessionsDir, fileName);

        const sessionData = {
          name: data.name,
          savedAt: new Date().toISOString(),
          eventCount: data.events.length,
          events: data.events,
        };

        fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
        console.error(`[recorder] Session saved to ${filePath}`);

        return { success: true, path: filePath };
      } catch (error) {
        console.error('[recorder] Error saving session:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  );

  // Trajectory management (OpenHands-style replay)
  const TRAJECTORIES_DIR = path.join(
    app.getPath('home'),
    '.okrapdf',
    'trajectories',
  );

  if (!fs.existsSync(TRAJECTORIES_DIR)) {
    fs.mkdirSync(TRAJECTORIES_DIR, { recursive: true });
  }

  ipcMain.handle(
    'trajectory:save',
    async (
      _event,
      data: {
        sessionId: string;
        documentId?: string;
        documentName?: string;
        trajectory: object[];
        metrics?: object;
      },
    ) => {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `trajectory_${data.sessionId}_${timestamp}.json`;
        const filePath = path.join(TRAJECTORIES_DIR, fileName);

        const trajectoryData = {
          version: '1.0',
          sessionId: data.sessionId,
          documentId: data.documentId,
          documentName: data.documentName,
          savedAt: new Date().toISOString(),
          eventCount: data.trajectory.length,
          metrics: data.metrics,
          trajectory: data.trajectory,
        };

        fs.writeFileSync(filePath, JSON.stringify(trajectoryData, null, 2));
        console.error(`[trajectory] Saved to ${filePath}`);

        return { success: true, path: filePath, fileName };
      } catch (error) {
        console.error('[trajectory] Save error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  );

  ipcMain.handle('trajectory:load', async (_event, fileName: string) => {
    try {
      const filePath = path.join(TRAJECTORIES_DIR, fileName);

      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'Trajectory file not found' };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      console.error(`[trajectory] Loaded ${filePath}, ${data.eventCount} events`);

      return { success: true, data };
    } catch (error) {
      console.error('[trajectory] Load error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcMain.handle('trajectory:list', async () => {
    try {
      const files = fs.readdirSync(TRAJECTORIES_DIR);
      const trajectories = files
        .filter((f) => f.endsWith('.json'))
        .map((fileName) => {
          try {
            const filePath = path.join(TRAJECTORIES_DIR, fileName);
            const stat = fs.statSync(filePath);
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);

            return {
              fileName,
              sessionId: data.sessionId,
              documentName: data.documentName,
              eventCount: data.eventCount,
              savedAt: data.savedAt,
              size: stat.size,
            };
          } catch {
            return null;
          }
        })
        .filter((t): t is NonNullable<typeof t> => t !== null)
        .sort(
          (a, b) =>
            new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
        );

      return { success: true, trajectories };
    } catch (error) {
      console.error('[trajectory] List error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Shell: open external URL
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    shell.openExternal(url);
  });
}
