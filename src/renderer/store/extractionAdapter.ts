import type { ExtractionAdapter, PageContent, ExtractionProgressEvent } from '@okrapdf/redux';

export const electronExtractionAdapter: ExtractionAdapter = {
  async startTextExtraction(workspaceId: string): Promise<{ success: boolean; error?: string }> {
    return window.electron.ipcRenderer.invoke('extraction:start-text', workspaceId);
  },

  async cancelExtraction(): Promise<void> {
    await window.electron.ipcRenderer.invoke('extraction:cancel');
  },

  async getPageCount(workspacePath: string): Promise<number> {
    return window.electron.ipcRenderer.invoke('extraction:get-page-count', workspacePath);
  },

  async getPageContent(workspacePath: string, page: number): Promise<PageContent | null> {
    return window.electron.ipcRenderer.invoke('extraction:get-page-content', workspacePath, page);
  },

  async getPageContents(workspacePath: string, pages: number[]): Promise<PageContent[]> {
    const results = await Promise.all(
      pages.map((page) => 
        window.electron.ipcRenderer.invoke('extraction:get-page-content', workspacePath, page)
      )
    );
    return results.filter((r): r is PageContent => r !== null);
  },

  async savePageContent(workspacePath: string, page: number, content: string): Promise<void> {
    await window.electron.ipcRenderer.invoke('extraction:save-page-content', workspacePath, page, content);
  },

  subscribeToProgress(
    workspaceId: string,
    callback: (event: ExtractionProgressEvent & { workspaceId: string }) => void
  ): () => void {
    return window.electron.ipcRenderer.on('extraction:progress', (event: unknown) => {
      const progressEvent = event as ExtractionProgressEvent & { workspaceId: string };
      if (progressEvent.workspaceId === workspaceId) {
        callback(progressEvent);
      }
    });
  },
};
