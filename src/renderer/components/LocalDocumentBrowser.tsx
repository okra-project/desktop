import React, { useState, useEffect, useCallback } from 'react';
import GlobalSearchBar from './GlobalSearchBar';
import { GlobalExtractionStatus } from './GlobalExtractionStatus';

interface LocalWorkspace {
  id: string;
  name: string;
  pdfPath: string;
  workspacePath: string;
  createdAt: string;
  lastOpenedAt: string;
  pageCount?: number;
  extractionStatus: 'pending' | 'extracting' | 'completed' | 'failed';
}

interface LocalDocumentBrowserProps {
  onSelectDocument: (doc: { id: string; name: string; workspacePath: string; page?: number }) => void;
  onOpenSettings: () => void;
}

function LocalDocumentBrowser({ onSelectDocument, onOpenSettings }: LocalDocumentBrowserProps) {
  const [workspaces, setWorkspaces] = useState<LocalWorkspace[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('workspace:list-local');
      setWorkspaces(result || []);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadThumbnails = useCallback(async (spaces: LocalWorkspace[]) => {
    const thumbs: Record<string, string | null> = {};
    await Promise.all(
      spaces.map(async (ws) => {
        try {
          const url = await window.electron.ipcRenderer.invoke('workspace:get-thumbnail', ws.workspacePath);
          thumbs[ws.id] = url;
        } catch {
          thumbs[ws.id] = null;
        }
      })
    );
    setThumbnails(thumbs);
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (workspaces.length > 0) {
      loadThumbnails(workspaces);
    }
  }, [workspaces, loadThumbnails]);

  const handleOpenPDF = async () => {
    setIsOpening(true);
    try {
      const result = await window.electron.ipcRenderer.invoke('workspace:open-pdf-dialog');
      if (result?.success) {
        await loadWorkspaces();
        onSelectDocument({
          id: result.workspace.id,
          name: result.workspace.name,
          workspacePath: result.workspace.workspacePath,
        });
      }
    } catch (err) {
      console.error('Failed to open PDF:', err);
    } finally {
      setIsOpening(false);
    }
  };

  const handleSelectWorkspace = async (workspace: LocalWorkspace) => {
    setOpeningId(workspace.id);
    try {
      await window.electron.ipcRenderer.invoke('workspace:update-last-opened', workspace.id);
      onSelectDocument({
        id: workspace.id,
        name: workspace.name,
        workspacePath: workspace.workspacePath,
      });
    } finally {
      setOpeningId(null);
    }
  };

  const handleDeleteWorkspace = async (e: React.MouseEvent, workspaceId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this workspace? The original PDF will not be affected.')) return;
    
    try {
      await window.electron.ipcRenderer.invoke('workspace:delete-local', workspaceId);
      await loadWorkspaces();
    } catch (err) {
      console.error('Failed to delete workspace:', err);
    }
  };

  const handleOpenInFinder = async (e: React.MouseEvent, workspacePath: string) => {
    e.stopPropagation();
    await window.electron.ipcRenderer.invoke('workspace:open-in-finder', workspacePath);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-cream">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-okra-yellow" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-cream">
      {/* Header - pl-20 for macOS traffic lights, slim height like Jan */}
      {/* Left padding area is draggable for window movement */}
      <div className="pr-6 py-3 border-b border-sidebar-border bg-white shadow-sm z-20 flex items-center justify-between gap-6">
        {/* Draggable spacer for traffic lights area */}
        <div className="w-20 flex-shrink-0 drag-region h-full" />
        {/* Left: Title */}
        <div className="flex-shrink-0">
          <h1 className="text-lg font-semibold text-ink tracking-tight">Local Documents</h1>
          <p className="text-xs text-sidebar-text">Your PDFs stay on your computer</p>
        </div>

        {/* Right: Search + Actions */}
        <div className="flex items-center gap-4 flex-1 justify-end max-w-4xl">
          <GlobalSearchBar
            onSelectWorkspace={onSelectDocument}
            documentCount={workspaces.length}
            className="w-full max-w-xl"
          />
          
          <div className="flex items-center gap-3 flex-shrink-0 pl-2">
            <GlobalExtractionStatus />
            <button
              onClick={handleOpenPDF}
              disabled={isOpening}
              className="px-4 py-2.5 bg-okra-yellow hover:bg-okra-yellow-hover text-ink rounded-lg font-medium transition-all disabled:opacity-50 border border-ink/10 hover:border-ink shadow-sm hover:shadow-md text-sm"
            >
              {isOpening ? 'Opening...' : 'Open PDF'}
            </button>
            <button
              onClick={onOpenSettings}
              className="p-2.5 text-sidebar-text hover:text-ink hover:bg-sidebar-hover rounded-lg transition-colors border border-transparent hover:border-sidebar-border"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {workspaces.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📄</div>
            <h3 className="text-xl font-medium text-ink mb-2">No documents yet</h3>
            <p className="text-sidebar-text mb-6">Open a PDF to get started</p>
            <button
              onClick={handleOpenPDF}
              disabled={isOpening}
              className="px-6 py-3 bg-okra-yellow hover:bg-okra-yellow-hover text-ink rounded-xl font-medium transition-all disabled:opacity-50 border-2 border-ink shadow-[4px_4px_0px_0px_rgba(36,28,21,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
            >
              {isOpening ? 'Opening...' : 'Open PDF'}
            </button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {workspaces.map((workspace) => (
              <div
                key={workspace.id}
                onClick={() => handleSelectWorkspace(workspace)}
                className="bg-white rounded-xl border border-sidebar-border overflow-hidden hover:shadow-lg hover:border-okra-yellow transition-all cursor-pointer group relative"
              >
                {openingId === workspace.id && (
                  <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-okra-yellow" />
                  </div>
                )}
                
                <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center overflow-hidden">
                  {thumbnails[workspace.id] ? (
                    <img 
                      src={thumbnails[workspace.id]!} 
                      alt={workspace.name}
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <span className="text-4xl">📄</span>
                  )}
                </div>

                <div className="p-3">
                  <h3 className="font-medium text-ink truncate text-sm" title={workspace.name}>
                    {workspace.name}
                  </h3>
                  <p className="text-xs text-sidebar-text mt-0.5">
                    {formatDate(workspace.lastOpenedAt || workspace.createdAt)}
                  </p>
                  {workspace.extractionStatus === 'extracting' && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 mt-1">
                      <span className="animate-pulse">●</span> Extracting...
                    </span>
                  )}
                  {workspace.extractionStatus === 'completed' && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 mt-1">
                      ✓ Ready
                    </span>
                  )}
                </div>

                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleOpenInFinder(e, workspace.workspacePath)}
                    className="p-1.5 text-sidebar-text hover:text-ink bg-white/90 rounded-lg hover:bg-white shadow-sm"
                    title="Show in Finder"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => handleDeleteWorkspace(e, workspace.id)}
                    className="p-1.5 text-sidebar-text hover:text-red-500 bg-white/90 rounded-lg hover:bg-white shadow-sm"
                    title="Delete workspace"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default LocalDocumentBrowser;