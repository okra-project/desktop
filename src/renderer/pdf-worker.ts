import type {
  PDFDocumentProxy,
  TextContent,
  TextItem,
} from 'pdfjs-dist/types/src/display/api';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

type RenderPagePayload = {
  pdfPath: string;
  pageNum: number;
  scale: number;
};

type ExtractTextPayload = {
  pdfPath: string;
  pageNum: number;
};

type PageCountPayload = {
  pdfPath: string;
};

type PdfWorkerRequest =
  | { id: string; type: 'render-page'; payload: RenderPagePayload }
  | { id: string; type: 'extract-text'; payload: ExtractTextPayload }
  | { id: string; type: 'get-page-count'; payload: PageCountPayload };

type PdfWorkerResponse = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

const MAX_CACHE_ENTRIES = 2;
const pdfCache = new Map<string, { doc: PDFDocumentProxy; lastUsed: number }>();

const workerSrc =
  process.env.NODE_ENV === 'development'
    ? '/pdf.worker.min.mjs'
    : new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

GlobalWorkerOptions.workerSrc = workerSrc;

function normalizePdfUrl(pdfPath: string): string {
  if (pdfPath.startsWith('file://')) {
    return pdfPath;
  }

  const normalizedPath = pdfPath.replace(/\\/g, '/');

  if (/^\/\/.+/.test(normalizedPath)) {
    return `file:${normalizedPath}`;
  }
  if (/^[a-zA-Z]:\//.test(normalizedPath)) {
    return `file:///${normalizedPath}`;
  }
  if (normalizedPath.startsWith('/')) {
    return `file://${normalizedPath}`;
  }

  return `file:///${normalizedPath}`;
}

function fileUrlToPath(url: string): string {
  const urlObj = new URL(url);
  let filePath = decodeURIComponent(urlObj.pathname);
  const platform = (window as any).process?.platform;
  if (platform === 'win32' && filePath.startsWith('/')) {
    filePath = filePath.slice(1);
  }
  return filePath;
}

async function loadPdfData(pdfPath: string): Promise<Uint8Array> {
  const url = normalizePdfUrl(pdfPath);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeRequire = (window as any).require;
  const fs = nodeRequire?.('fs');

  if (fs && url.startsWith('file://')) {
    const filePath = fileUrlToPath(url);
    const buffer: Uint8Array = fs.readFileSync(filePath);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load PDF (${response.status}): ${response.statusText}`,
    );
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

function evictIfNeeded(): void {
  if (pdfCache.size <= MAX_CACHE_ENTRIES) {
    return;
  }
  const oldest = [...pdfCache.entries()].sort(
    (a, b) => a[1].lastUsed - b[1].lastUsed,
  )[0];
  if (!oldest) {
    return;
  }
  pdfCache.delete(oldest[0]);
  void oldest[1].doc.destroy();
}

async function getPdfDocument(pdfPath: string) {
  const cached = pdfCache.get(pdfPath);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.doc;
  }

  const data = await loadPdfData(pdfPath);
  const doc = await getDocument({
    data,
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  pdfCache.set(pdfPath, { doc, lastUsed: Date.now() });
  evictIfNeeded();
  return doc;
}

function extractPageText(textContent: TextContent): string {
  const lines: string[] = [];
  let currentLine = '';
  let lastY: number | null = null;

  for (const item of textContent.items) {
    if (!('str' in item)) continue;
    const textItem = item as TextItem;
    const y = textItem.transform[5];

    if (lastY !== null && Math.abs(y - lastY) > 5) {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = textItem.str;
    } else {
      currentLine += textItem.str;
    }
    lastY = y;
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines.join('\n');
}

async function renderPage(payload: RenderPagePayload) {
  const { pdfPath, pageNum, scale } = payload;
  const doc = await getPdfDocument(pdfPath);
  const page = await doc.getPage(pageNum);
  try {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context unavailable');
    }

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    return {
      base64: dataUrl.replace(/^data:image\/png;base64,/, ''),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    page.cleanup();
  }
}

async function getPageCount(payload: PageCountPayload) {
  const doc = await getPdfDocument(payload.pdfPath);
  return doc.numPages;
}

async function extractText(payload: ExtractTextPayload) {
  const doc = await getPdfDocument(payload.pdfPath);
  const page = await doc.getPage(payload.pageNum);
  try {
    const textContent = (await page.getTextContent()) as TextContent;
    return extractPageText(textContent);
  } finally {
    page.cleanup();
  }
}

// Use direct Electron IPC in the worker window to avoid preload/sandbox issues.
const ipcRenderer =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).require?.('electron')?.ipcRenderer ??
  window.electron?.ipcRenderer;
if (!ipcRenderer) {
  throw new Error('Electron IPC bridge is unavailable in pdf-worker.');
}

const send = typeof ipcRenderer.sendMessage === 'function'
  ? ipcRenderer.sendMessage.bind(ipcRenderer)
  : ipcRenderer.send.bind(ipcRenderer);

ipcRenderer.on('pdf-worker:request', async (eventOrRequest: unknown, maybeRequest?: PdfWorkerRequest) => {
  const request =
    (maybeRequest ?? eventOrRequest) as PdfWorkerRequest;
  const response: PdfWorkerResponse = { id: request.id, ok: true };
  try {
    if (request.type === 'render-page') {
      response.result = await renderPage(request.payload);
    } else if (request.type === 'get-page-count') {
      response.result = await getPageCount(request.payload);
    } else if (request.type === 'extract-text') {
      response.result = await extractText(request.payload);
    } else {
      throw new Error(`Unknown request type: ${request.type}`);
    }
  } catch (error) {
    response.ok = false;
    response.error = error instanceof Error ? error.message : String(error);
  }

  send('pdf-worker:response', response);
});

send('pdf-worker:ready');
