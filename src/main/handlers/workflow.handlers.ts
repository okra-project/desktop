/**
 * Workflow Handlers - Workflow runtime execution
 */

import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { progressQueue } from '../utils/progress-queue';
import { findPdfInWorkspace } from '../utils/pdf.utils';
import { extractTextFromPDF, type ExtractionProgress } from '../pdf-extraction';
import {
  renderPageFromFile,
  extractWithProvider,
  type OcrProviderConfig,
  type OcrProgress,
} from '../providers';

const workflowAbortControllers = new Map<string, AbortController>();

// Track active runs - fully serializable state (no promises/functions)
interface ActiveRunState {
  runId: string;
  nodeId: string;
  nodeType: string;
  workspacePath: string;
  totalPages: number;
  currentPage: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  error?: string;
}

const activeRuns = new Map<string, ActiveRunState>();

// Get active run for a workspace (safe - returns null on any error)
export function getActiveRunForWorkspace(
  workspacePath: string,
): ActiveRunState | null {
  try {
    for (const run of activeRuns.values()) {
      if (run.workspacePath === workspacePath && run.status === 'running') {
        return { ...run }; // Return copy
      }
    }
  } catch (err) {
    console.error('[workflow] Error getting active run:', err);
  }
  return null;
}

export function registerWorkflowHandlers(): void {
  // Query active run for a workspace
  ipcMain.handle('workflow:get-active-run', (_event, workspacePath: string) => {
    try {
      return getActiveRunForWorkspace(workspacePath);
    } catch (err) {
      console.error('[workflow:get-active-run] Error:', err);
      return null;
    }
  });

  // Query ALL active runs (for global status indicator)
  ipcMain.handle('workflow:get-all-active-runs', () => {
    try {
      const runs: ActiveRunState[] = [];
      for (const run of activeRuns.values()) {
        if (run.status === 'running') {
          runs.push({ ...run }); // Return copies
        }
      }
      return runs;
    } catch (err) {
      console.error('[workflow:get-all-active-runs] Error:', err);
      return [];
    }
  });
  ipcMain.handle(
    'workflow:execute-node',
    async (
      _event,
      data: {
        runId: string;
        nodeId: string;
        nodeType: string;
        workspacePath: string;
        totalPages: number;
        config: Record<string, unknown>;
      },
    ) => {
      const { runId, nodeId, nodeType, workspacePath, totalPages, config } =
        data;

      const abortController = new AbortController();
      workflowAbortControllers.set(`${runId}:${nodeId}`, abortController);

      const pdfPath = findPdfInWorkspace(workspacePath);
      if (!pdfPath) {
        return { success: false, error: 'PDF not found in workspace' };
      }

      try {
        if (nodeType === 'textExtractor' || nodeType === 'googleDocAi') {
          const pluginDir = path.join(
            workspacePath,
            'plugins',
            'text-extractor',
          );
          if (!fs.existsSync(pluginDir)) {
            fs.mkdirSync(pluginDir, { recursive: true });
          }

          const onProgress = (progress: ExtractionProgress) => {
            progressQueue.send('workflow:node-progress', {
              runId,
              nodeId,
              type: 'page_complete',
              page: progress.currentPage,
              totalPages: progress.totalPages,
            });
          };

          const result = await extractTextFromPDF(
            pdfPath,
            pluginDir,
            onProgress,
          );

          if (result.success) {
            const metadataPath = path.join(workspacePath, 'metadata.json');
            if (fs.existsSync(metadataPath)) {
              const metadata = JSON.parse(
                fs.readFileSync(metadataPath, 'utf-8'),
              );
              metadata.textExtractionComplete = true;
              metadata.pageCount = result.totalPages;
              fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            }
          }

          return { success: result.success, error: result.error };
        }

        if (nodeType === 'entityExtractor' || nodeType === 'openrouter') {
          const providerId = 'openrouter';
          const outputDir = path.join(workspacePath, 'plugins', providerId);
          fs.mkdirSync(outputDir, { recursive: true });

          const providerConfig = config as OcrProviderConfig;
          if (!providerConfig.apiKey) {
            return {
              success: false,
              error: 'OpenRouter API key not configured',
            };
          }

          const manifestPath = path.join(outputDir, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            if (manifest.completed && manifest.pageCount === totalPages) {
              console.log('[entityExtractor] Already completed, skipping');
              progressQueue.send('ocr:progress', {
                providerId,
                phase: 'completed',
                currentPage: totalPages,
                totalPages,
              } as OcrProgress);
              return { success: true };
            }
          }

          const failedPages: number[] = [];
          const MAX_RETRIES = 2;
          const TIMEOUT_MS = 90000;

          // Track this run
          const runKey = `${workspacePath}:${nodeId}`;
          activeRuns.set(runKey, {
            runId,
            nodeId,
            nodeType,
            workspacePath,
            totalPages,
            currentPage: 0,
            status: 'running',
            startedAt: new Date().toISOString(),
          });

          for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            if (abortController.signal.aborted) {
              // Update tracking on cancel
              const cancelledRun = activeRuns.get(runKey);
              if (cancelledRun) {
                cancelledRun.status = 'cancelled';
                setTimeout(() => activeRuns.delete(runKey), 5000);
              }
              return { success: false, error: 'Extraction cancelled' };
            }

            const outputPath = path.join(
              outputDir,
              `page-${String(pageNum).padStart(3, '0')}.json`,
            );

            if (fs.existsSync(outputPath)) {
              const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
              if (existing.bboxes && !existing.error) {
                console.log(
                  `[entityExtractor] Page ${pageNum} already done, skipping`,
                );
                continue;
              }
            }

            progressQueue.send('workflow:node-progress', {
              runId,
              nodeId,
              type: 'page_complete',
              page: pageNum,
              totalPages,
            });

            // Update tracking
            const activeRun = activeRuns.get(runKey);
            if (activeRun) {
              activeRun.currentPage = pageNum;
            }

            progressQueue.send('ocr:progress', {
              providerId,
              phase: 'processing',
              currentPage: pageNum,
              totalPages,
              message: `Extracting page ${pageNum}/${totalPages}`,
            } as OcrProgress);

            let pageResult = null;
            let lastError = null;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
              try {
                const {
                  buffer: imageBuffer,
                  width,
                  height,
                } = await renderPageFromFile(pdfPath, pageNum);

                const extractPromise = extractWithProvider(
                  providerId,
                  imageBuffer,
                  pageNum,
                  providerConfig,
                );

                const timeoutPromise = new Promise<never>((_, reject) =>
                  setTimeout(
                    () => reject(new Error('Timeout after 90s')),
                    TIMEOUT_MS,
                  ),
                );

                pageResult = await Promise.race([
                  extractPromise,
                  timeoutPromise,
                ]);
                if (pageResult && !pageResult.imageSize) {
                  pageResult.imageSize = { width, height };
                }
                break;
              } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                console.error(
                  `[entityExtractor] Page ${pageNum} attempt ${attempt + 1} failed:`,
                  lastError,
                );
                if (attempt < MAX_RETRIES) {
                  await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
                }
              }
            }

            if (pageResult) {
              fs.writeFileSync(outputPath, JSON.stringify(pageResult, null, 2));
              if (pageResult.markdown) {
                const mdPath = path.join(
                  outputDir,
                  `page-${String(pageNum).padStart(3, '0')}.md`,
                );
                fs.writeFileSync(mdPath, pageResult.markdown);
              }
            } else {
              failedPages.push(pageNum);
              fs.writeFileSync(
                outputPath,
                JSON.stringify(
                  {
                    pageNumber: pageNum,
                    bboxes: [],
                    error: lastError,
                  },
                  null,
                  2,
                ),
              );
            }
          }

          const manifest = {
            providerId,
            completed: failedPages.length === 0,
            pageCount: totalPages,
            failedPages,
            extractedAt: new Date().toISOString(),
          };
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

          // Update tracking - mark complete or failed
          const finalRun = activeRuns.get(runKey);
          if (finalRun) {
            finalRun.status = failedPages.length === 0 ? 'completed' : 'failed';
            finalRun.currentPage = totalPages;
            if (failedPages.length > 0) {
              finalRun.error = `Failed pages: ${failedPages.join(', ')}`;
            }
            // Clean up after a delay (keep for reconnection window)
            setTimeout(() => activeRuns.delete(runKey), 30000);
          }

          progressQueue.send('ocr:progress', {
            providerId,
            phase: failedPages.length === 0 ? 'completed' : 'failed',
            currentPage: totalPages,
            totalPages,
            error:
              failedPages.length > 0
                ? `Failed pages: ${failedPages.join(', ')}`
                : undefined,
          } as OcrProgress);

          return {
            success: failedPages.length === 0,
            error:
              failedPages.length > 0
                ? `Failed: ${failedPages.length} pages`
                : undefined,
          };
        }

        return { success: false, error: `Unknown node type: ${nodeType}` };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      } finally {
        workflowAbortControllers.delete(`${runId}:${nodeId}`);
      }
    },
  );

  ipcMain.handle(
    'workflow:cancel-node',
    async (_event, data: { runId: string; nodeId: string }) => {
      const key = `${data.runId}:${data.nodeId}`;
      const controller = workflowAbortControllers.get(key);
      if (controller) {
        controller.abort();
        workflowAbortControllers.delete(key);
      }
      return { success: true };
    },
  );

  ipcMain.handle(
    'workflow:get-page-result',
    async (
      _event,
      data: { workspacePath: string; nodeType: string; page: number },
    ) => {
      const { workspacePath, nodeType, page } = data;

      if (nodeType === 'textExtractor' || nodeType === 'googleDocAi') {
        const filePath = path.join(
          workspacePath,
          'ocr',
          `page-${String(page).padStart(3, '0')}.md`,
        );
        if (fs.existsSync(filePath)) {
          return { page, content: fs.readFileSync(filePath, 'utf-8') };
        }
        return null;
      }

      return null;
    },
  );

  ipcMain.handle(
    'workflow:retry-page',
    async (
      _event,
      _data: {
        runId: string;
        nodeId: string;
        nodeType: string;
        workspacePath: string;
        page: number;
        config: Record<string, unknown>;
      },
    ) => {
      return { success: false, error: 'Page retry not yet implemented' };
    },
  );
}
