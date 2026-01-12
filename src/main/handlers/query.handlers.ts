import { ipcMain } from 'electron';
import {
  parseQuery,
  parseDisplayMode,
  queryEngine,
  setCurrentWorkspace,
} from '../query';
import type { QueryAST, DisplayMode } from '../../shared/types/query';

export function registerQueryHandlers(): void {
  ipcMain.handle('query:execute', async (_, input: string | QueryAST) => {
    const ast = typeof input === 'string' ? parseQuery(input) : input;
    return queryEngine.execute(ast);
  });

  ipcMain.handle('query:parse', async (_, input: string) => {
    return parseQuery(input);
  });

  ipcMain.handle(
    'query:set-current-workspace',
    async (_, workspaceId: string | null) => {
      setCurrentWorkspace(workspaceId);
    },
  );

  ipcMain.handle(
    'query:parse-display-mode',
    async (_, mode: string): Promise<DisplayMode> => {
      return parseDisplayMode(mode);
    },
  );

  console.log('[QueryHandlers] Registered');
}
