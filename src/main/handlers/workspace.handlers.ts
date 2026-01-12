/**
 * Workspace Handlers - Workspace CRUD operations
 */

import { ipcMain, dialog, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { getHandlerContext } from './index';
import { storeService } from '../services/store.service';
import { mcpService } from '../services/mcp.service';
import { findPdfInWorkspace } from '../utils/pdf.utils';
import { generatePDFThumbnail } from '../pdf-extraction';

export function registerWorkspaceHandlers(): void {
  const ctx = () => getHandlerContext();

  ipcMain.handle('workspace:list-local', async () => {
    return storeService.getLocalWorkspaces();
  });

  ipcMain.handle('search:global', async (_event, query: string) => {
    const provider = mcpService.createWorkspaceProvider();
    return provider.globalSearch(query);
  });

  ipcMain.handle('workspace:open-pdf-dialog', async () => {
    const context = ctx();
    const result = await dialog.showOpenDialog(context.mainWindow!, {
      properties: ['openFile'],
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false };
    }

    const pdfPath = result.filePaths[0];
    const fileName = path.basename(pdfPath, '.pdf');
    const workspaceId = `local-${nanoid(12)}`;
    const workspacePath = path.join(context.workspacesDir, workspaceId);

    fs.mkdirSync(workspacePath, { recursive: true });
    fs.mkdirSync(path.join(workspacePath, 'plugins'));
    fs.mkdirSync(path.join(workspacePath, 'tables'));

    const pdfFileName = path.basename(pdfPath);
    fs.copyFileSync(pdfPath, path.join(workspacePath, pdfFileName));

    const metadata = {
      id: workspaceId,
      fileName,
      pdfFileName,
      originalPath: pdfPath,
      createdAt: new Date().toISOString(),
      mode: 'local',
      extractionStatus: 'pending',
    };
    fs.writeFileSync(
      path.join(workspacePath, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
    );

    const workspace = {
      id: workspaceId,
      name: fileName,
      pdfPath,
      pdfFileName,
      workspacePath,
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      extractionStatus: 'pending',
    };

    storeService.addWorkspace(workspace);
    context.setCurrentWorkspacePath(workspacePath);
    storeService.setLastWorkspacePath(workspacePath);

    return { success: true, workspace };
  });

  ipcMain.handle(
    'workspace:create-from-path',
    async (_event, pdfPath: string) => {
      const context = ctx();
      const fileName = path.basename(pdfPath, '.pdf');
      const pdfFileName = path.basename(pdfPath);
      const workspaceId = `local-${nanoid(12)}`;
      const workspacePath = path.join(context.workspacesDir, workspaceId);

      fs.mkdirSync(workspacePath, { recursive: true });
      fs.mkdirSync(path.join(workspacePath, 'plugins'));
      fs.mkdirSync(path.join(workspacePath, 'tables'));

      fs.copyFileSync(pdfPath, path.join(workspacePath, pdfFileName));

      const metadata = {
        id: workspaceId,
        fileName,
        pdfFileName,
        originalPath: pdfPath,
        createdAt: new Date().toISOString(),
        mode: 'local',
        extractionStatus: 'pending',
      };
      fs.writeFileSync(
        path.join(workspacePath, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
      );

      const workspace = {
        id: workspaceId,
        name: fileName,
        path: workspacePath,
        pdfPath,
        pdfFileName,
        workspacePath,
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
        extractionStatus: 'pending',
      };

      storeService.addWorkspace(workspace);
      context.setCurrentWorkspacePath(workspacePath);
      storeService.setLastWorkspacePath(workspacePath);

      return workspace;
    },
  );

  ipcMain.handle(
    'workspace:update-last-opened',
    async (_event, workspaceId: string) => {
      const workspace = storeService.getWorkspaceById(workspaceId);
      if (workspace) {
        storeService.updateWorkspace(workspaceId, {
          lastOpenedAt: new Date().toISOString(),
        });
        ctx().setCurrentWorkspacePath(workspace.workspacePath);
        storeService.setLastWorkspacePath(workspace.workspacePath);
      }
      return { success: true };
    },
  );

  ipcMain.handle(
    'workspace:delete-local',
    async (_event, workspaceId: string) => {
      const workspace = storeService.getWorkspaceById(workspaceId);

      if (workspace) {
        try {
          fs.rmSync(workspace.workspacePath, { recursive: true, force: true });
        } catch (err) {
          console.error('Failed to delete workspace dir:', err);
        }
        storeService.removeWorkspace(workspaceId);
      }
      return { success: true };
    },
  );

  ipcMain.handle('workspace:get-current', async () => {
    return { workspacePath: ctx().getCurrentWorkspacePath() };
  });

  ipcMain.handle(
    'workspace:list-files',
    async (_event, workspacePath: string) => {
      try {
        if (!fs.existsSync(workspacePath)) {
          return [];
        }
        const files = fs.readdirSync(workspacePath);
        return files.filter((f) => {
          const filePath = path.join(workspacePath, f);
          return fs.statSync(filePath).isFile();
        });
      } catch (error) {
        console.error('[workspace:list-files] Error:', error);
        return [];
      }
    },
  );

  ipcMain.handle(
    'workspace:get-thumbnail',
    async (_event, workspacePath: string) => {
      const thumbnailPath = path.join(workspacePath, 'thumbnail.png');

      if (fs.existsSync(thumbnailPath)) {
        return `file://${thumbnailPath}`;
      }

      const pdfPath = findPdfInWorkspace(workspacePath);
      if (!pdfPath) {
        return null;
      }

      const result = await generatePDFThumbnail(pdfPath, thumbnailPath, 800);
      if (result.success && result.path) {
        return `file://${result.path}`;
      }
      return null;
    },
  );

  ipcMain.handle(
    'workspace:open-in-finder',
    async (_event, workspacePath: string) => {
      if (fs.existsSync(workspacePath)) {
        const stat = fs.statSync(workspacePath);
        if (stat.isDirectory()) {
          // Open folder to show contents
          await shell.openPath(workspacePath);
        } else {
          // Reveal file in parent folder
          shell.showItemInFolder(workspacePath);
        }
        return { success: true };
      }
      return { success: false, error: 'Path does not exist' };
    },
  );
}
