import { ipcMain } from 'electron';
import { indexService } from '../services/index.service';
import type { SearchOptions, EntityType } from '../../shared/types/index';

export function registerIndexHandlers(): void {
  ipcMain.handle(
    'index:search',
    async (_, query: string, options?: Partial<SearchOptions>) => {
      return indexService.search({ query, ...options });
    },
  );

  ipcMain.handle(
    'index:get-page-bboxes',
    async (_, documentId: string, pageNumber: number) => {
      return indexService.getPageBboxes(documentId, pageNumber);
    },
  );

  ipcMain.handle(
    'index:find-bbox-at-point',
    async (_, documentId: string, pageNumber: number, x: number, y: number) => {
      return indexService.findBboxAtPoint(documentId, pageNumber, x, y);
    },
  );

  ipcMain.handle('index:get-stats', async () => {
    return indexService.getStats();
  });

  ipcMain.handle('index:get-document-stats', async (_, documentId: string) => {
    return indexService.getDocumentStats(documentId);
  });

  ipcMain.handle('index:reindex', async (_, documentId?: string) => {
    if (documentId) {
      await indexService.reindexDocument(documentId);
    } else {
      await indexService.reindexAll();
    }
  });

  console.log('[IndexHandlers] Registered');
}
