/**
 * OCR Providers Module
 *
 * Exports OCR provider types and IPC handlers.
 */

export * from './ocr-types';
export {
  setupOcrIpcHandlers,
  cleanupOcrIpcHandlers,
  renderPageToBuffer,
  renderPageFromFile,
  extractWithProvider,
  ensureDomMatrix,
} from './ocr-handlers';
