import { useEffect } from 'react';
import { useAppDispatch } from '../store';
import {
  startExtraction,
  pageCompleted,
  extractionCompleted,
  extractionError,
  resetForNewDocument,
} from '../store/processingEventsSlice';

interface OcrProgress {
  providerId: string;
  phase: 'processing' | 'completed' | 'failed';
  currentPage?: number;
  totalPages?: number;
  message?: string;
  error?: string;
}

interface ActiveRunState {
  runId: string;
  nodeId: string;
  nodeType: string;
  workspacePath: string;
  totalPages: number;
  currentPage: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  error?: string;
}

export function useExtractionProgress(workspacePath: string | null) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!workspacePath) return;

    dispatch(resetForNewDocument());

    // Check for active run (reconnect to in-progress extraction)
    const checkActiveRun = async () => {
      try {
        const activeRun = await window.electron.ipcRenderer.invoke(
          'workflow:get-active-run',
          workspacePath,
        ) as ActiveRunState | null;

        if (activeRun && activeRun.status === 'running') {
          console.log('[useExtractionProgress] Reconnecting to active run:', activeRun.currentPage, '/', activeRun.totalPages);

          // Restore state from active run
          dispatch(
            startExtraction({
              provider: 'openrouter',
              totalPages: activeRun.totalPages,
            }),
          );

          // Mark pages as completed up to currentPage
          for (let i = 1; i <= activeRun.currentPage; i++) {
            dispatch(pageCompleted({ page: i }));
          }
        }
      } catch (err) {
        // Silent fail - don't crash on reconnection errors
        console.warn('[useExtractionProgress] Failed to check active run:', err);
      }
    };

    checkActiveRun();

    console.log('[useExtractionProgress] Subscribing to ocr:progress');
    const unsubscribe = window.electron.ipcRenderer.on(
      'ocr:progress',
      (event: unknown) => {
        try {
          const progress = event as OcrProgress;
          console.log('[useExtractionProgress] Received ocr:progress:', progress.phase, progress.currentPage);

          if (progress.phase === 'processing') {
            if (progress.currentPage === 1 && progress.totalPages) {
              dispatch(
                startExtraction({
                  provider: progress.providerId,
                  totalPages: progress.totalPages,
                }),
              );
            }

            if (progress.currentPage) {
              dispatch(pageCompleted({ page: progress.currentPage }));
            }
          } else if (progress.phase === 'completed') {
            dispatch(extractionCompleted());
          } else if (progress.phase === 'failed') {
            dispatch(extractionError(progress.error || 'Extraction failed'));
          }
        } catch (err) {
          // Silent fail - don't crash on progress event errors
          console.error('[useExtractionProgress] Error handling progress:', err);
        }
      },
    );

    // Signal to main process that we're ready to receive progress events
    // This flushes any queued events that were sent before we subscribed
    window.electron.ipcRenderer.invoke('progress:renderer-ready').then(() => {
      console.log('[useExtractionProgress] Signaled renderer ready');
    }).catch((err) => {
      console.warn('[useExtractionProgress] Failed to signal ready:', err);
    });

    return () => {
      unsubscribe();
    };
  }, [workspacePath, dispatch]);
}
