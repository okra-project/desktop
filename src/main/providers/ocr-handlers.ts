/**
 * OCR Provider IPC Handlers
 *
 * Exposes OCR provider functionality to the renderer process.
 */

import { ipcMain, BrowserWindow } from 'electron';
import Store from 'electron-store';
import fs from 'fs';
import path from 'path';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type {
  OcrProviderId,
  OcrProviderConfig,
  OcrProviderMetadata,
  OcrPageResult,
  OcrProgress,
  OcrExtractionRequest,
  OcrComparisonRequest,
  OcrComparisonResult,
} from './ocr-types';
import {
  loadPlugins,
  getPlugin,
  getAvailablePlugins,
  installPlugin,
  uninstallPlugin,
} from '../plugins/plugin-loader';
import { getRegistry } from '../plugins/registry';

const PROVIDER_CONFIGS: Map<OcrProviderId, OcrProviderConfig> = new Map();

// ============================================================================
// Store for provider configs
// ============================================================================

const store = new Store({
  name: 'okrapdf-ocr-providers',
  defaults: {
    providerConfigs: {} as Record<OcrProviderId, OcrProviderConfig>,
  },
});

// ============================================================================
// PDF Rendering Utilities
// ============================================================================

export function ensureDomMatrix(): void {
  if (typeof (global as typeof globalThis).DOMMatrix === 'undefined') {
    const { DOMMatrix, DOMPoint, DOMRect } = require('@napi-rs/canvas');
    (global as typeof globalThis).DOMMatrix = DOMMatrix;
    (global as typeof globalThis).DOMPoint = DOMPoint;
    (global as typeof globalThis).DOMRect = DOMRect;
  }
}

export async function renderPageToBuffer(
  pdf: PDFDocumentProxy,
  pageNum: number,
  scale = 2.0,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');

  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  } as Parameters<typeof page.render>[0]).promise;

  return {
    buffer: canvas.toBuffer('image/png'),
    width: viewport.width,
    height: viewport.height,
  };
}

export async function renderPageFromFile(
  pdfPath: string,
  pageNum: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { pdfToPng } = await import('pdf-to-png-converter');
  const results = await pdfToPng(pdfPath, {
    pagesToProcess: [pageNum],
    viewportScale: 2.0,
    disableFontFace: true,
    verbosityLevel: 0,
  });
  if (!results.length || !results[0].content) {
    throw new Error(`Failed to render page ${pageNum}`);
  }
  return {
    buffer: Buffer.from(results[0].content),
    width: results[0].width,
    height: results[0].height,
  };
}

export async function extractWithProvider(
  providerId: OcrProviderId,
  imageBuffer: Buffer,
  pageNumber: number,
  config: OcrProviderConfig,
): Promise<OcrPageResult> {
  const plugin = getPlugin(providerId);
  if (plugin) {
    return plugin.extract(imageBuffer, pageNumber, config);
  }
  throw new Error(`Provider ${providerId} not installed or not loaded`);
}

// ============================================================================
// IPC Handler Setup
// ============================================================================

let mainWindow: BrowserWindow | null = null;

export async function setupOcrIpcHandlers(
  window: BrowserWindow,
): Promise<void> {
  mainWindow = window;

  await loadPlugins();

  ipcMain.handle('ocr:list-providers', async () => {
    const plugins = getAvailablePlugins();
    return { builtIn: [], plugins };
  });

  ipcMain.handle(
    'ocr:get-provider',
    async (_event, providerId: OcrProviderId) => {
      const available = getAvailablePlugins().find((p) => p.id === providerId);
      return available ?? null;
    },
  );

  ipcMain.handle('plugin:install', async (_event, pluginId: string) => {
    const result = await installPlugin(pluginId);
    if (result.success) {
      await loadPlugins();
    }
    return result;
  });

  ipcMain.handle('plugin:uninstall', async (_event, pluginId: string) => {
    return uninstallPlugin(pluginId);
  });

  // Save provider config
  ipcMain.handle(
    'ocr:save-config',
    async (
      _event,
      providerId: OcrProviderId,
      config: OcrProviderConfig,
    ): Promise<void> => {
      const configs = store.get('providerConfigs') as Record<
        OcrProviderId,
        OcrProviderConfig
      >;
      configs[providerId] = config;
      store.set('providerConfigs', configs);
      PROVIDER_CONFIGS.set(providerId, config);
    },
  );

  // Get provider config
  ipcMain.handle(
    'ocr:get-config',
    async (
      _event,
      providerId: OcrProviderId,
    ): Promise<OcrProviderConfig | null> => {
      const configs = store.get('providerConfigs') as Record<
        OcrProviderId,
        OcrProviderConfig
      >;
      return configs[providerId] ?? null;
    },
  );

  ipcMain.handle(
    'ocr:check-health',
    async (_event, providerId: OcrProviderId, config: OcrProviderConfig) => {
      const plugin = getPlugin(providerId);
      if (plugin) {
        return plugin.checkHealth(config);
      }
      return { ok: false, error: 'Provider not installed' };
    },
  );

  // Extract from a single page image
  ipcMain.handle(
    'ocr:extract-page',
    async (
      _event,
      providerId: OcrProviderId,
      imageBase64: string,
      pageNumber: number,
      config: OcrProviderConfig,
    ): Promise<OcrPageResult> => {
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      return extractWithProvider(providerId, imageBuffer, pageNumber, config);
    },
  );

  // Extract from PDF in workspace
  ipcMain.handle(
    'ocr:extract-document',
    async (_event, request: OcrExtractionRequest) => {
      const { providerId, workspacePath, config, options } = request;

      // Find PDF in workspace
      const files = fs.readdirSync(workspacePath);
      const pdfFile = files.find((f) => f.toLowerCase().endsWith('.pdf'));
      if (!pdfFile) {
        return { success: false, error: 'No PDF found in workspace' };
      }

      const pdfPath = path.join(workspacePath, pdfFile);
      const outputDir = path.join(workspacePath, 'ocr', providerId);
      fs.mkdirSync(outputDir, { recursive: true });

      try {
        ensureDomMatrix();
        const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const data = new Uint8Array(fs.readFileSync(pdfPath));
        const pdf: PDFDocumentProxy = await getDocument({
          data,
          disableFontFace: true,
          verbosity: 0,
        }).promise;

        const totalPages = pdf.numPages;
        const startPage = options?.startPage ?? 1;
        const endPage = Math.min(options?.endPage ?? totalPages, totalPages);

        const results: OcrPageResult[] = [];

        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
          // Emit progress
          const progress: OcrProgress = {
            providerId,
            phase: 'processing',
            currentPage: pageNum,
            totalPages: endPage - startPage + 1,
            message: `Processing page ${pageNum}/${endPage}`,
          };
          mainWindow?.webContents.send('ocr:progress', progress);

          // Render page to image
          const {
            buffer: imageBuffer,
            width,
            height,
          } = await renderPageToBuffer(pdf, pageNum);

          // Extract with provider
          const pageResult = await extractWithProvider(
            providerId,
            imageBuffer,
            pageNum,
            config,
          );

          // Post-process result to ensure consistent coordinate system (Absolute Pixels)
          if (!pageResult.imageSize) {
            // Provider didn't return dimensions (e.g. DocAI, OpenRouter)
            // We interpret this as potential normalized coordinates
            pageResult.imageSize = { width, height };

            // Check if bboxes are normalized (0-1) and scale them if so
            if (pageResult.bboxes && pageResult.bboxes.length > 0) {
              const allCoords = pageResult.bboxes.flatMap((b) =>
                b.vertices.flatMap((v) => [v.x, v.y]),
              );
              const maxCoord = Math.max(...allCoords);

              // Heuristic: If max coordinate is small (<= 1.5), assume normalized
              // Use 1.5 to account for potential slight float overshoots or 1-based indexing in some weird cases
              if (maxCoord <= 1.5) {
                console.log(
                  `[ocr-handler] Scaling normalized bboxes for page ${pageNum}`,
                );
                pageResult.bboxes = pageResult.bboxes.map((bbox) => ({
                  ...bbox,
                  vertices: bbox.vertices.map((v) => ({
                    x: v.x * width,
                    y: v.y * height,
                  })),
                }));
              }
            }
          }
          results.push(pageResult);

          // Save result to disk
          const outputPath = path.join(
            outputDir,
            `page-${String(pageNum).padStart(3, '0')}.json`,
          );
          fs.writeFileSync(outputPath, JSON.stringify(pageResult, null, 2));

          // Also save markdown if present
          if (pageResult.markdown) {
            const mdPath = path.join(
              outputDir,
              `page-${String(pageNum).padStart(3, '0')}.md`,
            );
            fs.writeFileSync(mdPath, pageResult.markdown);
          }
        }

        // Save manifest
        const manifest = {
          providerId,
          extractedAt: new Date().toISOString(),
          pageCount: results.length,
          pages: results.map((r) => ({
            pageNumber: r.pageNumber,
            hasBboxes: r.bboxes.length > 0,
            tableCount: r.tables?.length ?? 0,
          })),
        };
        fs.writeFileSync(
          path.join(outputDir, 'manifest.json'),
          JSON.stringify(manifest, null, 2),
        );

        // Emit completion
        mainWindow?.webContents.send('ocr:progress', {
          providerId,
          phase: 'completed',
          currentPage: endPage,
          totalPages: endPage - startPage + 1,
        } as OcrProgress);

        return { success: true, results, manifest };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        mainWindow?.webContents.send('ocr:progress', {
          providerId,
          phase: 'failed',
          error: message,
        } as OcrProgress);
        return { success: false, error: message };
      }
    },
  );

  // Compare multiple providers
  ipcMain.handle(
    'ocr:compare',
    async (_event, request: OcrComparisonRequest) => {
      const { providerIds, workspacePath, configs, options } = request;

      const results: OcrComparisonResult[] = [];

      // Run providers in parallel
      const extractionPromises = providerIds.map(async (providerId) => {
        const config = configs[providerId];
        if (!config) {
          return {
            providerId,
            pages: [],
            totalDurationMs: 0,
            error: `No config for provider ${providerId}`,
          };
        }

        try {
          const startTime = Date.now();
          const result = await ipcMain.emit('ocr:extract-document', {
            providerId,
            workspacePath,
            config,
            options,
          });

          // This is simplified - in practice we'd need to properly await the extraction
          return {
            providerId,
            pages: [], // Would be populated from actual extraction
            totalDurationMs: Date.now() - startTime,
          };
        } catch (error) {
          return {
            providerId,
            pages: [],
            totalDurationMs: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      const completedResults = await Promise.all(extractionPromises);
      return { success: true, comparisons: completedResults };
    },
  );

  // Get extraction results for a provider
  ipcMain.handle(
    'ocr:get-results',
    async (
      _event,
      workspacePath: string,
      providerId: OcrProviderId,
    ): Promise<{ pages: OcrPageResult[]; manifest: unknown } | null> => {
      const outputDir = path.join(workspacePath, 'ocr', providerId);
      const manifestPath = path.join(outputDir, 'manifest.json');

      if (!fs.existsSync(manifestPath)) {
        return null;
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const pages: OcrPageResult[] = [];

      for (const pageInfo of manifest.pages) {
        const pagePath = path.join(
          outputDir,
          `page-${String(pageInfo.pageNumber).padStart(3, '0')}.json`,
        );
        if (fs.existsSync(pagePath)) {
          pages.push(JSON.parse(fs.readFileSync(pagePath, 'utf-8')));
        }
      }

      return { pages, manifest };
    },
  );

  // Get bboxes for overlay
  ipcMain.handle(
    'ocr:get-page-bboxes',
    async (
      _event,
      workspacePath: string,
      providerId: OcrProviderId,
      pageNumber: number,
    ): Promise<{
      bboxes: OcrPageResult['bboxes'];
      imageSize?: OcrPageResult['imageSize'];
    }> => {
      const pagePath = path.join(
        workspacePath,
        'ocr',
        providerId,
        `page-${String(pageNumber).padStart(3, '0')}.json`,
      );

      if (!fs.existsSync(pagePath)) {
        return { bboxes: [] };
      }

      const pageResult: OcrPageResult = JSON.parse(
        fs.readFileSync(pagePath, 'utf-8'),
      );
      return { bboxes: pageResult.bboxes, imageSize: pageResult.imageSize };
    },
  );

  ipcMain.handle(
    'ocr:check-extraction-status',
    async (
      _event,
      workspacePath: string,
      providerId: OcrProviderId,
    ): Promise<{
      completed: boolean;
      pageCount?: number;
      failedPages?: number[];
    }> => {
      const manifestPath = path.join(
        workspacePath,
        'ocr',
        providerId,
        'manifest.json',
      );
      if (!fs.existsSync(manifestPath)) {
        return { completed: false };
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      return {
        completed: manifest.completed === true,
        pageCount: manifest.pageCount,
        failedPages: manifest.failedPages,
      };
    },
  );
}

export function cleanupOcrIpcHandlers(): void {
  ipcMain.removeHandler('ocr:list-providers');
  ipcMain.removeHandler('ocr:get-provider');
  ipcMain.removeHandler('ocr:save-config');
  ipcMain.removeHandler('ocr:get-config');
  ipcMain.removeHandler('ocr:check-health');
  ipcMain.removeHandler('ocr:extract-page');
  ipcMain.removeHandler('ocr:extract-document');
  ipcMain.removeHandler('ocr:compare');
  ipcMain.removeHandler('ocr:get-results');
  ipcMain.removeHandler('ocr:get-page-bboxes');
  ipcMain.removeHandler('plugin:install');
  ipcMain.removeHandler('plugin:uninstall');
  mainWindow = null;
}
