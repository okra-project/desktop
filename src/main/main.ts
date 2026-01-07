/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';
import fixPath from 'fix-path';
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { initializeAPIConfig, API_CONFIG } from '../config/api-config';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { setupVerificationIpcHandlers, cleanupVerificationIpcHandlers } from './verification/ipc-handlers';

// Fix PATH for Electron - GUI apps don't inherit shell PATH
// This is required for spawning node/claude processes
fixPath();

// Initialize API configuration (BYOA mode - no bundled key)
initializeAPIConfig();

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
    anthropicApiKey: null as string | null, // BYOK support
    lastWorkspacePath: null as string | null,
  },
});

// OkraPDF API configuration
const OKRAPDF_API_BASE = API_CONFIG.OKRAPDF_API_BASE;

// Load persisted auth token
let authToken: string | null = store.get('okrapdfToken') as string | null;

// Current workspace path (set when bootstrapping from OkraPDF)
let currentWorkspacePath: string | null = store.get('lastWorkspacePath') as string | null;

// Load user's API key if previously saved (BYOK)
const savedApiKey = store.get('anthropicApiKey') as string | null;
if (savedApiKey) {
  process.env.ANTHROPIC_API_KEY = savedApiKey;
  console.log('[config] Loaded saved API key from electron-store');
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
  console.log(msgTemplate(arg));
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
// OkraPDF Integration: Auth & Workspace
// ============================================

// Auth token management (persisted with electron-store)
ipcMain.handle('auth:set-token', async (_event, token: string) => {
  authToken = token;
  store.set('okrapdfToken', token);
  console.log('[auth] Token set and persisted');
  return { success: true };
});

ipcMain.handle('auth:get-token', async () => {
  return { token: authToken };
});

ipcMain.handle('auth:clear-token', async () => {
  authToken = null;
  store.delete('okrapdfToken');
  console.log('[auth] Token cleared');
  return { success: true };
});

// BYOK: Set user's own Anthropic API key
ipcMain.handle('settings:set-api-key', async (_event, apiKey: string) => {
  store.set('anthropicApiKey', apiKey);
  process.env.ANTHROPIC_API_KEY = apiKey;
  console.log('[settings] User API key set');
  return { success: true };
});

ipcMain.handle('settings:get-api-key', async () => {
  const apiKey = store.get('anthropicApiKey') as string | null;
  return { apiKey: apiKey ? '***' + apiKey.slice(-4) : null }; // Masked for security
});

ipcMain.handle('settings:clear-api-key', async () => {
  store.delete('anthropicApiKey');
  delete process.env.ANTHROPIC_API_KEY;
  console.log('[settings] User API key cleared');
  return { success: true };
});

// Check if Claude Code CLI is installed and authenticated
ipcMain.handle('claude:check-status', async () => {
  try {
    // Check if Claude Code CLI is installed
    const claudeConfigPath = path.join(app.getPath('home'), '.claude.json');
    const claudeInstalled = fs.existsSync(claudeConfigPath);

    // Check if user has set their own API key (BYOK)
    const userApiKey = store.get('anthropicApiKey') as string | null;
    const hasUserApiKey = !!userApiKey;

    // Check environment variable
    const hasEnvApiKey = !!process.env.ANTHROPIC_API_KEY;

    // Try to check if Claude CLI is authenticated by reading config
    let claudeAuthenticated = false;
    if (claudeInstalled) {
      try {
        const configContent = fs.readFileSync(claudeConfigPath, 'utf-8');
        const config = JSON.parse(configContent);
        // If numStartups > 0, user has used Claude Code
        claudeAuthenticated = config.numStartups > 0;
      } catch {
        claudeAuthenticated = false;
      }
    }

    return {
      claudeInstalled,
      claudeAuthenticated,
      hasUserApiKey,
      hasEnvApiKey,
      ready: claudeAuthenticated || hasUserApiKey || hasEnvApiKey,
    };
  } catch (error) {
    console.error('[claude:check-status] Error:', error);
    return {
      claudeInstalled: false,
      claudeAuthenticated: false,
      hasUserApiKey: false,
      hasEnvApiKey: false,
      ready: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// Fetch library from OkraPDF
ipcMain.handle('library:fetch', async () => {
  if (!authToken) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const response = await fetch(`${OKRAPDF_API_BASE}/api/desktop/library`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        authToken = null;
        return { success: false, error: 'Session expired. Please login again.' };
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
    if (!authToken) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      console.log(`[workspace] Bootstrapping ${documentUuid}...`);

      // Create workspace directory in user's home
      const workspacesDir = path.join(app.getPath('home'), '.okrapdf', 'workspaces');
      const workspaceDir = path.join(workspacesDir, documentUuid);

      // Clean and create workspace directory
      if (fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true });
      }
      fs.mkdirSync(workspaceDir, { recursive: true });

      // Download bootstrap zip from OkraPDF
      console.log(`[workspace] Downloading bootstrap zip...`);
      const response = await fetch(
        `${OKRAPDF_API_BASE}/api/desktop/bootstrap/${documentUuid}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to download workspace: ${response.status}`);
      }

      // Save and extract zip
      const zipBuffer = await response.arrayBuffer();
      const zipPath = path.join(workspaceDir, 'bootstrap.zip');
      fs.writeFileSync(zipPath, Buffer.from(zipBuffer));

      // Extract zip using system unzip (cross-platform)
      console.log(`[workspace] Extracting zip...`);
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

      currentWorkspacePath = workspaceDir;
      store.set('lastWorkspacePath', workspaceDir);
      console.log(`[workspace] Ready at ${workspaceDir}`);

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
    const cwd = currentWorkspacePath || path.join(process.cwd(), 'agent');
    const problemsDir = path.join(cwd, 'problems');
    const outputDir = cwd; // Watch the agent directory itself, not a subdirectory
    console.log('Querying in workspace:', cwd);

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
- ocr/*.md - OCR text per page
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

            console.log(`Saved file: ${uniqueFileName} to ${problemsDir}`);

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

      const messages: SDKMessage[] = [];

      const queryIterator = query({
        prompt,
        options: {
          cwd,
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
        console.log(JSON.stringify(message));
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

            console.log('New output files detected:', outputFiles);
            event.reply('claude-code:output-files', outputFiles);
          }
        }
      } catch (error) {
        console.warn('Error checking for output files:', error);
      }

      console.log('FINISHED CLAUDE CODE EVALUATION!');
    } catch (error) {
      console.error('Claude Code SDK error:', error);
      event.reply(
        'claude-code:error',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  },
);

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
    .catch(console.log);
};

const createWindow = async () => {
  console.log('createWindow called');
  if (isDebug) {
    console.log('Installing extensions...');
    await installExtensions();
    console.log('Extensions installed');
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  console.log('Creating main window...');
  mainWindow = new BrowserWindow({
    show: true, // show immediately for debugging
    width: 1024,
    height: 728,
    // icon: getAssetPath('icon.png'), // temporarily disabled for debugging
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  console.log('Main window created successfully');

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
    console.log('App ready, creating window...');

    // Set up verification system IPC handlers
    setupVerificationIpcHandlers();

    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
