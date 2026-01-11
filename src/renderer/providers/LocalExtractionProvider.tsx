import { useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import {
  ExtractionContext,
  ExtractionStatus,
  ExtractionContextValue,
  PageContent,
  ExtractedTable,
} from './ExtractionContext';
import type { ExtractionProgressEvent } from '../../shared/types/byok';

interface LocalExtractionProviderProps {
  workspaceId: string;
  workspacePath: string;
  children: ReactNode;
}

export function LocalExtractionProvider({
  workspaceId,
  workspacePath,
  children,
}: LocalExtractionProviderProps) {
  const [status, setStatus] = useState<ExtractionStatus>('idle');
  const [progress, setProgress] = useState<ExtractionProgressEvent | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const progressCallbacks = useRef<Set<(event: ExtractionProgressEvent) => void>>(new Set());

  useEffect(() => {
    const checkAndStartExtraction = async () => {
      try {
        const count = await window.electron.ipcRenderer.invoke('extraction:get-page-count', workspacePath);
        setTotalPages(count);

        if (count === 0) {
          setStatus('idle');
          return;
        }

        const page1Content = await window.electron.ipcRenderer.invoke('extraction:get-page-content', workspacePath, 1);
        
        if (page1Content) {
          setStatus('completed');
        } else {
          setStatus('extracting');
          setProgress({ phase: 'text', currentPage: 0, totalPages: count, status: 'processing' });
          await window.electron.ipcRenderer.invoke('extraction:start-text', workspaceId);
        }
      } catch {
        setTotalPages(0);
      }
    };
    checkAndStartExtraction();
  }, [workspacePath, workspaceId]);

  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on('extraction:progress', (event: unknown) => {
      const progressEvent = event as ExtractionProgressEvent & { workspaceId: string };
      if (progressEvent.workspaceId !== workspaceId) return;

      setProgress(progressEvent);
      setTotalPages(progressEvent.totalPages);

      if (progressEvent.status === 'completed') {
        setStatus('completed');
      } else if (progressEvent.status === 'failed') {
        setStatus('failed');
      } else {
        setStatus('extracting');
      }

      progressCallbacks.current.forEach((cb) => cb(progressEvent));
    });

    return () => {
      unsubscribe();
    };
  }, [workspaceId]);

  const startExtraction = useCallback(async () => {
    setStatus('extracting');
    setProgress({ phase: 'text', currentPage: 0, totalPages: 0, status: 'processing' });
    await window.electron.ipcRenderer.invoke('extraction:start-text', workspaceId);
  }, [workspaceId]);

  const cancelExtraction = useCallback(() => {
    window.electron.ipcRenderer.invoke('extraction:cancel');
    setStatus('idle');
  }, []);

  const getPageContent = useCallback(async (page: number): Promise<PageContent | null> => {
    return window.electron.ipcRenderer.invoke('extraction:get-page-content', workspacePath, page);
  }, [workspacePath]);

  const getPageContents = useCallback(async (pages: number[]): Promise<PageContent[]> => {
    const results = await Promise.all(
      pages.map((page) => window.electron.ipcRenderer.invoke('extraction:get-page-content', workspacePath, page))
    );
    return results.filter((r): r is PageContent => r !== null);
  }, [workspacePath]);

  const savePageContent = useCallback(async (page: number, content: string) => {
    await window.electron.ipcRenderer.invoke('extraction:save-page-content', workspacePath, page, content);
  }, [workspacePath]);

  const getTables = useCallback(async (): Promise<ExtractedTable[]> => {
    return [];
  }, []);

  const getTablesByPage = useCallback(async (_page: number): Promise<ExtractedTable[]> => {
    return [];
  }, []);

  const updateTableStatus = useCallback(async (_tableId: string, _status: 'pending' | 'verified' | 'flagged' | 'rejected') => {
  }, []);

  const updateTableMarkdown = useCallback(async (_tableId: string, _markdown: string) => {
  }, []);

  const onProgress = useCallback((callback: (event: ExtractionProgressEvent) => void) => {
    progressCallbacks.current.add(callback);
    return () => {
      progressCallbacks.current.delete(callback);
    };
  }, []);

  const value: ExtractionContextValue = {
    mode: 'local',
    status,
    progress,
    totalPages,
    startExtraction,
    cancelExtraction,
    getPageContent,
    getPageContents,
    savePageContent,
    getTables,
    getTablesByPage,
    updateTableStatus,
    updateTableMarkdown,
    onProgress,
  };

  return (
    <ExtractionContext.Provider value={value}>
      {children}
    </ExtractionContext.Provider>
  );
}
