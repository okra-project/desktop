import { createContext, useContext } from 'react';
import type { ExtractionProgressEvent } from '../../shared/types/byok';

export type ExtractionStatus = 'idle' | 'extracting' | 'completed' | 'failed';

export interface PageContent {
  page: number;
  content: string;
  blocks?: Array<{ text: string; bbox?: { x: number; y: number; width: number; height: number } }>;
}

export interface ExtractedTable {
  id: string;
  page: number;
  markdown: string;
  bbox?: { xmin: number; ymin: number; xmax: number; ymax: number };
  confidence?: number;
  status: 'pending' | 'verified' | 'flagged' | 'rejected';
}

export interface ExtractionContextValue {
  mode: 'local' | 'remote';
  status: ExtractionStatus;
  progress: ExtractionProgressEvent | null;
  totalPages: number;

  startExtraction: () => Promise<void>;
  cancelExtraction: () => void;

  getPageContent: (page: number) => Promise<PageContent | null>;
  getPageContents: (pages: number[]) => Promise<PageContent[]>;
  savePageContent: (page: number, content: string) => Promise<void>;

  getTables: () => Promise<ExtractedTable[]>;
  getTablesByPage: (page: number) => Promise<ExtractedTable[]>;
  updateTableStatus: (tableId: string, status: 'pending' | 'verified' | 'flagged' | 'rejected') => Promise<void>;
  updateTableMarkdown: (tableId: string, markdown: string) => Promise<void>;

  onProgress: (callback: (event: ExtractionProgressEvent) => void) => () => void;
}

export const ExtractionContext = createContext<ExtractionContextValue | null>(null);

export function useExtraction(): ExtractionContextValue {
  const context = useContext(ExtractionContext);
  if (!context) {
    throw new Error('useExtraction must be used within an ExtractionProvider');
  }
  return context;
}
