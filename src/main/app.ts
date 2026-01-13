/**
 * Application Class - VS Code-inspired application lifecycle management
 *
 * Handles window creation, menu building, and app lifecycle events.
 */

import { app, BrowserWindow, shell } from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import { resolveHtmlPath } from './util';
import MenuBuilder from './menu';
import { progressQueue } from './utils/progress-queue';
import { storeService } from './services/store.service';
import { mcpService } from './services/mcp.service';
import { indexService } from './services/index.service';
import { pdfWorkerService } from './services/pdf-worker.service';
import {
  registerAllHandlers,
  setHandlerContext,
  type HandlerContext,
} from './handlers';
import {
  setupVerificationIpcHandlers,
  cleanupVerificationIpcHandlers,
} from './verification/ipc-handlers';
import { setupOcrIpcHandlers, cleanupOcrIpcHandlers } from './providers';
import { registerCodingAgentHandlers } from './coding-agents';
import { sendTelemetryEvent } from './handlers/telemetry.handlers';

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

export class Application {
  private mainWindow: BrowserWindow | null = null;
  private workspacesDir: string;
  private currentWorkspacePath: string | null;

  constructor(workspacesDir: string) {
    this.workspacesDir = workspacesDir;
    this.currentWorkspacePath = storeService.getLastWorkspacePath();
  }

  /**
   * Initialize application - called once during startup
   */
  async init(): Promise<void> {
    // Set up handler context
    const ctx: HandlerContext = {
      mainWindow: null,
      workspacesDir: this.workspacesDir,
      getCurrentWorkspacePath: () => this.currentWorkspacePath,
      setCurrentWorkspacePath: (p) => {
        this.currentWorkspacePath = p;
        if (p) storeService.setLastWorkspacePath(p);
      },
    };
    setHandlerContext(ctx);

    // Register all IPC handlers
    registerAllHandlers();
    setupVerificationIpcHandlers();
    registerCodingAgentHandlers();

    await mcpService.start();
    await indexService.init();
  }

  /**
   * Create the main browser window
   */
  async createWindow(): Promise<void> {
    if (isDebug) {
      await this.installExtensions();
    }

    const RESOURCES_PATH = app.isPackaged
      ? path.join(process.resourcesPath, 'assets')
      : path.join(__dirname, '../../assets');

    this.mainWindow = new BrowserWindow({
      show: true,
      width: 1280,
      height: 800,
      minWidth: 1024,
      minHeight: 700,
      useContentSize: true,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 12 },
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: false,
      },
    });

    // Update handler context with window reference
    setHandlerContext({
      mainWindow: this.mainWindow,
      workspacesDir: this.workspacesDir,
      getCurrentWorkspacePath: () => this.currentWorkspacePath,
      setCurrentWorkspacePath: (p) => {
        this.currentWorkspacePath = p;
        if (p) storeService.setLastWorkspacePath(p);
      },
    });

    // Set up progress queue
    progressQueue.setMainWindow(this.mainWindow);

    this.mainWindow.loadURL(resolveHtmlPath('index.html'));

    this.mainWindow.on('ready-to-show', () => {
      if (!this.mainWindow) {
        throw new Error('"mainWindow" is not defined');
      }

      if (process.env.START_MINIMIZED) {
        this.mainWindow.minimize();
      } else {
        this.mainWindow.show();
      }

      // Set up OCR provider IPC handlers
      setupOcrIpcHandlers(this.mainWindow);

      // Track app launch after window is ready
      setTimeout(() => {
        sendTelemetryEvent('app_launched', {
          version: app.getVersion(),
          platform: process.platform,
          arch: process.arch,
        });
      }, 1000);
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      progressQueue.reset();
    });

    // Build menu
    const menuBuilder = new MenuBuilder(this.mainWindow);
    menuBuilder.buildMenu();

    // Open URLs in user's browser
    this.mainWindow.webContents.setWindowOpenHandler((edata) => {
      shell.openExternal(edata.url);
      return { action: 'deny' };
    });

    // Set up auto-updater
    this.setupAutoUpdater();
  }

  /**
   * Clean up resources before quit
   */
  async cleanup(): Promise<void> {
    cleanupVerificationIpcHandlers();
    cleanupOcrIpcHandlers();
    pdfWorkerService.dispose();
    await mcpService.stop();
    await indexService.dispose();
  }

  /**
   * Get the main window instance
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  private async installExtensions(): Promise<void> {
    const installer = require('electron-devtools-installer');
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;

    try {
      const react = await installer.default(installer.REACT_DEVELOPER_TOOLS, {
        forceDownload,
      });
      console.error('React DevTools installed:', react.name);
    } catch (err) {
      console.error('React DevTools error:', err);
    }

    try {
      const redux = await installer.default(installer.REDUX_DEVTOOLS, {
        forceDownload,
      });
      console.error('Redux DevTools installed:', redux.name);
    } catch (err) {
      console.error('Redux DevTools error:', err);
    }
  }

  private setupAutoUpdater(): void {
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

    autoUpdater.checkForUpdates().catch((err) => {
      log.error('Update check failed:', err.message);
    });
  }
}
