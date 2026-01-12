import { useEffect, useCallback } from 'react';
import { useWorkflow, useWorkspaceWorkflow } from './useWorkflow';
import { useAppSelector } from '../store';
import { selectTotalPages, selectExtractionStatus } from '@okrapdf/redux';

export function useWorkflowExtraction(workspaceId: string, workspacePath: string) {
  const { startRun } = useWorkflow();
  const { latestRun, status, progress, isRunning, isComplete } = useWorkspaceWorkflow(workspaceId);
  
  const legacyStatus = useAppSelector(selectExtractionStatus);
  const totalPages = useAppSelector(selectTotalPages);

  const startExtraction = useCallback(async () => {
    if (totalPages === 0) {
      console.log('[workflow] No pages to extract');
      return;
    }

    if (latestRun && (latestRun.status === 'running' || latestRun.status === 'completed')) {
      console.log('[workflow] Extraction already running or complete');
      return;
    }

    console.log(`[workflow] Starting text extraction for ${totalPages} pages`);
    
    try {
      await startRun({
        workspaceId,
        workspacePath,
        totalPages,
        nodes: [
          {
            nodeId: 'text-extractor',
            nodeType: 'textExtractor',
            config: {},
          },
        ],
      });
    } catch (error) {
      console.error('[workflow] Failed to start extraction:', error);
    }
  }, [workspaceId, workspacePath, totalPages, latestRun, startRun]);

  useEffect(() => {
    if (legacyStatus === 'idle' && totalPages > 0 && !latestRun) {
      startExtraction();
    }
  }, [legacyStatus, totalPages, latestRun, startExtraction]);

  return {
    status: latestRun?.status ?? legacyStatus,
    progress,
    isRunning,
    isComplete,
    startExtraction,
  };
}
