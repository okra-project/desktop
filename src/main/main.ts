/* eslint global-require: off, no-console: off, promise/always-return: off */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';
import fixPath from 'fix-path';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import * as Sentry from '@sentry/electron/main';
import { nanoid } from 'nanoid';
import {
  SENTRY_DSN,
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
} from '../config/sentry';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import {
  setupVerificationIpcHandlers,
  cleanupVerificationIpcHandlers,
} from './verification/ipc-handlers';
import { setupOcrIpcHandlers, cleanupOcrIpcHandlers } from './providers';
import { registerCodingAgentHandlers } from './coding-agents';
import {
  extractTextFromPDF,
  getPDFPageCount,
  generatePDFThumbnail,
} from './pdf-extraction';
import type { ExtractionProgress } from './pdf-extraction';
import { extractTablesFromPDF, getExtractedTables } from './table-extraction';
import type { TableExtractionProgress } from './table-extraction';
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
} from './local-state';

fixPath();

if (typeof (global as typeof globalThis).DOMMatrix === 'undefined') {
  const { DOMMatrix, DOMPoint, DOMRect } = require('@napi-rs/canvas');
  (global as typeof globalThis).DOMMatrix = DOMMatrix;
  (global as typeof globalThis).DOMPoint = DOMPoint;
  (global as typeof globalThis).DOMRect = DOMRect;
}

if (SENTRY_ENABLED) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    tracesSampleRate: 0,
  });
  Sentry.setTag('process', 'main');
}

const store = new Store({
  name: 'okrapdf-settings',
  defaults: {
    lastWorkspacePath: null as string | null,
    telemetryConsent: null as boolean | null,
    telemetryUserId: null as string | null,
    byokSettings: {
      enabled: false,
      anthropicApiKey: null as string | null,
      openrouterApiKey: null as string | null,
      lastValidated: null as string | null,
    },
    localWorkspaces: [] as Array<{
      id: string;
      name: string;
      pdfPath: string;
      workspacePath: string;
      createdAt: string;
      lastOpenedAt: string;
      pageCount?: number;
      extractionStatus: string;
    }>,
  },
});

const providerStore = new Store({
  name: 'okrapdf-ocr-providers',
  defaults: {
    providerConfigs: {} as Record<string, { apiKey?: string }>,
  },
});

const WORKSPACES_DIR = path.join(app.getPath('home'), '.okrapdf', 'workspaces');
if (!fs.existsSync(WORKSPACES_DIR)) {
  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
}

let currentWorkspacePath: string | null = store.get('lastWorkspacePath') as
  | string
  | null;

/**
 * Get environment variables for Claude agent, including API key from provider config.
 * Uses the unified provider system (anthropic provider) instead of legacy BYOK settings.
 */
function getClaudeEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // First, try the new provider config system
  const providerConfigs = providerStore.get('providerConfigs') as Record<
    string,
    { apiKey?: string }
  > | null;
  const anthropicConfig = providerConfigs?.['anthropic'];

  if (anthropicConfig?.apiKey) {
    return {
      ...baseEnv,
      ANTHROPIC_API_KEY: anthropicConfig.apiKey,
    };
  }

  // Fallback to legacy BYOK settings for backwards compatibility
  const byokSettings = store.get('byokSettings') as {
    enabled: boolean;
    anthropicApiKey: string | null;
  } | null;
  if (byokSettings?.enabled && byokSettings?.anthropicApiKey) {
    return {
      ...baseEnv,
      ANTHROPIC_API_KEY: byokSettings.anthropicApiKey,
    };
  }

  console.error('[config] WARNING: No API key configured');
  return baseEnv;
}

/**
 * Find the PDF file in a workspace directory.
 * Looks for any .pdf file (workspaces should have exactly one).
 */
function findPdfInWorkspace(workspacePath: string): string | null {
  try {
    const files = fs.readdirSync(workspacePath);
    const pdfFile = files.find((f) => f.toLowerCase().endsWith('.pdf'));
    return pdfFile ? path.join(workspacePath, pdfFile) : null;
  } catch {
    return null;
  }
}

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      log.info(`Update available: ${info.version}`);
    });

    autoUpdater.on('update-not-available', () => {
      log.info('App is up to date');
    });

    autoUpdater.on('download-progress', (progress) => {
      log.info(`Download progress: ${Math.round(progress.percent)}%`);
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info(`Update downloaded: ${info.version}`);
      // Show native notification - installs on next quit
      const { Notification } = require('electron');
      new Notification({
        title: 'OkraPDF Update Ready',
        body: `Version ${info.version} will be installed on restart.`,
        silent: true,
      }).show();
    });

    autoUpdater.on('error', (err) => {
      log.error('Auto-update error:', err.message);
    });

    // Check for updates silently
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('Update check failed:', err.message);
    });
  }
}

let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.error(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

// Handle file download requests
ipcMain.handle('download-file', async (event, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    const result = await dialog.showSaveDialog(mainWindow!, {
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
    } else {
      return { success: false, error: 'Output directory not found' };
    }
  } catch (error) {
    console.error('Error opening directory:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// ============================================
// Session Recorder: Save session logs to disk
// ============================================

ipcMain.handle(
  'recorder:save-session',
  async (_event, data: { name: string; events: unknown[] }) => {
    try {
      const sessionsDir = path.join(
        app.getPath('home'),
        '.okrapdf',
        'sessions',
      );

      // Ensure sessions directory exists
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

// ============================================
// Trajectory Management (OpenHands-style Replay)
// ============================================

const TRAJECTORIES_DIR = path.join(
  app.getPath('home'),
  '.okrapdf',
  'trajectories',
);

// Ensure trajectories directory exists
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
        (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
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

ipcMain.handle('workspace:list-local', async () => {
  return store.get('localWorkspaces') || [];
});

ipcMain.handle('workspace:open-pdf-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false };
  }

  const pdfPath = result.filePaths[0];
  const fileName = path.basename(pdfPath, '.pdf');
  const workspaceId = `local-${nanoid(12)}`;
  const workspacePath = path.join(WORKSPACES_DIR, workspaceId);

  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'ocr'));
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

  const workspaces = (store.get('localWorkspaces') ||
    []) as (typeof workspace)[];
  workspaces.unshift(workspace);
  store.set('localWorkspaces', workspaces);

  currentWorkspacePath = workspacePath;
  store.set('lastWorkspacePath', workspacePath);

  return { success: true, workspace };
});

ipcMain.handle(
  'workspace:create-from-path',
  async (_event, pdfPath: string) => {
    const fileName = path.basename(pdfPath, '.pdf');
    const pdfFileName = path.basename(pdfPath);
    const workspaceId = `local-${nanoid(12)}`;
    const workspacePath = path.join(WORKSPACES_DIR, workspaceId);

    fs.mkdirSync(workspacePath, { recursive: true });
    fs.mkdirSync(path.join(workspacePath, 'ocr'));
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

    const workspaces = (store.get('localWorkspaces') ||
      []) as (typeof workspace)[];
    workspaces.unshift(workspace);
    store.set('localWorkspaces', workspaces);

    currentWorkspacePath = workspacePath;
    store.set('lastWorkspacePath', workspacePath);

    return workspace;
  },
);

ipcMain.handle(
  'workspace:update-last-opened',
  async (_event, workspaceId: string) => {
    const workspaces = (store.get('localWorkspaces') || []) as Array<{
      id: string;
      lastOpenedAt: string;
      workspacePath: string;
    }>;
    const idx = workspaces.findIndex((w) => w.id === workspaceId);
    if (idx >= 0) {
      workspaces[idx].lastOpenedAt = new Date().toISOString();
      currentWorkspacePath = workspaces[idx].workspacePath;
      store.set('lastWorkspacePath', currentWorkspacePath);
      store.set('localWorkspaces', workspaces);
    }
    return { success: true };
  },
);

ipcMain.handle(
  'workspace:delete-local',
  async (_event, workspaceId: string) => {
    const workspaces = (store.get('localWorkspaces') || []) as Array<{
      id: string;
      workspacePath: string;
    }>;
    const workspace = workspaces.find((w) => w.id === workspaceId);

    if (workspace) {
      try {
        fs.rmSync(workspace.workspacePath, { recursive: true, force: true });
      } catch (err) {
        console.error('Failed to delete workspace dir:', err);
      }
      store.set(
        'localWorkspaces',
        workspaces.filter((w) => w.id !== workspaceId),
      );
    }
    return { success: true };
  },
);

// ============================================
// Extraction IPC Handlers (BYOK local processing)
// ============================================

let extractionAbortController: AbortController | null = null;

ipcMain.handle('extraction:start-text', async (_event, workspaceId: string) => {
  const workspaces = (store.get('localWorkspaces') || []) as Array<{
    id: string;
    workspacePath: string;
    extractionStatus: string;
  }>;
  const workspace = workspaces.find((w) => w.id === workspaceId);

  if (!workspace) {
    return { success: false, error: 'Workspace not found' };
  }

  const pdfPath = findPdfInWorkspace(workspace.workspacePath);
  if (!pdfPath) {
    return { success: false, error: 'PDF not found in workspace' };
  }
  const ocrDir = path.join(workspace.workspacePath, 'ocr');

  const updateWorkspaceStatus = (status: string, progress?: number) => {
    const ws = (store.get('localWorkspaces') || []) as Array<{
      id: string;
      extractionStatus: string;
      extractionProgress?: number;
    }>;
    const idx = ws.findIndex((w) => w.id === workspaceId);
    if (idx >= 0) {
      ws[idx].extractionStatus = status;
      if (progress !== undefined) ws[idx].extractionProgress = progress;
      store.set('localWorkspaces', ws);
    }
  };

  updateWorkspaceStatus('extracting', 0);

  extractionAbortController = new AbortController();

  const onProgress = (progress: ExtractionProgress) => {
    const pct = Math.round((progress.currentPage / progress.totalPages) * 100);
    updateWorkspaceStatus('extracting', pct);
    mainWindow?.webContents.send('extraction:progress', {
      workspaceId,
      ...progress,
      status: 'processing',
    });
  };

  try {
    const result = await extractTextFromPDF(pdfPath, ocrDir, onProgress);

    if (result.success) {
      updateWorkspaceStatus('completed', 100);
      const metadataPath = path.join(workspace.workspacePath, 'metadata.json');
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      metadata.textExtractionComplete = true;
      metadata.pageCount = result.totalPages;
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    } else {
      updateWorkspaceStatus('failed');
    }

    mainWindow?.webContents.send('extraction:progress', {
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
});

ipcMain.handle('extraction:cancel', async () => {
  extractionAbortController?.abort();
  extractionAbortController = null;
  return { success: true };
});

ipcMain.handle(
  'extraction:get-page-content',
  async (_event, workspacePath: string, pageNum: number) => {
    const filePath = path.join(
      workspacePath,
      'ocr',
      `page-${String(pageNum).padStart(3, '0')}.md`,
    );
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return { page: pageNum, content };
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
    const workspaces = (store.get('localWorkspaces') || []) as Array<{
      id: string;
      workspacePath: string;
    }>;
    const workspace = workspaces.find((w) => w.id === workspaceId);

    if (!workspace) {
      return { success: false, error: 'Workspace not found' };
    }

    // Get OpenRouter API key from new provider system or legacy BYOK
    const providerConfigs = providerStore.get('providerConfigs') as Record<
      string,
      { apiKey?: string }
    > | null;
    let apiKey = providerConfigs?.['openrouter']?.apiKey;

    // Fallback to legacy BYOK
    if (!apiKey) {
      const byokSettings = store.get('byokSettings') as
        | { openrouterApiKey?: string }
        | undefined;
      apiKey = byokSettings?.openrouterApiKey;
    }

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
      mainWindow?.webContents.send('extraction:table-progress', {
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

      mainWindow?.webContents.send('extraction:table-progress', {
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
      const message = error instanceof Error ? error.message : 'Unknown error';
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
  async (_event, workspacePath: string, tableId: string, markdown: string) => {
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

// ============================================
// Local Verification State IPC Handlers
// ============================================

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

// ============================================
// Telemetry IPC Handlers (PostHog)
// Pattern: Main process events forwarded via IPC to renderer
// ============================================

ipcMain.handle('telemetry:get-consent', async () => {
  return store.get('telemetryConsent') as boolean | null;
});

ipcMain.handle('telemetry:set-consent', async (_event, consent: boolean) => {
  store.set('telemetryConsent', consent);
  console.error(`[telemetry] Consent set to ${consent}`);
  return { success: true };
});

ipcMain.handle('telemetry:get-user-id', async () => {
  let userId = store.get('telemetryUserId') as string | null;
  if (!userId) {
    // Generate anonymous ID on first use
    const { randomUUID } = require('crypto');
    userId = `desktop_${randomUUID()}`;
    store.set('telemetryUserId', userId);
    console.error(
      `[telemetry] Generated new user ID: ${userId.slice(0, 20)}...`,
    );
  }
  return userId;
});

function sendTelemetryEvent(
  eventName: string,
  properties?: Record<string, unknown>,
) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('telemetry:event', { eventName, properties });
  }
}

ipcMain.handle('byok:get-settings', async () => {
  return store.get('byokSettings');
});

ipcMain.handle(
  'byok:set-settings',
  async (
    _event,
    settings: {
      enabled: boolean;
      anthropicApiKey?: string;
      openrouterApiKey?: string;
    },
  ) => {
    store.set('byokSettings', {
      ...settings,
      lastValidated: new Date().toISOString(),
    });
    console.error(`[byok] Settings updated, enabled=${settings.enabled}`);
    return { success: true };
  },
);

ipcMain.handle(
  'byok:validate-key',
  async (_event, provider: 'anthropic' | 'openrouter', apiKey: string) => {
    try {
      if (provider === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Hi' }],
          }),
        });

        if (response.ok || response.status === 400) {
          return { valid: true, provider };
        }

        const errorData = await response.json().catch(() => ({}));
        return {
          valid: false,
          provider,
          error: errorData.error?.message || `HTTP ${response.status}`,
        };
      }

      if (provider === 'openrouter') {
        const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (response.ok) {
          return { valid: true, provider };
        }

        return { valid: false, provider, error: `HTTP ${response.status}` };
      }

      return { valid: false, provider, error: 'Unknown provider' };
    } catch (error) {
      return {
        valid: false,
        provider,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  },
);

/**
 * Check if an Anthropic API key is configured (from provider config or legacy BYOK).
 */
function hasAnthropicApiKey(): boolean {
  // Check new provider config system first
  const providerConfigs = providerStore.get('providerConfigs') as Record<
    string,
    { apiKey?: string }
  > | null;
  if (providerConfigs?.['anthropic']?.apiKey) {
    return true;
  }
  // Fallback to legacy BYOK
  const byokSettings = store.get('byokSettings') as {
    enabled: boolean;
    anthropicApiKey: string | null;
  } | null;
  return !!byokSettings?.enabled && !!byokSettings?.anthropicApiKey;
}

ipcMain.handle('byok:is-enabled', async () => {
  return hasAnthropicApiKey();
});

ipcMain.handle('shell:open-external', async (_event, url: string) => {
  shell.openExternal(url);
});

ipcMain.handle('claude:check-status', async () => {
  return { ready: hasAnthropicApiKey() };
});

// Get current workspace path
ipcMain.handle('workspace:get-current', async () => {
  return { workspacePath: currentWorkspacePath };
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
      shell.showItemInFolder(workspacePath);
      return { success: true };
    }
    return { success: false, error: 'Path does not exist' };
  },
);

ipcMain.on(
  'claude-code:query',
  async (
    event,
    data:
      | string
      | { content: string; files?: { name: string; buffer: ArrayBuffer }[] },
  ) => {
    const abortController = new AbortController();
    // Use current workspace if set (from OkraPDF bootstrap), otherwise default to agent directory
    const cwd = currentWorkspacePath || WORKSPACES_DIR;
    const problemsDir = path.join(cwd, 'problems');
    const outputDir = cwd;
    console.error('Querying in workspace:', cwd);

    if (!hasAnthropicApiKey()) {
      event.reply(
        'claude-code:error',
        'Please configure your Anthropic API key in Settings > Agent Providers.',
      );
      return;
    }

    // Track agent query start
    const queryStartTime = Date.now();
    sendTelemetryEvent('agent_query_started', {
      hasFiles: !!(typeof data !== 'string' && data.files?.length),
      workspacePath: cwd,
    });

    // Track files in output directory before starting
    let initialOutputFiles: string[] = [];
    try {
      if (fs.existsSync(outputDir)) {
        initialOutputFiles = fs.readdirSync(outputDir).filter((file) => {
          // Only include .xlsx and .csv files
          const filePath = path.join(outputDir, file);
          const ext = path.extname(file).toLowerCase();
          return (
            fs.statSync(filePath).isFile() &&
            (ext === '.xlsx' || ext === '.csv')
          );
        });
      }
    } catch (error) {
      console.warn('Could not read initial output directory:', error);
    }

    const BASE_PROMPT = `You are working in an OkraPDF document workspace. Read CLAUDE.md first to understand the available files and structure.

Key files:
- *.pdf - The original PDF document (kept with original filename)
- tables/*.md - Extracted tables as markdown
- ocr/*.md - OCR text per page (flat)
- derived/ocr/{jobId}/*.md - OCR text per page (namespaced)
- metadata.json - Document metadata

When answering questions, cite specific page numbers. Use the xlsx and pdf skills for file operations.

---

User query: `;

    // Handle both old string format and new object format for backward compatibility
    let prompt: string = BASE_PROMPT;
    let files: { name: string; buffer: ArrayBuffer }[] | undefined;

    if (typeof data === 'string') {
      prompt += data;
    } else {
      prompt += data.content;
      files = data.files;
    }

    try {
      // Save uploaded files to problems directory
      if (files && files.length > 0) {
        const fs = require('fs').promises;

        // Ensure problems directory exists
        try {
          await fs.access(problemsDir);
        } catch {
          await fs.mkdir(problemsDir, { recursive: true });
        }

        for (const file of files) {
          try {
            // Validate file size (10MB limit)
            if (file.buffer.byteLength > 10 * 1024 * 1024) {
              console.warn(
                `File ${file.name} is too large (${Math.round(file.buffer.byteLength / 1024 / 1024)}MB), skipping`,
              );
              event.reply(
                'claude-code:error',
                `File ${file.name} is too large. Maximum size is 10MB.`,
              );
              continue;
            }

            // Generate unique filename to avoid conflicts
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            const ext = path.extname(file.name);
            const baseName = path.basename(file.name, ext);
            const uniqueFileName = `${baseName}_${timestamp}_${randomSuffix}${ext}`;
            const filePath = path.join(problemsDir, uniqueFileName);

            // Convert ArrayBuffer to Buffer and save
            const buffer = Buffer.from(file.buffer);
            await fs.writeFile(filePath, buffer);

            console.error(`Saved file: ${uniqueFileName} to ${problemsDir}`);

            // Append file information to prompt
            prompt += `\n\nUploaded file: ${uniqueFileName} (saved to ${filePath})`;
          } catch (fileError) {
            console.error(`Error processing file ${file.name}:`, fileError);
            event.reply(
              'claude-code:error',
              `Failed to save file ${file.name}: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`,
            );
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any[] = [];

      // Get bundled bun path (works on fresh install without Node.js)
      const getBundledBunPath = (): string | undefined => {
        if (app.isPackaged) {
          // Production: bundled in extraResources
          const bunPath = path.join(process.resourcesPath, 'bun');
          console.error(`[getBundledBunPath] Checking: ${bunPath}`);
          if (fs.existsSync(bunPath)) return bunPath;
        }
        // Development: use resources directory or system bun
        const devResourcePath = path.join(__dirname, '../../resources/bun');
        if (fs.existsSync(devResourcePath)) return devResourcePath;
        // Fallback to system bun in dev
        try {
          const result = execSync('which bun', { encoding: 'utf-8' }).trim();
          if (result && fs.existsSync(result)) return result;
        } catch {
          /* no system bun */
        }
        return undefined;
      };

      // Get bundled uv path (for Python/MCP servers)
      const getBundledUvPath = (): string | undefined => {
        if (app.isPackaged) {
          const uvPath = path.join(process.resourcesPath, 'uv');
          if (fs.existsSync(uvPath)) return uvPath;
        }
        const devResourcePath = path.join(__dirname, '../../resources/uv');
        if (fs.existsSync(devResourcePath)) return devResourcePath;
        try {
          const result = execSync('which uv', { encoding: 'utf-8' }).trim();
          if (result && fs.existsSync(result)) return result;
        } catch {
          /* no system uv */
        }
        return undefined;
      };

      const bunPath = getBundledBunPath();
      if (!bunPath) {
        event.reply(
          'claude-code:error',
          'Bundled runtime not found. This is a packaging bug - please report it.',
        );
        console.error(
          '[ERROR] Could not find bundled bun. App may not be packaged correctly.',
        );
        return;
      }

      // Find claude CLI - the SDK bundles its own cli.js
      const getBundledClaudePath = (): string | undefined => {
        // The SDK (@anthropic-ai/claude-agent-sdk) includes its own cli.js
        if (app.isPackaged) {
          // Production: unpacked from asar
          const resourcePath = path.join(
            process.resourcesPath,
            'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk/cli.js',
          );
          console.error(`[getBundledClaudePath] Checking: ${resourcePath}`);
          if (fs.existsSync(resourcePath)) return resourcePath;
        }
        // Development
        const devPath = path.join(
          __dirname,
          '../../node_modules/@anthropic-ai/claude-agent-sdk/cli.js',
        );
        console.error(`[getBundledClaudePath] Checking dev: ${devPath}`);
        if (fs.existsSync(devPath)) return devPath;
        return undefined;
      };

      const claudePath = getBundledClaudePath();
      if (!claudePath) {
        event.reply(
          'claude-code:error',
          'Claude Code CLI not found in SDK bundle. This is a bug - please report it.',
        );
        console.error(
          '[ERROR] Could not find bundled CLI. Checked paths above.',
        );
        return;
      }

      // Build enhanced PATH with bundled runtimes
      // The resources dir contains: bun, node (symlink to bun), uv
      const uvPath = getBundledUvPath();
      const runtimeDir = app.isPackaged
        ? process.resourcesPath
        : path.join(__dirname, '../../resources');
      const baseEnv = {
        ...process.env,
        // Put bundled runtimes first in PATH so they take precedence
        PATH: `${runtimeDir}:${process.env.PATH || ''}`,
      };
      // Add Claude API config (BYOK or proxy)
      const enhancedEnv = getClaudeEnv(baseEnv);

      console.error(`[query] Using bun: ${bunPath}`);
      console.error(`[query] Using uv: ${uvPath || 'not found'}`);
      console.error(`[query] Using claude: ${claudePath}`);
      console.error(
        `[query] Enhanced PATH: ${enhancedEnv.PATH?.substring(0, 100)}...`,
      );

      // Dynamic import for ESM-only SDK
      const { query } = await import('@anthropic-ai/claude-agent-sdk');
      const queryIterator = query({
        prompt,
        options: {
          cwd,
          pathToClaudeCodeExecutable: claudePath,
          env: enhancedEnv,
          stderr: (msg) => console.error('[SDK stderr]', msg),
          abortController,
          maxTurns: 100,
          settingSources: ['local', 'project'],
          allowedTools: [
            'Bash',
            'Create',
            'Edit',
            'Read',
            'Write',
            'MultiEdit',
            'WebSearch',
            'GrepTool',
            'Skill',
            'TodoWrite',
            'TodoEdit',
          ],
        },
      });

      // eslint-disable-next-line no-restricted-syntax
      for await (const message of queryIterator) {
        messages.push(message);
        console.error(JSON.stringify(message));
        event.reply('claude-code:response', message);
      }

      // Check for new output files after completion
      try {
        if (fs.existsSync(outputDir)) {
          const finalOutputFiles = fs.readdirSync(outputDir);
          const newFiles = finalOutputFiles.filter((file) => {
            // Only include new files that are .xlsx or .csv
            if (initialOutputFiles.includes(file)) {
              return false;
            }
            const filePath = path.join(outputDir, file);
            const ext = path.extname(file).toLowerCase();
            return (
              fs.statSync(filePath).isFile() &&
              (ext === '.xlsx' || ext === '.csv')
            );
          });

          if (newFiles.length > 0) {
            const outputFiles = newFiles.map((fileName) => ({
              name: fileName,
              path: path.join(outputDir, fileName),
              size: fs.statSync(path.join(outputDir, fileName)).size,
              created: fs.statSync(path.join(outputDir, fileName)).mtime,
            }));

            console.error('New output files detected:', outputFiles);
            event.reply('claude-code:output-files', outputFiles);
          }
        }
      } catch (error) {
        console.warn('Error checking for output files:', error);
      }

      console.error('FINISHED CLAUDE CODE EVALUATION!');

      // Track agent query completion
      sendTelemetryEvent('agent_query_completed', {
        durationMs: Date.now() - queryStartTime,
        messageCount: messages.length,
        outputFilesCount: fs.existsSync(outputDir)
          ? fs
              .readdirSync(outputDir)
              .filter((f) =>
                ['.xlsx', '.csv'].includes(path.extname(f).toLowerCase()),
              ).length
          : 0,
      });
    } catch (error) {
      console.error('Claude Code SDK error:', error);

      // Track agent query error
      sendTelemetryEvent('agent_query_error', {
        durationMs: Date.now() - queryStartTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      event.reply(
        'claude-code:error',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  },
);

// ============================================================================
// Review Agent IPC Handler
// Uses Claude Agent SDK to run a specialized review assistant
// ============================================================================

// Store active review agent abort controllers
const reviewAgentAbortControllers = new Map<string, AbortController>();

ipcMain.on(
  'review-agent:query',
  async (
    event,
    data: {
      sessionId: string;
      message: string;
      context: {
        jobId: string;
        documentName?: string;
        currentPage?: number;
        tableMarkdown?: string;
        pageContent?: string;
      };
    },
  ) => {
    const { sessionId, message, context } = data;
    console.error(
      `[review-agent] Query received for session ${sessionId}:`,
      message.slice(0, 100),
    );

    // Create abort controller for this session
    const abortController = new AbortController();
    reviewAgentAbortControllers.set(sessionId, abortController);

    try {
      // Build a specialized review prompt
      const systemContext = [
        `You are a document review assistant helping verify OCR extraction results.`,
        ``,
        `Current context:`,
        `- Job ID: ${context.jobId}`,
        context.documentName ? `- Document: ${context.documentName}` : null,
        context.currentPage ? `- Page: ${context.currentPage}` : null,
        ``,
        context.tableMarkdown
          ? `## Table Content (editable)\n\`\`\`markdown\n${context.tableMarkdown}\n\`\`\``
          : null,
        context.pageContent
          ? `## Page Content\n\`\`\`\n${context.pageContent}\n\`\`\``
          : null,
        ``,
        `Your role:`,
        `- Answer questions about the extracted content`,
        `- Help verify table data accuracy`,
        `- Suggest corrections when you spot issues`,
        `- Be concise and direct`,
      ]
        .filter(Boolean)
        .join('\n');

      const fullPrompt = `${systemContext}\n\n## User Request\n${message}`;

      // Get workspace path
      const workspacePath =
        (store.get('currentWorkspace') as string) ||
        path.join(app.getPath('desktop'), 'okrapdf');

      // Get bundled paths (reusing from claude-code handler)
      const getBundledBunPath = (): string | undefined => {
        if (app.isPackaged) {
          const bunPath = path.join(process.resourcesPath, 'bun');
          if (fs.existsSync(bunPath)) return bunPath;
        }
        const devResourcePath = path.join(__dirname, '../../resources/bun');
        if (fs.existsSync(devResourcePath)) return devResourcePath;
        try {
          const result = execSync('which bun', { encoding: 'utf-8' }).trim();
          if (result && fs.existsSync(result)) return result;
        } catch {
          /* no system bun */
        }
        return undefined;
      };

      const getBundledClaudePath = (): string | undefined => {
        if (app.isPackaged) {
          const resourcePath = path.join(
            process.resourcesPath,
            'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk/cli.js',
          );
          if (fs.existsSync(resourcePath)) return resourcePath;
        }
        const devPath = path.join(
          __dirname,
          '../../node_modules/@anthropic-ai/claude-agent-sdk/cli.js',
        );
        if (fs.existsSync(devPath)) return devPath;
        return undefined;
      };

      const bunPath = getBundledBunPath();
      const claudePath = getBundledClaudePath();

      if (!bunPath || !claudePath) {
        event.reply('review-agent:error', {
          sessionId,
          error: 'Runtime not found',
        });
        return;
      }

      const runtimeDir = app.isPackaged
        ? process.resourcesPath
        : path.join(__dirname, '../../resources');
      const baseEnv = {
        ...process.env,
        PATH: `${runtimeDir}:${process.env.PATH || ''}`,
      };
      // Add Claude API config (BYOK or proxy)
      const enhancedEnv = getClaudeEnv(baseEnv);

      // Dynamic import for ESM-only SDK
      console.error('[review-agent] About to import SDK...');
      const { query } = await import('@anthropic-ai/claude-agent-sdk');
      console.error('[review-agent] SDK imported, starting query...');

      // Run the agent with limited tools for review
      const queryIterator = query({
        prompt: fullPrompt,
        options: {
          cwd: workspacePath,
          pathToClaudeCodeExecutable: claudePath,
          env: enhancedEnv,
          stderr: (msg) => console.error('[review-agent stderr]', msg),
          abortController,
          maxTurns: 10, // Limit turns for review agent
          allowedTools: ['Read', 'WebSearch'], // Limited tools for review
        },
      });

      for await (const sdkMessage of queryIterator) {
        if (abortController.signal.aborted) {
          console.error(`[review-agent] Session ${sessionId} aborted`);
          break;
        }

        // Map SDK message to review agent response format
        if (sdkMessage.type === 'assistant') {
          // Extract text content from assistant message
          const textContent = sdkMessage.message.content
            .filter((block: { type: string }) => block.type === 'text')
            .map((block: { type: string; text?: string }) => block.text || '')
            .join('');

          if (textContent) {
            event.reply('review-agent:response', {
              sessionId,
              type: 'text',
              content: textContent,
            });
          }
        } else if (sdkMessage.type === 'result') {
          // Tool result
          event.reply('review-agent:response', {
            sessionId,
            type: 'tool_result',
            content:
              typeof sdkMessage.result === 'string'
                ? sdkMessage.result
                : JSON.stringify(sdkMessage.result),
          });
        }
      }

      event.reply('review-agent:done', { sessionId });
    } catch (error) {
      console.error('[review-agent] Error:', error);
      event.reply('review-agent:error', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      reviewAgentAbortControllers.delete(sessionId);
    }
  },
);

// Handle abort requests
ipcMain.on('review-agent:abort', (_event, sessionId: string) => {
  const controller = reviewAgentAbortControllers.get(sessionId);
  if (controller) {
    console.error(`[review-agent] Aborting session ${sessionId}`);
    controller.abort();
    reviewAgentAbortControllers.delete(sessionId);
  }
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS', 'REDUX_DEVTOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.error);
};

const createWindow = async () => {
  console.error('createWindow called');
  if (isDebug) {
    console.error('Installing extensions...');
    await installExtensions();
    console.error('Extensions installed');
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  console.error('Creating main window...');
  mainWindow = new BrowserWindow({
    show: true, // show immediately for debugging
    width: 1280,
    height: 800,
    minWidth: 1024, // Prevent cropping: sidebar(165) + pdf(450) + content(350) + margins
    minHeight: 700, // Prevent cropping: header(60) + content area
    useContentSize: true, // Dimensions refer to web content, not window chrome
    // icon: getAssetPath('icon.png'), // temporarily disabled for debugging
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // Allow loading local file:// PDFs
    },
  });
  console.error('Main window created successfully');

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }

    // Set up OCR provider IPC handlers
    setupOcrIpcHandlers(mainWindow);

    // Track app launch after window is ready (renderer can receive events)
    setTimeout(() => {
      sendTelemetryEvent('app_launched', {
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
      });
    }, 1000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Clean up handlers
  cleanupVerificationIpcHandlers();
  cleanupOcrIpcHandlers();

  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    console.error('App ready, creating window...');

    setupVerificationIpcHandlers();
    registerCodingAgentHandlers();

    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.error);
