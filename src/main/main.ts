/* eslint global-require: off, no-console: off, promise/always-return: off */
/**
 * Main Entry Point
 *
 * Slim entry point that handles:
 * - Native module polyfills
 * - Sentry initialization
 * - Application bootstrap
 *
 * All IPC handlers and services are registered via the Application class.
 */

import { app } from 'electron';
import fixPath from 'fix-path';
import fs from 'fs';
import path from 'path';
import Module from 'module';
import * as Sentry from '@sentry/electron/main';
import {
  SENTRY_DSN,
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
} from '../config/sentry';
import { Application } from './app';

// Fix PATH for GUI apps on macOS
fixPath();

// ============================================
// Native Module Setup (must happen early)
// ============================================

// Fix module resolution in packaged app
if (app.isPackaged) {
  const resourcesPath = process.resourcesPath;

  const appAsarModules = path.join(resourcesPath, 'app.asar', 'node_modules');
  const appAsarUnpackedModules = path.join(
    resourcesPath,
    'app.asar.unpacked',
    'node_modules',
  );
  const existingNodePath = process.env.NODE_PATH
    ? process.env.NODE_PATH.split(path.delimiter)
    : [];
  const nextNodePath = [
    appAsarModules,
    appAsarUnpackedModules,
    ...existingNodePath,
  ].filter((modulePath) => fs.existsSync(modulePath));
  process.env.NODE_PATH = nextNodePath.join(path.delimiter);
  Module._initPaths();
}

// ============================================
// Sentry Initialization
// ============================================

if (SENTRY_ENABLED) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    tracesSampleRate: 0,
  });
  Sentry.setTag('process', 'main');
}

// ============================================
// Source Map Support (production)
// ============================================

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

// ============================================
// Debug Mode
// ============================================

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

// ============================================
// Application Bootstrap
// ============================================

const WORKSPACES_DIR = path.join(app.getPath('home'), '.okrapdf', 'workspaces');
if (!fs.existsSync(WORKSPACES_DIR)) {
  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
}

const application = new Application(WORKSPACES_DIR);

// App lifecycle events
app.on('window-all-closed', () => {
  application.cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await application.cleanup();
});

app
  .whenReady()
  .then(async () => {
    console.error('App ready, initializing...');

    await application.init();
    await application.createWindow();

    app.on('activate', () => {
      if (application.getMainWindow() === null) {
        application.createWindow();
      }
    });
  })
  .catch(console.error);
