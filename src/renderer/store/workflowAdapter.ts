import type { WorkflowRunnerAdapter, WorkflowRun, NodeProgress } from '@okrapdf/workflow-runtime';

export const electronWorkflowAdapter: WorkflowRunnerAdapter = {
  async executeNode(
    run: WorkflowRun,
    nodeId: string,
    onProgress: (progress: NodeProgress) => void
  ): Promise<void> {
    const node = run.nodes[nodeId];
    if (!node) throw new Error(`Node ${nodeId} not found`);

    onProgress({ nodeId, type: 'started', totalPages: run.totalPages });

    const unsubscribe = window.electron.ipcRenderer.on(
      'workflow:node-progress',
      (event: unknown) => {
        const progressEvent = event as NodeProgress & { runId: string };
        if (progressEvent.runId === run.id && progressEvent.nodeId === nodeId) {
          onProgress(progressEvent);
        }
      }
    );

    try {
      const result = await window.electron.ipcRenderer.invoke('workflow:execute-node', {
        runId: run.id,
        nodeId,
        nodeType: node.nodeType,
        workspacePath: run.workspacePath,
        totalPages: run.totalPages,
        config: node.config,
      });

      if (result.success) {
        onProgress({ nodeId, type: 'completed' });
      } else {
        onProgress({ nodeId, type: 'error', error: result.error });
      }
    } finally {
      unsubscribe();
    }
  },

  async cancelNode(runId: string, nodeId: string): Promise<void> {
    await window.electron.ipcRenderer.invoke('workflow:cancel-node', { runId, nodeId });
  },

  async retryPage(
    run: WorkflowRun,
    nodeId: string,
    page: number,
    onProgress: (progress: NodeProgress) => void
  ): Promise<void> {
    const node = run.nodes[nodeId];
    if (!node) throw new Error(`Node ${nodeId} not found`);

    const result = await window.electron.ipcRenderer.invoke('workflow:retry-page', {
      runId: run.id,
      nodeId,
      nodeType: node.nodeType,
      workspacePath: run.workspacePath,
      page,
      config: node.config,
    });

    if (result.success) {
      onProgress({ nodeId, type: 'page_complete', page, result: result.data });
    } else {
      onProgress({ nodeId, type: 'page_error', page, error: result.error });
    }
  },

  async getPageResult(workspacePath: string, nodeType: string, page: number): Promise<unknown> {
    return window.electron.ipcRenderer.invoke('workflow:get-page-result', {
      workspacePath,
      nodeType,
      page,
    });
  },
};
