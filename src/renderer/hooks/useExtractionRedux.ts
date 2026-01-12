import { useEffect, useCallback, useRef } from 'react';
import { useAppDispatch, useAppSelector, electronExtractionAdapter } from '../store';
import {
  setExtractionAdapter,
  getExtractionAdapter,
  initializeWorkspace,
  startExtraction as startExtractionThunk,
  cancelExtraction as cancelExtractionThunk,
  setProgress,
  selectExtractionStatus,
  selectExtractionProgress,
  selectTotalPages,
  selectWorkspaceId,
  selectWorkspacePath,
  type ExtractionProgressEvent,
  type PageContent,
} from '@okrapdf/redux';

setExtractionAdapter(electronExtractionAdapter);

export function useExtractionInit(workspaceId: string, workspacePath: string) {
  const dispatch = useAppDispatch();
  const currentWorkspaceId = useAppSelector(selectWorkspaceId);

  useEffect(() => {
    if (currentWorkspaceId !== workspaceId) {
      dispatch(initializeWorkspace({ workspaceId, workspacePath }));
    }
  }, [dispatch, workspaceId, workspacePath, currentWorkspaceId]);

  useEffect(() => {
    const adapter = getExtractionAdapter();
    const unsubscribe = adapter.subscribeToProgress(workspaceId, (event) => {
      dispatch(setProgress(event));
    });

    return () => {
      unsubscribe();
    };
  }, [dispatch, workspaceId]);
}

export function useExtraction() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectExtractionStatus);
  const progress = useAppSelector(selectExtractionProgress);
  const totalPages = useAppSelector(selectTotalPages);
  const workspacePath = useAppSelector(selectWorkspacePath);

  const startExtraction = useCallback(async () => {
    await dispatch(startExtractionThunk());
  }, [dispatch]);

  const cancelExtraction = useCallback(() => {
    dispatch(cancelExtractionThunk());
  }, [dispatch]);

  const getPageContent = useCallback(async (page: number): Promise<PageContent | null> => {
    if (!workspacePath) return null;
    const adapter = getExtractionAdapter();
    return adapter.getPageContent(workspacePath, page);
  }, [workspacePath]);

  const getPageContents = useCallback(async (pages: number[]): Promise<PageContent[]> => {
    if (!workspacePath) return [];
    const adapter = getExtractionAdapter();
    return adapter.getPageContents(workspacePath, pages);
  }, [workspacePath]);

  const savePageContent = useCallback(async (page: number, content: string): Promise<void> => {
    if (!workspacePath) return;
    const adapter = getExtractionAdapter();
    await adapter.savePageContent(workspacePath, page, content);
  }, [workspacePath]);

  const progressCallbacks = useRef<Set<(event: ExtractionProgressEvent) => void>>(new Set());

  const onProgress = useCallback((callback: (event: ExtractionProgressEvent) => void) => {
    progressCallbacks.current.add(callback);
    return () => {
      progressCallbacks.current.delete(callback);
    };
  }, []);

  useEffect(() => {
    if (progress) {
      progressCallbacks.current.forEach((cb) => cb(progress));
    }
  }, [progress]);

  return {
    mode: 'local' as const,
    status,
    progress,
    totalPages,
    startExtraction,
    cancelExtraction,
    getPageContent,
    getPageContents,
    savePageContent,
    getTables: async () => [],
    getTablesByPage: async () => [],
    updateTableStatus: async () => {},
    updateTableMarkdown: async () => {},
    onProgress,
  };
}
