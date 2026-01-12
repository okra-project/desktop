import { useCallback, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { createSelector } from '@reduxjs/toolkit';
import {
  selectActiveRun,
  selectActiveRunId,
  selectRunProgress,
  selectActiveRunStatus,
  selectLatestRunForWorkspace,
  pauseRun,
  resumeRun,
  setActiveRun,
  getWorkflowRunner,
  type CreateRunOptions,
} from '@okrapdf/workflow-runtime';

const defaultProgress = { completed: 0, total: 0, percentage: 0 };

export function useWorkflow() {
  const dispatch = useAppDispatch();
  const activeRunId = useAppSelector(selectActiveRunId);
  const activeRun = useAppSelector(selectActiveRun);
  const status = useAppSelector(selectActiveRunStatus);

  const selectProgress = useMemo(
    () => activeRunId
      ? createSelector([(state) => state], (state) => selectRunProgress(activeRunId)(state))
      : () => defaultProgress,
    [activeRunId]
  );
  const progress = useAppSelector(selectProgress);

  const startRun = useCallback(async (options: CreateRunOptions) => {
    const runner = getWorkflowRunner();
    return runner.createAndStart(options);
  }, []);

  const cancel = useCallback(() => {
    if (activeRunId) {
      const runner = getWorkflowRunner();
      runner.cancel(activeRunId);
    }
  }, [activeRunId]);

  const pause = useCallback(() => {
    if (activeRunId) {
      dispatch(pauseRun({ runId: activeRunId }));
    }
  }, [dispatch, activeRunId]);

  const resume = useCallback(() => {
    if (activeRunId) {
      dispatch(resumeRun({ runId: activeRunId }));
    }
  }, [dispatch, activeRunId]);

  return {
    activeRun,
    activeRunId,
    status: status.status,
    nodeStatuses: status.nodeStatuses,
    progress,
    startRun,
    cancel,
    pause,
    resume,
    setActiveRun: (runId: string | null) => dispatch(setActiveRun(runId)),
  };
}

export function useWorkspaceWorkflow(workspaceId: string) {
  const selectLatestRun = useMemo(
    () => selectLatestRunForWorkspace(workspaceId),
    [workspaceId]
  );
  const latestRun = useAppSelector(selectLatestRun);

  const selectProgress = useMemo(
    () => latestRun
      ? createSelector([(state) => state], (state) => selectRunProgress(latestRun.id)(state))
      : () => defaultProgress,
    [latestRun?.id]
  );
  const progress = useAppSelector(selectProgress);

  return {
    latestRun,
    status: latestRun?.status ?? 'idle',
    progress,
    isRunning: latestRun?.status === 'running',
    isComplete: latestRun?.status === 'completed',
  };
}
