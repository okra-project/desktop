/**
 * Progress Event Queue - Buffers events until renderer is ready
 *
 * Prevents race conditions when main process emits events before
 * the renderer has set up its listeners.
 */

import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';

interface QueuedEvent {
  channel: string;
  data: unknown;
}

class ProgressQueue {
  private ready = false;
  private pendingEvents: QueuedEvent[] = [];
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    // Register the ready handler
    ipcMain.handle('progress:renderer-ready', () => {
      console.error('[progress] Renderer signaled ready');
      this.ready = true;
      this.flush();
      return { success: true };
    });
  }

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
    if (!window) {
      this.ready = false;
      this.pendingEvents = [];
    }
  }

  send(channel: string, data: unknown): void {
    if (this.ready && this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    } else {
      this.pendingEvents.push({ channel, data });
      console.error(`[progress] Queued event on ${channel} (renderer not ready)`);
    }
  }

  private flush(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    console.error(`[progress] Flushing ${this.pendingEvents.length} queued events`);
    while (this.pendingEvents.length > 0) {
      const event = this.pendingEvents.shift()!;
      this.mainWindow.webContents.send(event.channel, event.data);
    }
  }

  reset(): void {
    this.ready = false;
    this.pendingEvents = [];
  }
}

// Singleton
export const progressQueue = new ProgressQueue();
