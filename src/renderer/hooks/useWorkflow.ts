import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
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

export function useWorkflow() {
  const dispatch = useAppDispatch();
  const activeRunId = useAppSelector(selectActiveRunId);
  const activeRun = useAppSelector(selectActiveRun);
  const status = useAppSelector(selectActiveRunStatus);

  const progress = useAppSelector((state) =>
    activeRunId ? selectRunProgress(activeRunId)(state) : { completed: 0, total: 0, percentage: 0 }
  );

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
  const latestRun = useAppSelector(selectLatestRunForWorkspace(workspaceId));

  const progress = useAppSelector((state) =>
    latestRun ? selectRunProgress(latestRun.id)(state) : { completed: 0, total: 0, percentage: 0 }
  );

  return {
    latestRun,
    status: latestRun?.status ?? 'idle',
    progress,
    isRunning: latestRun?.status === 'running',
    isComplete: latestRun?.status === 'completed',
  };
}
