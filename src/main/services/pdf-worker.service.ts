import { randomUUID } from 'crypto';
import { app, BrowserWindow, ipcMain, type IpcMainEvent } from 'electron';
import { resolveHtmlPath } from '../util';

type PdfWorkerRequest = {
  id: string;
  type: 'render-page' | 'extract-text' | 'get-page-count';
  payload: unknown;
};

type PdfWorkerResponse = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
};

class PdfWorkerService {
  private window: BrowserWindow | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyResolver: (() => void) | null = null;
  private readyRejecter: ((error: Error) => void) | null = null;
  private pending = new Map<string, PendingRequest>();
  private handlersBound = false;

  constructor() {
    this.bindIpcHandlers();
  }

  async renderPage(
    pdfPath: string,
    pageNum: number,
    scale = 2.0,
  ): Promise<{ base64: string; width: number; height: number }> {
    const result = await this.request('render-page', {
      pdfPath,
      pageNum,
      scale,
    });
    return result as { base64: string; width: number; height: number };
  }

  async extractText(
    pdfPath: string,
    pageNum: number,
  ): Promise<string> {
    const result = await this.request('extract-text', { pdfPath, pageNum });
    return result as string;
  }

  async getPageCount(pdfPath: string): Promise<number> {
    const result = await this.request('get-page-count', { pdfPath });
    return result as number;
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
    this.readyPromise = null;
    this.readyResolver = null;
    this.readyRejecter = null;
    this.rejectAll(new Error('PDF worker disposed'));
  }

  private bindIpcHandlers(): void {
    if (this.handlersBound) {
      return;
    }
    ipcMain.on('pdf-worker:response', this.handleResponse);
    ipcMain.on('pdf-worker:ready', this.handleReady);
    this.handlersBound = true;
  }

  private handleResponse = (event: IpcMainEvent, response: PdfWorkerResponse) => {
    if (!this.window || event.sender.id !== this.window.webContents.id) {
      return;
    }
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeoutId);
    this.pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
      return;
    }
    pending.reject(new Error(response.error || 'PDF worker error'));
  };

  private handleReady = (event: IpcMainEvent) => {
    if (!this.window || event.sender.id !== this.window.webContents.id) {
      return;
    }
    if (this.readyResolver) {
      this.readyResolver();
    }
    this.readyResolver = null;
    this.readyRejecter = null;
  };

  private async ensureReady(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }
    await app.whenReady();

    this.window = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        sandbox: false,
        webSecurity: false,
        backgroundThrottling: false,
      },
    });

    this.window.webContents.on(
      'console-message',
      (_event, _level, message, line, sourceId) => {
        console.warn(`[pdf-worker] ${message} (${sourceId}:${line})`);
      },
    );

    this.window.webContents.on('render-process-gone', (_event, details) => {
      console.error(
        `[pdf-worker] Render process gone: ${details.reason} (${details.exitCode})`,
      );
    });

    this.window.on('closed', () => {
      this.window = null;
      this.readyPromise = null;
      this.rejectAll(new Error('PDF worker window closed'));
    });

    this.window.webContents.on(
      'did-fail-load',
      (_event, code, description) => {
        if (this.readyRejecter) {
          this.readyRejecter(
            new Error(`PDF worker failed to load (${code}): ${description}`),
          );
        }
        this.readyPromise = null;
      },
    );

    this.readyPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('PDF worker timed out during startup'));
      }, 15000);

      this.readyResolver = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      this.readyRejecter = (error) => {
        clearTimeout(timeoutId);
        reject(error);
      };
    });

    await this.window.loadURL(resolveHtmlPath('pdf-worker.html'));
    return this.readyPromise;
  }

  private async request(
    type: PdfWorkerRequest['type'],
    payload: PdfWorkerRequest['payload'],
    timeoutMs = 120000,
  ): Promise<unknown> {
    await this.ensureReady();
    if (!this.window || this.window.isDestroyed()) {
      throw new Error('PDF worker window is unavailable');
    }

    const id = randomUUID();
    const message: PdfWorkerRequest = { id, type, payload };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`PDF worker request timed out (${type})`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeoutId });
      this.window?.webContents.send('pdf-worker:request', message);
    });
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export const pdfWorkerService = new PdfWorkerService();
