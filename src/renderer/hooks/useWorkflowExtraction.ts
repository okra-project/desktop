import { useEffect, useCallback, useState, useRef } from 'react';
import { useWorkflow, useWorkspaceWorkflow } from './useWorkflow';
import { useAppSelector } from '../store';
import { selectTotalPages, selectExtractionStatus } from '@okrapdf/redux';

export function useWorkflowExtraction(
  workspaceId: string,
  workspacePath: string,
) {
  const { startRun } = useWorkflow();
  const { latestRun, status, progress, isRunning, isComplete } =
    useWorkspaceWorkflow(workspaceId);

  const legacyStatus = useAppSelector(selectExtractionStatus);
  const totalPages = useAppSelector(selectTotalPages);

  // Track if we've already checked manifest on mount
  const [manifestChecked, setManifestChecked] = useState(false);
  const [extractionComplete, setExtractionComplete] = useState(false);
  const checkInProgressRef = useRef(false);

  // Check manifest on mount to avoid restarting completed extraction
  useEffect(() => {
    if (!workspacePath || manifestChecked || checkInProgressRef.current) return;

    checkInProgressRef.current = true;

    const checkManifest = async () => {
      try {
        const status = await window.electron.ipcRenderer.invoke(
          'ocr:check-extraction-status',
          workspacePath,
          'openrouter',
        );
        console.log('[workflow] Manifest check result:', status);
        if (status.completed) {
          console.log(
            '[workflow] Extraction already completed (from manifest)',
          );
          setExtractionComplete(true);
        }
      } catch (err) {
        console.warn('[workflow] Failed to check manifest:', err);
      } finally {
        setManifestChecked(true);
        checkInProgressRef.current = false;
      }
    };

    checkManifest();
  }, [workspacePath, manifestChecked]);

  const startExtraction = useCallback(async () => {
    if (totalPages === 0) {
      console.log('[workflow] No pages to extract');
      return;
    }

    // Skip if manifest says already complete
    if (extractionComplete) {
      console.log(
        '[workflow] Skipping - extraction already complete (manifest)',
      );
      return;
    }

    if (
      latestRun &&
      (latestRun.status === 'running' || latestRun.status === 'completed')
    ) {
      console.log('[workflow] Extraction already running or complete');
      return;
    }

    console.log(
      `[workflow] Starting entity extraction for ${totalPages} pages`,
    );

    try {
      const apiKey = await window.electron.ipcRenderer.invoke(
        'ocr:get-config',
        'openrouter',
      );

      await startRun({
        workspaceId,
        workspacePath,
        totalPages,
        nodes: [
          {
            nodeId: 'entity-extractor',
            nodeType: 'entityExtractor',
            config: { apiKey: apiKey?.apiKey },
          },
        ],
      });
    } catch (error) {
      console.error('[workflow] Failed to start extraction:', error);
    }
  }, [
    workspaceId,
    workspacePath,
    totalPages,
    latestRun,
    startRun,
    extractionComplete,
  ]);

  useEffect(() => {
    // Wait for manifest check before deciding to start
    if (!manifestChecked) return;

    if (
      legacyStatus === 'idle' &&
      totalPages > 0 &&
      !latestRun &&
      !extractionComplete
    ) {
      startExtraction();
    }
  }, [
    legacyStatus,
    totalPages,
    latestRun,
    startExtraction,
    manifestChecked,
    extractionComplete,
  ]);

  return {
    status: latestRun?.status ?? legacyStatus,
    progress,
    isRunning,
    isComplete,
    startExtraction,
  };
}
