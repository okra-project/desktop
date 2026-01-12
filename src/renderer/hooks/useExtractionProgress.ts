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

export function useExtractionProgress(workspacePath: string | null) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!workspacePath) return;

    dispatch(resetForNewDocument());

    const unsubscribe = window.electron.ipcRenderer.on(
      'ocr:progress',
      (event: unknown) => {
        const progress = event as OcrProgress;

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
      },
    );

    return () => {
      unsubscribe();
    };
  }, [workspacePath, dispatch]);
}
