/**
 * OCR Provider IPC Handlers
 *
 * Exposes OCR provider functionality to the renderer process.
 */

import { ipcMain, BrowserWindow } from 'electron';
import Store from 'electron-store';
import fs from 'fs';
import path from 'path';
import type {
  OcrProviderId,
  OcrProviderConfig,
  OcrProviderMetadata,
  OcrPageResult,
  OcrProgress,
  OcrExtractionRequest,
  OcrComparisonRequest,
  OcrComparisonResult,
  LayerDefinition,
} from './ocr-types';
import {
  loadPlugins,
  getPlugin,
  getAvailablePlugins,
  installPlugin,
  uninstallPlugin,
} from '../plugins/plugin-loader';
import {
  getRegistry,
  setPluginEnabled,
  getPluginStatuses,
} from '../plugins/registry';
import { storeService } from '../services/store.service';
import { pdfWorkerService } from '../services/pdf-worker.service';

/**
 * Resolve config by injecting global okrapdf API key if useGlobalKey is true
 */
function resolveConfig(config: OcrProviderConfig): OcrProviderConfig {
  if (config.options?.useGlobalKey && !config.apiKey) {
    const globalKey = storeService.getOkrapdfApiKey();
    if (globalKey) {
      return { ...config, apiKey: globalKey };
    }
  }
  return config;
}

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

export async function renderPageFromFile(
  pdfPath: string,
  pageNum: number,
  scale = 2.0,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  try {
    const { base64, width, height } = await pdfWorkerService.renderPage(
      pdfPath,
      pageNum,
      scale,
    );
    return {
      buffer: Buffer.from(base64, 'base64'),
      width,
      height,
    };
  } catch (error) {
    console.error('[ocr-handlers] Error in renderPageFromFile:', error);
    throw error;
  }
}

async function getPageDimensions(
  pdfPath: string,
  pageNum: number,
): Promise<{ width: number; height: number }> {
  const { width, height } = await pdfWorkerService.renderPage(
    pdfPath,
    pageNum,
    1.0,
  );
  return { width, height };
}

function scaleNormalizedBboxes(
  pageResult: OcrPageResult,
  width: number,
  height: number,
): void {
  if (!pageResult.imageSize) {
    pageResult.imageSize = { width, height };

    if (pageResult.bboxes && pageResult.bboxes.length > 0) {
      const allCoords = pageResult.bboxes.flatMap((b) =>
        b.vertices.flatMap((v) => [v.x, v.y]),
      );
      const maxCoord = Math.max(...allCoords);

      if (maxCoord <= 1.5) {
        console.log(
          `[ocr-handler] Scaling normalized bboxes for page ${pageResult.pageNumber}`,
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
}

function savePageResult(
  pageResult: OcrPageResult,
  outputDir: string,
  providerId: string,
): void {
  const namespacedResult = {
    ...pageResult,
    bboxes: pageResult.bboxes.map((bbox) => ({
      ...bbox,
      type: `${providerId}:${bbox.type}`,
    })),
  };

  const outputPath = path.join(
    outputDir,
    `page-${String(pageResult.pageNumber).padStart(3, '0')}.json`,
  );
  fs.writeFileSync(outputPath, JSON.stringify(namespacedResult, null, 2));

  if (pageResult.markdown) {
    const mdPath = path.join(
      outputDir,
      `page-${String(pageResult.pageNumber).padStart(3, '0')}.md`,
    );
    fs.writeFileSync(mdPath, pageResult.markdown);
  }
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

  ipcMain.handle('ocr:get-available-layers', async () => {
    const plugins = getAvailablePlugins();
    const layerMap = new Map<string, LayerDefinition>();
    for (const plugin of plugins) {
      const layers = plugin.metadata.layers;
      if (layers === 'dynamic' || !layers) continue;
      for (const layer of layers) {
        const namespacedId = `${plugin.id}:${layer.id}`;
        layerMap.set(namespacedId, { ...layer, id: namespacedId });
      }
    }
    return Array.from(layerMap.values());
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

  ipcMain.handle(
    'plugin:set-enabled',
    async (_event, pluginId: string, enabled: boolean) => {
      return setPluginEnabled(pluginId, enabled);
    },
  );

  ipcMain.handle('plugin:get-statuses', async () => {
    return getPluginStatuses();
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
        const resolvedConfig = resolveConfig(config);
        return plugin.checkHealth(resolvedConfig);
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
      const resolvedConfig = resolveConfig(config);
      return extractWithProvider(
        providerId,
        imageBuffer,
        pageNumber,
        resolvedConfig,
      );
    },
  );

  // Extract from PDF in workspace
  ipcMain.handle(
    'ocr:extract-document',
    async (_event, request: OcrExtractionRequest) => {
      const { providerId, workspacePath, config: rawConfig, options } = request;
      const config = resolveConfig(rawConfig);

      const files = fs.readdirSync(workspacePath);
      const pdfFile = files.find((f) => f.toLowerCase().endsWith('.pdf'));
      if (!pdfFile) {
        return { success: false, error: 'No PDF found in workspace' };
      }

      const pdfPath = path.join(workspacePath, pdfFile);
      const outputDir = path.join(workspacePath, 'plugins', providerId);
      fs.mkdirSync(outputDir, { recursive: true });

      try {
        const totalPages = await pdfWorkerService.getPageCount(pdfPath);
        const startPage = options?.startPage ?? 1;
        const endPage = Math.min(options?.endPage ?? totalPages, totalPages);
        const plugin = getPlugin(providerId);

        let results: OcrPageResult[] = [];

        if (plugin?.extractDocument) {
          mainWindow?.webContents.send('ocr:progress', {
            providerId,
            phase: 'processing',
            currentPage: 1,
            totalPages: endPage - startPage + 1,
            message: `Processing ${endPage - startPage + 1} pages with ${providerId}...`,
          } as OcrProgress);

          const pdfBuffer = await fs.promises.readFile(pdfPath);
          const allPageResults = await plugin.extractDocument(
            pdfBuffer,
            config,
          );

          results = allPageResults.filter(
            (r) => r.pageNumber >= startPage && r.pageNumber <= endPage,
          );

          await Promise.all(
            results.map(async (pageResult) => {
              const { width, height } = await getPageDimensions(
                pdfPath,
                pageResult.pageNumber,
              );
              scaleNormalizedBboxes(pageResult, width, height);
              savePageResult(pageResult, outputDir, providerId);
            }),
          );
        } else {
          for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
            const progress: OcrProgress = {
              providerId,
              phase: 'processing',
              currentPage: pageNum,
              totalPages: endPage - startPage + 1,
              message: `Processing page ${pageNum}/${endPage}`,
            };
            mainWindow?.webContents.send('ocr:progress', progress);

            const {
              buffer: imageBuffer,
              width,
              height,
            } = await renderPageFromFile(pdfPath, pageNum);

            const pageResult = await extractWithProvider(
              providerId,
              imageBuffer,
              pageNum,
              config,
            );

            scaleNormalizedBboxes(pageResult, width, height);
            savePageResult(pageResult, outputDir, providerId);
            results.push(pageResult);
          }
        }

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
      const outputDir = path.join(workspacePath, 'plugins', providerId);
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
        'plugins',
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
        'plugins',
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
  ipcMain.removeHandler('plugin:set-enabled');
  ipcMain.removeHandler('plugin:get-statuses');
  mainWindow = null;
}
