/**
 * Extraction Handlers - Text and table extraction from PDFs
 */

import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { storeService } from '../services/store.service';
import { progressQueue } from '../utils/progress-queue';
import { findPdfInWorkspace } from '../utils/pdf.utils';
import {
  extractTextFromPDF,
  getPDFPageCount,
  type ExtractionProgress,
} from '../pdf-extraction';
import { extractTablesFromPDF, getExtractedTables } from '../table-extraction';
import type { TableExtractionProgress } from '../table-extraction';

let extractionAbortController: AbortController | null = null;

export function registerExtractionHandlers(): void {
  ipcMain.handle(
    'extraction:start-text',
    async (_event, workspaceId: string) => {
      const workspace = storeService.getWorkspaceById(workspaceId);

      if (!workspace) {
        return { success: false, error: 'Workspace not found' };
      }

      const pdfPath = findPdfInWorkspace(workspace.workspacePath);
      if (!pdfPath) {
        return { success: false, error: 'PDF not found in workspace' };
      }
      const ocrDir = path.join(
        workspace.workspacePath,
        'plugins',
        'text-extractor',
      );

      const updateWorkspaceStatus = (status: string, progress?: number) => {
        storeService.updateWorkspace(workspaceId, {
          extractionStatus: status,
          ...(progress !== undefined && { extractionProgress: progress }),
        });
      };

      updateWorkspaceStatus('extracting', 0);

      extractionAbortController = new AbortController();

      const onProgress = (progress: ExtractionProgress) => {
        const pct = Math.round(
          (progress.currentPage / progress.totalPages) * 100,
        );
        updateWorkspaceStatus('extracting', pct);
        progressQueue.send('extraction:progress', {
          workspaceId,
          ...progress,
          status: 'processing',
        });
      };

      try {
        const result = await extractTextFromPDF(pdfPath, ocrDir, onProgress);

        if (result.success) {
          updateWorkspaceStatus('completed', 100);
          const metadataPath = path.join(
            workspace.workspacePath,
            'metadata.json',
          );
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          metadata.textExtractionComplete = true;
          metadata.pageCount = result.totalPages;
          fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        } else {
          updateWorkspaceStatus('failed');
        }

        progressQueue.send('extraction:progress', {
          workspaceId,
          phase: 'text',
          currentPage: result.totalPages,
          totalPages: result.totalPages,
          status: result.success ? 'completed' : 'failed',
          error: result.error,
        });

        return result;
      } catch (error) {
        updateWorkspaceStatus('failed');
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    },
  );

  ipcMain.handle('extraction:cancel', async () => {
    extractionAbortController?.abort();
    extractionAbortController = null;
    return { success: true };
  });

  ipcMain.handle(
    'extraction:get-page-content',
    async (_event, workspacePath: string, pageNum: number, providerId?: string) => {
      const pageFileName = `page-${String(pageNum).padStart(3, '0')}.md`;

      // Priority order for finding page content:
      // 1. If providerId specified, check that plugin's output folder
      // 2. Check qwen-markdown plugin output (preferred markdown extraction)
      // 3. Check legacy ocr folder (text-extractor fallback)
      const searchPaths = providerId
        ? [path.join(workspacePath, 'plugins', providerId, pageFileName)]
        : [
            path.join(workspacePath, 'plugins', 'qwen-markdown', pageFileName),
            path.join(workspacePath, 'plugins', 'openrouter', pageFileName),
            path.join(workspacePath, 'ocr', pageFileName),
          ];

      for (const filePath of searchPaths) {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const source = path.basename(path.dirname(filePath));
          return { page: pageNum, content, source };
        }
      }

      return null;
    },
  );

  ipcMain.handle(
    'extraction:save-page-content',
    async (_event, workspacePath: string, pageNum: number, content: string) => {
      const filePath = path.join(
        workspacePath,
        'ocr',
        `page-${String(pageNum).padStart(3, '0')}.md`,
      );
      fs.writeFileSync(filePath, content);
      return { success: true, page: pageNum };
    },
  );

  ipcMain.handle(
    'extraction:get-page-count',
    async (_event, workspacePath: string) => {
      const pdfPath = findPdfInWorkspace(workspacePath);
      if (!pdfPath) {
        return 0;
      }
      return getPDFPageCount(pdfPath);
    },
  );

  ipcMain.handle(
    'extraction:start-tables',
    async (_event, workspaceId: string) => {
      const workspace = storeService.getWorkspaceById(workspaceId);

      if (!workspace) {
        return { success: false, error: 'Workspace not found' };
      }

      const apiKey = storeService.getOpenRouterApiKey();
      if (!apiKey) {
        return {
          success: false,
          error:
            'OpenRouter API key not configured. Add it in Settings > Vision-Language Models.',
        };
      }

      const pdfPath = findPdfInWorkspace(workspace.workspacePath);
      if (!pdfPath) {
        return { success: false, error: 'PDF not found in workspace' };
      }
      const tablesDir = path.join(workspace.workspacePath, 'tables');

      const onProgress = (progress: TableExtractionProgress) => {
        progressQueue.send('extraction:table-progress', {
          workspaceId,
          ...progress,
          status: 'processing',
        });
      };

      try {
        const result = await extractTablesFromPDF(
          pdfPath,
          tablesDir,
          apiKey,
          onProgress,
        );

        if (result.success) {
          const metadataPath = path.join(
            workspace.workspacePath,
            'metadata.json',
          );
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          metadata.tableExtractionComplete = true;
          metadata.tablesCount = result.tables.length;
          fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        }

        progressQueue.send('extraction:table-progress', {
          workspaceId,
          phase: 'analyzing',
          currentPage: result.totalPages,
          totalPages: result.totalPages,
          tablesFound: result.tables.length,
          status: result.success ? 'completed' : 'failed',
          error: result.error,
        });

        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return { success: false, tables: [], totalPages: 0, error: message };
      }
    },
  );

  ipcMain.handle(
    'extraction:get-tables',
    async (_event, workspacePath: string) => {
      const tablesDir = path.join(workspacePath, 'tables');
      return getExtractedTables(tablesDir);
    },
  );

  ipcMain.handle(
    'extraction:get-table',
    async (_event, workspacePath: string, tableId: string) => {
      const tablePath = path.join(workspacePath, 'tables', `${tableId}.md`);
      if (!fs.existsSync(tablePath)) {
        return null;
      }
      return { id: tableId, markdown: fs.readFileSync(tablePath, 'utf-8') };
    },
  );

  ipcMain.handle(
    'extraction:save-table',
    async (
      _event,
      workspacePath: string,
      tableId: string,
      markdown: string,
    ) => {
      const tablePath = path.join(workspacePath, 'tables', `${tableId}.md`);
      fs.writeFileSync(tablePath, markdown);

      const manifestPath = path.join(workspacePath, 'tables', 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const tableIdx = manifest.tables.findIndex(
          (t: { id: string }) => t.id === tableId,
        );
        if (tableIdx >= 0) {
          manifest.tables[tableIdx].markdown = markdown;
          manifest.tables[tableIdx].was_corrected = true;
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        }
      }

      return { success: true };
    },
  );
}
