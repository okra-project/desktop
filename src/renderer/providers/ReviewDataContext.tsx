import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type {
  VerificationTreeResponse,
  VerificationTreePage,
  EntitiesResponse,
  TablesResponse,
  PageContent,
  ExtractedTable,
} from '../store/desktopApi';

export interface ReviewDataContextValue {
  mode: 'local' | 'remote';

  treeData: VerificationTreeResponse | null;
  treeLoading: boolean;
  refetchTree: () => void;

  entitiesData: EntitiesResponse | null;
  entitiesLoading: boolean;

  tablesData: TablesResponse | null;
  refetchTables: () => void;

  pageContent: PageContent | null;
  contentLoading: boolean;
  currentPage: number;
  setCurrentPage: (page: number) => void;

  savePageVersion: (content: string) => Promise<void>;
  isSaving: boolean;

  updateTableStatus: (tableId: string, status: 'pending' | 'verified' | 'flagged' | 'rejected') => Promise<void>;
  isUpdatingTable: boolean;

  fixAndAcceptTable: (tableId: string, correctedMarkdown: string) => Promise<void>;

  historyData: { history: VerificationHistoryEntry[] } | null;
  historyLoading: boolean;
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
}

export interface VerificationHistoryEntry {
  id: string;
  entityType: string;
  entityId: string;
  state: string;
  previousState: string | null;
  transitionName: string | null;
  triggeredBy: string | null;
  triggeredByName: string | null;
  triggeredByImage: string | null;
  pageNumber: number | null;
  notes: string | null;
  createdAt: string;
}

export const ReviewDataContext = createContext<ReviewDataContextValue | null>(null);

export function useReviewData(): ReviewDataContextValue {
  const context = useContext(ReviewDataContext);
  if (!context) {
    throw new Error('useReviewData must be used within a ReviewDataProvider');
  }
  return context;
}

interface LocalReviewDataProviderProps {
  jobId: string;
  workspacePath: string;
  children: ReactNode;
}

export function LocalReviewDataProvider({ jobId, workspacePath, children }: LocalReviewDataProviderProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageContent, setPageContent] = useState<PageContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const loadPageCount = async () => {
      try {
        const count = await window.electron.ipcRenderer.invoke('extraction:get-page-count', workspacePath);
        setTotalPages(count);
      } catch {
        setTotalPages(0);
      }
    };
    loadPageCount();
  }, [workspacePath]);

  useEffect(() => {
    const loadContent = async () => {
      if (!currentPage) return;
      setContentLoading(true);
      try {
        const content = await window.electron.ipcRenderer.invoke('extraction:get-page-content', workspacePath, currentPage);
        setPageContent(content);
      } catch {
        setPageContent(null);
      } finally {
        setContentLoading(false);
      }
    };
    loadContent();
  }, [currentPage, workspacePath]);

  const treeData: VerificationTreeResponse | null = totalPages > 0 ? {
    jobId,
    documentId: jobId,
    totalPages,
    summary: { complete: 0, partial: 0, flagged: 0, pending: totalPages, empty: 0, gap: 0 },
    pages: Array.from({ length: totalPages }, (_, i): VerificationTreePage => ({
      page: i + 1,
      status: 'pending',
      total: 0,
      verified: 0,
      pending: 0,
      flagged: 0,
      rejected: 0,
      avgConfidence: 0,
      hasOcr: true,
      ocrLineCount: 0,
      hasCoverageGaps: false,
      uncoveredCount: 0,
      resolution: null,
      classification: null,
      isStale: false,
    })),
  } : null;

  const entitiesData: EntitiesResponse = {
    jobId,
    entities: [],
    counts: { tables: 0, figures: 0, footnotes: 0, summaries: 0 },
  };

  const tablesData: TablesResponse = { tables: [], source: 'job_id' };

  const savePageVersion = useCallback(async (content: string) => {
    setIsSaving(true);
    try {
      await window.electron.ipcRenderer.invoke('extraction:save-page-content', workspacePath, currentPage, content);
      setPageContent((prev) => prev ? { ...prev, content } : null);
    } finally {
      setIsSaving(false);
    }
  }, [workspacePath, currentPage]);

  const updateTableStatus = useCallback(async (_tableId: string, _status: string) => {}, []);

  const fixAndAcceptTable = useCallback(async (_tableId: string, _markdown: string) => {}, []);

  const value: ReviewDataContextValue = {
    mode: 'local',
    treeData,
    treeLoading: false,
    refetchTree: () => {},
    entitiesData,
    entitiesLoading: false,
    tablesData,
    refetchTables: () => {},
    pageContent,
    contentLoading,
    currentPage,
    setCurrentPage,
    savePageVersion,
    isSaving,
    updateTableStatus,
    isUpdatingTable: false,
    fixAndAcceptTable,
    historyData: null,
    historyLoading: false,
    historyOpen,
    setHistoryOpen,
  };

  return <ReviewDataContext.Provider value={value}>{children}</ReviewDataContext.Provider>;
}
