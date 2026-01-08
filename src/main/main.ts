/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
// Note: @anthropic-ai/claude-agent-sdk is ESM-only, use dynamic import
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';
import fixPath from 'fix-path';
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import * as Sentry from '@sentry/electron/main';
import { initializeAPIConfig, API_CONFIG } from '../config/api-config';
import { SENTRY_DSN, SENTRY_ENABLED, SENTRY_ENVIRONMENT } from '../config/sentry';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { setupVerificationIpcHandlers, cleanupVerificationIpcHandlers } from './verification/ipc-handlers';

// Fix PATH for Electron - GUI apps don't inherit shell PATH
// This is required for spawning node/claude processes
fixPath();

// Initialize API configuration (BYOA mode - no bundled key)
initializeAPIConfig();
if (SENTRY_ENABLED) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    tracesSampleRate: 0,
  });
  Sentry.setTag('process', 'main');
}

// OAuth popup window reference
let authWindow: BrowserWindow | null = null;

// Handle OAuth popup login
ipcMain.handle('auth:oauth-popup', async () => {
  return new Promise((resolve, reject) => {
    // Create popup window for OAuth
    authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      show: true,
      modal: true,
      parent: mainWindow!,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Load Clerk sign-in page
    authWindow.loadURL('https://accounts.okrapdf.com/sign-in');

    // Monitor for successful authentication
    const checkAuth = async () => {
      try {
        // Check if we're on the app page (signed in)
        const currentUrl = authWindow?.webContents.getURL() || '';

        if (currentUrl.includes('app.okrapdf.com') && !currentUrl.includes('sign-in')) {
          // User is signed in, get the session token from cookies
          const cookies = await authWindow?.webContents.session.cookies.get({
            domain: '.okrapdf.com'
          });

          const sessionCookie = cookies?.find(c => c.name === '__session');

          if (sessionCookie) {
            authWindow?.close();
            authWindow = null;
            resolve({ success: true, token: sessionCookie.value });
            return;
          }
        }
      } catch (err) {
        console.error('Auth check error:', err);
      }
    };

    // Check auth state on navigation
    authWindow.webContents.on('did-navigate', checkAuth);
    authWindow.webContents.on('did-navigate-in-page', checkAuth);

    // Handle window close
    authWindow.on('closed', () => {
      authWindow = null;
      resolve({ success: false, error: 'Authentication cancelled' });
    });
  });
});

// Persistent store for auth tokens and settings (like Jan, OpenHands, Dyad)
const store = new Store({
  name: 'okrapdf-settings',
  defaults: {
    okrapdfToken: null as string | null,
    desktopApiKey: null as string | null, // Long-lived Clerk API key (30 days)
    lastWorkspacePath: null as string | null,
  },
});

// OkraPDF API configuration
const OKRAPDF_API_BASE = API_CONFIG.OKRAPDF_API_BASE;
const OKRAPDF_DESKTOP_TOKEN_URL = `${OKRAPDF_API_BASE}/api/desktop/token`;

function formatKeyPrefix(key: string | null): string {
  if (!key) return 'missing';
  return `${key.slice(0, 12)}...`;
}

// Default workspace directory (accessible to user for collaboration)
const DEFAULT_WORKSPACE = path.join(app.getPath('desktop'), 'okrapdf');

// Ensure default workspace exists on first launch
if (!fs.existsSync(DEFAULT_WORKSPACE)) {
  fs.mkdirSync(DEFAULT_WORKSPACE, { recursive: true });
  console.error(`[workspace] Created default workspace at ${DEFAULT_WORKSPACE}`);
}

// Load persisted auth token (session token for API calls)
let authToken: string | null = store.get('okrapdfToken') as string | null;
// Long-lived API key for Claude proxy (30 days, from Clerk)
let desktopApiKey: string | null = store.get('desktopApiKey') as string | null;

// Current workspace path (defaults to ~/Desktop/okrapdf)
let currentWorkspacePath: string | null = store.get('lastWorkspacePath') as string | null;
if (!currentWorkspacePath) {
  currentWorkspacePath = DEFAULT_WORKSPACE;
}

// Proxy URL - routes through okrapdf.com which adds server's API key
// SDK appends /v1/messages, so this becomes https://okrapdf.com/api/v1/messages
const CLAUDE_PROXY_URL = 'https://okrapdf.com/api';

/**
 * Get environment variables for Claude SDK
 * Routes through okrapdf.com proxy with auth token
 */
function getClaudeEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!desktopApiKey) {
    console.error('[config] WARNING: No desktop API key for proxy mode');
  }

  return {
    ...baseEnv,
    ANTHROPIC_BASE_URL: CLAUDE_PROXY_URL,
    // Long-lived Clerk API key - proxy verifies via clerkClient.apiKeys.verifySecret()
    ANTHROPIC_API_KEY: desktopApiKey || 'missing-api-key',
  };
}

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
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

const TRAJECTORIES_DIR = path.join(app.getPath('home'), '.okrapdf', 'trajectories');

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
    }
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
  }
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
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

    return { success: true, trajectories };
  } catch (error) {
    console.error('[trajectory] List error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// ============================================
// OkraPDF Integration: Auth & Workspace
// ============================================

// Auth token management (persisted with electron-store)
ipcMain.handle('auth:set-token', async (_event, token: string) => {
  authToken = token;
  store.set('okrapdfToken', token);
  console.error('[auth] Session token set and persisted');

  // Exchange session token for long-lived API key (30 days)
  try {
    console.error(`[auth] Requesting desktop API key from ${OKRAPDF_DESKTOP_TOKEN_URL}`);
    const response = await fetch(OKRAPDF_DESKTOP_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.token) {
        desktopApiKey = data.token;
        store.set('desktopApiKey', data.token);
        console.error(`[auth] Desktop API key obtained (30-day expiry), prefix=${formatKeyPrefix(desktopApiKey)}`);
      } else if (data.hasExistingKey) {
        // Check if we actually have the cached key
        const cachedKey = store.get('desktopApiKey') as string | null;
        if (cachedKey) {
          desktopApiKey = cachedKey;
          console.error(`[auth] Desktop API key already exists, using cached prefix=${formatKeyPrefix(desktopApiKey)}`);
        } else {
          // Key exists on server but we lost it locally - revoke and recreate
          console.error('[auth] API key exists but not cached locally, revoking and recreating...');
          const deleteResp = await fetch(OKRAPDF_DESKTOP_TOKEN_URL, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          if (deleteResp.ok) {
            // Now create a new key
            const createResp = await fetch(OKRAPDF_DESKTOP_TOKEN_URL, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });
            if (createResp.ok) {
              const newData = await createResp.json();
              if (newData.token) {
                desktopApiKey = newData.token;
                store.set('desktopApiKey', newData.token);
                console.error(`[auth] New desktop API key obtained after revoke, prefix=${formatKeyPrefix(desktopApiKey)}`);
              }
            }
          }
        }
      }
    } else {
      console.error('[auth] Failed to get desktop API key:', response.status);
    }
  } catch (error) {
    console.error('[auth] Error exchanging token for API key:', error);
  }

  return { success: true };
});

// Hidden window for token refresh
let tokenRefreshWindow: BrowserWindow | null = null;

async function refreshClerkToken(): Promise<string | null> {
  return new Promise((resolve) => {
    // Create hidden window to trigger Clerk token refresh
    tokenRefreshWindow = new BrowserWindow({
      width: 400,
      height: 300,
      show: false, // Hidden
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const timeout = setTimeout(() => {
      tokenRefreshWindow?.close();
      tokenRefreshWindow = null;
      resolve(null);
    }, 10000); // 10s timeout

    tokenRefreshWindow.webContents.on('did-finish-load', async () => {
      // Wait a bit for Clerk to refresh token
      await new Promise((r) => setTimeout(r, 1000));

      try {
        const cookies = await tokenRefreshWindow?.webContents.session.cookies.get({
          domain: '.okrapdf.com',
          name: '__session',
        });
        const sessionCookie = cookies?.[0];
        clearTimeout(timeout);
        tokenRefreshWindow?.close();
        tokenRefreshWindow = null;

        if (sessionCookie?.value) {
          authToken = sessionCookie.value;
          store.set('okrapdfToken', authToken);
          resolve(sessionCookie.value);
        } else {
          resolve(null);
        }
      } catch (err) {
        console.error('[auth] Token refresh failed:', err);
        clearTimeout(timeout);
        tokenRefreshWindow?.close();
        tokenRefreshWindow = null;
        resolve(null);
      }
    });

    // Load app.okrapdf.com to trigger Clerk session refresh
    tokenRefreshWindow.loadURL('https://app.okrapdf.com');
  });
}

ipcMain.handle('auth:get-token', async () => {
  // Use long-lived desktop API key (30-day expiry) instead of session token
  // Session tokens expire in ~60s which breaks API calls during long operations
  if (desktopApiKey) {
    return { token: desktopApiKey };
  }

  // No API key available - user needs to re-login
  console.error('[auth:get-token] No desktop API key available');
  return { token: null };
});

ipcMain.handle('auth:clear-token', async () => {
  authToken = null;
  desktopApiKey = null;
  store.delete('okrapdfToken');
  store.delete('desktopApiKey');
  console.error('[auth] Session token and API key cleared');
  return { success: true };
});

// Check if logged into okrapdf (enables proxy mode)
ipcMain.handle('claude:check-status', async () => {
  try {
    // Check if logged into okrapdf (enables proxy mode via long-lived API key)
    const hasProxyAuth = !!desktopApiKey;

    return {
      hasProxyAuth,
      ready: hasProxyAuth,
    };
  } catch (error) {
    console.error('[claude:check-status] Error:', error);
    return {
      hasProxyAuth: false,
      ready: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// Fetch library from OkraPDF
ipcMain.handle('library:fetch', async () => {
  // Use long-lived API key (30 days), not short-lived session token
  if (!desktopApiKey) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    console.error(`[library] Using API key prefix=${formatKeyPrefix(desktopApiKey)}`);
    const response = await fetch(`${OKRAPDF_API_BASE}/api/desktop/library`, {
      headers: {
        Authorization: `Bearer ${desktopApiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // API key expired or invalid - clear it so user re-auths
        desktopApiKey = null;
        store.delete('desktopApiKey');
        return { success: false, error: 'API key expired. Please login again.' };
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true, documents: data.documents || [] };
  } catch (error) {
    console.error('[library] Fetch error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// Bootstrap workspace from OkraPDF document
ipcMain.handle(
  'workspace:bootstrap',
  async (event, documentUuid: string, documentName: string) => {
    // Use long-lived API key (30 days), not short-lived session token
    if (!desktopApiKey) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      console.error(`[workspace] Bootstrapping ${documentUuid}...`);

      // Create workspace directory in user's home
      const workspacesDir = path.join(app.getPath('home'), '.okrapdf', 'workspaces');
      const workspaceDir = path.join(workspacesDir, documentUuid);

      // Clean and create workspace directory
      if (fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true });
      }
      fs.mkdirSync(workspaceDir, { recursive: true });

      // Download bootstrap zip from OkraPDF
      console.error(`[workspace] Downloading bootstrap zip...`);
      console.error(`[workspace] URL: ${OKRAPDF_API_BASE}/api/desktop/bootstrap/${documentUuid}`);
      console.error(`[workspace] Token prefix: ${desktopApiKey?.substring(0, 20)}...`);
      const response = await fetch(
        `${OKRAPDF_API_BASE}/api/desktop/bootstrap/${documentUuid}`,
        {
          headers: {
            Authorization: `Bearer ${desktopApiKey}`,
          },
        },
      );

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'no body');
        console.error(`[workspace] Response body: ${errorBody}`);
        throw new Error(`Failed to download workspace: ${response.status}`);
      }

      // Save and extract zip
      const zipBuffer = await response.arrayBuffer();
      const zipPath = path.join(workspaceDir, 'bootstrap.zip');
      fs.writeFileSync(zipPath, Buffer.from(zipBuffer));

      // Extract zip using system unzip (cross-platform)
      console.error(`[workspace] Extracting zip...`);
      try {
        if (process.platform === 'win32') {
          execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${workspaceDir}' -Force"`, {
            cwd: workspaceDir,
          });
        } else {
          execSync(`unzip -o "${zipPath}" -d "${workspaceDir}"`, {
            cwd: workspaceDir,
          });
        }
      } catch (unzipError) {
        console.error('[workspace] Unzip error:', unzipError);
        // Try using adm-zip as fallback (need to install)
        throw new Error('Failed to extract workspace files');
      }

      // Clean up zip file
      fs.unlinkSync(zipPath);

      // Download source PDF
      console.error(`[workspace] Downloading source PDF...`);
      try {
        const pdfResponse = await fetch(
          `${OKRAPDF_API_BASE}/api/desktop/pdf/${documentUuid}`,
          {
            headers: {
              Authorization: `Bearer ${desktopApiKey}`,
            },
          },
        );

        if (pdfResponse.ok) {
          const pdfBuffer = await pdfResponse.arrayBuffer();
          const pdfPath = path.join(workspaceDir, 'source.pdf');
          fs.writeFileSync(pdfPath, Buffer.from(pdfBuffer));
          console.error(`[workspace] PDF saved to ${pdfPath}`);
        } else {
          console.warn(`[workspace] Could not download PDF: ${pdfResponse.status}`);
          if (SENTRY_ENABLED) {
            Sentry.captureMessage('[workspace] PDF download failed', {
              level: 'error',
              extra: {
                documentUuid,
                status: pdfResponse.status,
                apiBase: OKRAPDF_API_BASE,
              },
            });
          }
        }
      } catch (pdfError) {
        console.warn('[workspace] PDF download failed:', pdfError);
        if (SENTRY_ENABLED) {
          Sentry.captureException(pdfError);
        }
        // Non-fatal - workspace can still work without PDF viewer
      }

      currentWorkspacePath = workspaceDir;
      store.set('lastWorkspacePath', workspaceDir);
      console.error(`[workspace] Ready at ${workspaceDir}`);

      return {
        success: true,
        workspacePath: workspaceDir,
        documentName,
      };
    } catch (error) {
      console.error('[workspace] Bootstrap error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
);

// Get current workspace path
ipcMain.handle('workspace:get-current', async () => {
  return { workspacePath: currentWorkspacePath };
});

// List files in workspace directory
ipcMain.handle('workspace:list-files', async (_event, workspacePath: string) => {
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
});

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
    const cwd = currentWorkspacePath || DEFAULT_WORKSPACE;
    const problemsDir = path.join(cwd, 'problems');
    const outputDir = cwd; // Watch the agent directory itself, not a subdirectory
    console.error('Querying in workspace:', cwd);

    // Guard: ensure logged into okrapdf (proxy mode)
    if (!desktopApiKey) {
      console.error('[query] Not logged in - no desktop API key');
      event.reply('claude-code:error', 'Please log in to OkraPDF to use the agent.');
      return;
    }

    // Track files in output directory before starting
    let initialOutputFiles: string[] = [];
    try {
      if (fs.existsSync(outputDir)) {
        initialOutputFiles = fs.readdirSync(outputDir).filter(file => {
          // Only include .xlsx and .csv files
          const filePath = path.join(outputDir, file);
          const ext = path.extname(file).toLowerCase();
          return fs.statSync(filePath).isFile() &&
                 (ext === '.xlsx' || ext === '.csv');
        });
      }
    } catch (error) {
      console.warn('Could not read initial output directory:', error);
    }

    const BASE_PROMPT = `You are working in an OkraPDF document workspace. Read CLAUDE.md first to understand the available files and structure.

Key files:
- source.pdf - The original PDF document
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
        } catch { /* no system bun */ }
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
        } catch { /* no system uv */ }
        return undefined;
      };

      const bunPath = getBundledBunPath();
      if (!bunPath) {
        event.reply('claude-code:error', 'Bundled runtime not found. This is a packaging bug - please report it.');
        console.error('[ERROR] Could not find bundled bun. App may not be packaged correctly.');
        return;
      }

      // Find claude CLI - the SDK bundles its own cli.js
      const getBundledClaudePath = (): string | undefined => {
        // The SDK (@anthropic-ai/claude-agent-sdk) includes its own cli.js
        if (app.isPackaged) {
          // Production: unpacked from asar
          const resourcePath = path.join(process.resourcesPath, 'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk/cli.js');
          console.error(`[getBundledClaudePath] Checking: ${resourcePath}`);
          if (fs.existsSync(resourcePath)) return resourcePath;
        }
        // Development
        const devPath = path.join(__dirname, '../../node_modules/@anthropic-ai/claude-agent-sdk/cli.js');
        console.error(`[getBundledClaudePath] Checking dev: ${devPath}`);
        if (fs.existsSync(devPath)) return devPath;
        return undefined;
      };

      const claudePath = getBundledClaudePath();
      if (!claudePath) {
        event.reply('claude-code:error', 'Claude Code CLI not found in SDK bundle. This is a bug - please report it.');
        console.error('[ERROR] Could not find bundled CLI. Checked paths above.');
        return;
      }

      // Build enhanced PATH with bundled runtimes
      // The resources dir contains: bun, node (symlink to bun), uv
      const uvPath = getBundledUvPath();
      const runtimeDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../resources');
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
      console.error(`[query] Enhanced PATH: ${enhancedEnv.PATH?.substring(0, 100)}...`);

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
            return fs.statSync(filePath).isFile() &&
                   (ext === '.xlsx' || ext === '.csv');
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
    } catch (error) {
      console.error('Claude Code SDK error:', error);
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
    console.error(`[review-agent] Query received for session ${sessionId}:`, message.slice(0, 100));

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
        context.tableMarkdown ? `## Table Content (editable)\n\`\`\`markdown\n${context.tableMarkdown}\n\`\`\`` : null,
        context.pageContent ? `## Page Content\n\`\`\`\n${context.pageContent}\n\`\`\`` : null,
        ``,
        `Your role:`,
        `- Answer questions about the extracted content`,
        `- Help verify table data accuracy`,
        `- Suggest corrections when you spot issues`,
        `- Be concise and direct`,
      ].filter(Boolean).join('\n');

      const fullPrompt = `${systemContext}\n\n## User Request\n${message}`;

      // Get workspace path
      const workspacePath = store.get('currentWorkspace') as string || path.join(app.getPath('desktop'), 'okrapdf');

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
        } catch { /* no system bun */ }
        return undefined;
      };

      const getBundledClaudePath = (): string | undefined => {
        if (app.isPackaged) {
          const resourcePath = path.join(process.resourcesPath, 'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk/cli.js');
          if (fs.existsSync(resourcePath)) return resourcePath;
        }
        const devPath = path.join(__dirname, '../../node_modules/@anthropic-ai/claude-agent-sdk/cli.js');
        if (fs.existsSync(devPath)) return devPath;
        return undefined;
      };

      const bunPath = getBundledBunPath();
      const claudePath = getBundledClaudePath();

      if (!bunPath || !claudePath) {
        event.reply('review-agent:error', { sessionId, error: 'Runtime not found' });
        return;
      }

      const runtimeDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../resources');
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
            content: typeof sdkMessage.result === 'string' ? sdkMessage.result : JSON.stringify(sdkMessage.result),
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
  const extensions = ['REACT_DEVELOPER_TOOLS'];

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
    minWidth: 1024,   // Prevent cropping: sidebar(165) + pdf(450) + content(350) + margins
    minHeight: 700,   // Prevent cropping: header(60) + content area
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
  // Clean up verification handlers
  cleanupVerificationIpcHandlers();

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

    // Set up verification system IPC handlers
    setupVerificationIpcHandlers();

    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.error);
