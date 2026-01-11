import * as fs from 'fs';
import * as path from 'path';
import type {
  LocalVerificationState,
  LocalPageState,
  LocalTableState,
  LocalEntityInfo,
} from '../shared/types/byok';

const STATE_FILE = 'verification-state.json';

function getStatePath(workspacePath: string): string {
  return path.join(workspacePath, STATE_FILE);
}

export function initializeState(
  workspacePath: string,
  documentName: string,
  totalPages: number
): LocalVerificationState {
  const state: LocalVerificationState = {
    version: 1,
    jobId: `local-${path.basename(workspacePath)}`,
    documentName,
    totalPages,
    pages: {},
    tables: {},
    lastModified: new Date().toISOString(),
  };

  for (let page = 1; page <= totalPages; page++) {
    state.pages[page] = {
      page,
      status: 'pending',
      hasOcr: false,
      ocrLineCount: 0,
      entities: [],
      lastModified: new Date().toISOString(),
    };
  }

  saveState(workspacePath, state);
  return state;
}

export function loadState(workspacePath: string): LocalVerificationState | null {
  const statePath = getStatePath(workspacePath);
  if (!fs.existsSync(statePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
}

export function saveState(workspacePath: string, state: LocalVerificationState): void {
  state.lastModified = new Date().toISOString();
  const statePath = getStatePath(workspacePath);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function getPageState(workspacePath: string, pageNum: number): LocalPageState | null {
  const state = loadState(workspacePath);
  return state?.pages[pageNum] || null;
}

export function updatePageState(
  workspacePath: string,
  pageNum: number,
  updates: Partial<LocalPageState>
): LocalPageState | null {
  const state = loadState(workspacePath);
  if (!state || !state.pages[pageNum]) return null;

  state.pages[pageNum] = {
    ...state.pages[pageNum],
    ...updates,
    lastModified: new Date().toISOString(),
  };

  saveState(workspacePath, state);
  return state.pages[pageNum];
}

export function setPageOcrInfo(
  workspacePath: string,
  pageNum: number,
  hasOcr: boolean,
  ocrLineCount: number
): void {
  updatePageState(workspacePath, pageNum, { hasOcr, ocrLineCount });
}

export function setPageEntities(
  workspacePath: string,
  pageNum: number,
  entities: LocalEntityInfo[]
): void {
  updatePageState(workspacePath, pageNum, { entities });
}

export function resolvePageStatus(
  workspacePath: string,
  pageNum: number,
  status: 'pending' | 'verified' | 'flagged' | 'rejected',
  resolution?: string,
  classification?: string
): void {
  updatePageState(workspacePath, pageNum, { status, resolution, classification });
}

export function getTableState(workspacePath: string, tableId: string): LocalTableState | null {
  const state = loadState(workspacePath);
  return state?.tables[tableId] || null;
}

export function setTableState(workspacePath: string, table: LocalTableState): void {
  const state = loadState(workspacePath);
  if (!state) return;

  state.tables[table.id] = {
    ...table,
    lastModified: new Date().toISOString(),
  };

  saveState(workspacePath, state);
}

export function updateTableStatus(
  workspacePath: string,
  tableId: string,
  status: 'pending' | 'verified' | 'flagged' | 'rejected'
): void {
  const state = loadState(workspacePath);
  if (!state || !state.tables[tableId]) return;

  state.tables[tableId].status = status;
  state.tables[tableId].lastModified = new Date().toISOString();

  saveState(workspacePath, state);
}

export function updateTableMarkdown(
  workspacePath: string,
  tableId: string,
  markdown: string,
  source: 'user_edit' | 'ai_correction' = 'user_edit'
): void {
  const state = loadState(workspacePath);
  if (!state || !state.tables[tableId]) return;

  const table = state.tables[tableId];
  table.versions.push({
    id: `v${table.versions.length + 1}`,
    markdown,
    source,
    createdAt: new Date().toISOString(),
  });
  table.markdown = markdown;
  table.lastModified = new Date().toISOString();

  saveState(workspacePath, state);
}

export function getVerificationSummary(workspacePath: string): {
  totalPages: number;
  verified: number;
  pending: number;
  flagged: number;
  rejected: number;
  tablesCount: number;
  tablesVerified: number;
} {
  const state = loadState(workspacePath);
  if (!state) {
    return { totalPages: 0, verified: 0, pending: 0, flagged: 0, rejected: 0, tablesCount: 0, tablesVerified: 0 };
  }

  const pages = Object.values(state.pages);
  const tables = Object.values(state.tables);

  return {
    totalPages: state.totalPages,
    verified: pages.filter((p) => p.status === 'verified').length,
    pending: pages.filter((p) => p.status === 'pending').length,
    flagged: pages.filter((p) => p.status === 'flagged').length,
    rejected: pages.filter((p) => p.status === 'rejected').length,
    tablesCount: tables.length,
    tablesVerified: tables.filter((t) => t.status === 'verified').length,
  };
}

export function syncTablesFromManifest(workspacePath: string): void {
  const manifestPath = path.join(workspacePath, 'tables', 'manifest.json');
  if (!fs.existsSync(manifestPath)) return;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const state = loadState(workspacePath);
  if (!state) return;

  for (const table of manifest.tables || []) {
    if (!state.tables[table.id]) {
      state.tables[table.id] = {
        id: table.id,
        page: table.page,
        status: 'pending',
        markdown: table.markdown,
        bbox: table.bbox,
        confidence: table.confidence,
        versions: [
          {
            id: 'v1',
            markdown: table.markdown,
            source: 'extraction',
            createdAt: new Date().toISOString(),
          },
        ],
        lastModified: new Date().toISOString(),
      };
    }
  }

  saveState(workspacePath, state);
}
