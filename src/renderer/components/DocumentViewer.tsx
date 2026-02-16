import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import * as Sentry from '@sentry/electron/renderer';
import PDFViewer from './PDFViewer';
import ChatInterface from './ChatInterface';
import { ExtractionOverlay } from './ExtractionOverlay';
import { LayerMenu } from './review/LayerMenu';
import { PluginMenu } from './PluginMenu';
import { SchemaExtractionPanel } from './SchemaExtractionPanel';
import { StatusBubble } from './StatusBubble';
import { QueryResultsPanel } from './QueryResultsPanel';
import { VerifyPanel, type VerifyRequest } from './VerifyPanel';
import { SENTRY_ENABLED } from '../../config/sentry';
import { useAppDispatch, useAppSelector } from '../store';
import { useExtractionProgress } from '../hooks/useExtractionProgress';
import { useWorkspaceLayers } from '../hooks/useWorkspaceLayers';
import { useWorkflow } from '../hooks/useWorkflow';
import type { OcrProviderConfig } from '../hooks/useOcrProviders';
import {
  setWorkspacePath,
  setCurrentPage as setReduxPage,
  fetchPageEntities,
  toggleOverlay,
  selectVisibleEntities,
  selectShowAnyOverlay,
  selectCurrentPage,
  selectOverlayVisibility,
  selectPageDimensions,
  selectTotalPages,
} from '../store/viewerSlice';
import { selectHasActiveQuery, clearQuery } from '../store/querySlice';
import {
  startSession as startVerifySession,
  selectIsVerifyActive,
  selectVerifyState,
} from '../store/verifyModeSlice';

interface SelectorResult {
  id: string;
  page: number;
  type: string;
  text: string;
  bbox: { xMin: number; yMin: number; xMax: number; yMax: number };
  workspaceId: string;
  workspaceName: string;
  workspacePath: string;
}

interface DocumentViewerProps {
  documentUuid: string;
  documentName: string;
  workspacePath: string;
  onBack: () => void;
  onOpenSettings: () => void;
  initialPage?: number | null;
  onInitialPageUsed?: () => void;
  selector?: string | null;
  selectorResults?: SelectorResult[] | null;
  onSelectorUsed?: () => void;
  onResultSelect: (result: SelectorResult) => void;
}

export default function DocumentViewer({
  documentUuid,
  documentName,
  workspacePath,
  onBack,
  onOpenSettings,
  initialPage,
  onInitialPageUsed,
  selector,
  selectorResults,
  onSelectorUsed,
  onResultSelect,
}: DocumentViewerProps) {
  const dispatch = useAppDispatch();
  const entities = useAppSelector(selectVisibleEntities);
  const showEntityOverlays = useAppSelector(selectShowAnyOverlay);
  const currentPage = useAppSelector(selectCurrentPage);
  const overlayVisibility = useAppSelector(selectOverlayVisibility);
  const pageDimensions = useAppSelector(selectPageDimensions);
  const hasQueryResults = useAppSelector(selectHasActiveQuery);
  const isVerifyActive = useAppSelector(selectIsVerifyActive);
  const verifyState = useAppSelector(selectVerifyState);

  const [leftPanelWidth, setLeftPanelWidth] = useState(67);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [pluginMenuOpen, setPluginMenuOpen] = useState(false);
  const [runningPluginId, setRunningPluginId] = useState<string | null>(null);
  const [agentPanelMinimized, setAgentPanelMinimized] = useState(() => {
    return localStorage.getItem('agentPanelMinimized') === 'true';
  });
  const [showSchemaPanel, setShowSchemaPanel] = useState(false);

  // Verification mode state
  const [pendingVerifyRequest, setPendingVerifyRequest] = useState<VerifyRequest | null>(null);
  const [verifyQueueInfo, setVerifyQueueInfo] = useState<{
    current: number;
    total: number;
    verified: number;
    flagged: number;
  } | null>(null);
  const [isVerifyLoading, setIsVerifyLoading] = useState(false);

  const { startRun } = useWorkflow();
  const totalPages = useAppSelector(selectTotalPages);

  const handleStartVerifyMode = useCallback(async () => {
    if (totalPages === 0) {
      console.log('[DocumentViewer] No pages to verify');
      return;
    }

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'verify-mode:start',
        {
          workspaceId: documentUuid,
          workspaceName: documentName,
          totalPages,
          workspacePath,
          objective: 'Review all extractions and export verified data to Excel',
          permissionLevel: 'page',
        },
      );

      if (result.success) {
        dispatch(
          startVerifySession({
            sessionId: result.sessionId,
            workspaceId: documentUuid,
            totalPages,
            objective:
              'Review all extractions and export verified data to Excel',
          }),
        );
      } else {
        console.error(
          '[DocumentViewer] Failed to start verify mode:',
          result.error,
        );
      }
    } catch (error) {
      console.error('[DocumentViewer] Verify mode error:', error);
    }
  }, [documentUuid, documentName, totalPages, workspacePath, dispatch]);

  useEffect(() => {
    localStorage.setItem('agentPanelMinimized', String(agentPanelMinimized));
  }, [agentPanelMinimized]);

  useEffect(() => {
    if (hasQueryResults) {
      setShowResultsPanel(true);
    }
  }, [hasQueryResults]);

  useEffect(() => {
    if (selector) {
      setShowResultsPanel(true);
    }
  }, [selector]);

  useExtractionProgress(workspacePath);
  const { layers: availableLayers } = useWorkspaceLayers(workspacePath);

  const visibleLayers = useMemo(() => {
    return new Set(
      Object.entries(overlayVisibility)
        .filter(([, visible]) => visible)
        .map(([layerId]) => layerId),
    );
  }, [overlayVisibility]);
  const [pdfPath, setPdfPath] = useState<string>('');
  const isDragging = useRef(false);
  const missingPdfReported = useRef<Set<string>>(new Set());

  useEffect(() => {
    dispatch(setWorkspacePath(workspacePath));
  }, [workspacePath, dispatch]);

  // Handle initial page navigation (e.g., from MCP show_result)
  useEffect(() => {
    if (initialPage && initialPage > 0) {
      dispatch(setReduxPage(initialPage));
      onInitialPageUsed?.();
    }
  }, [initialPage, dispatch, onInitialPageUsed]);

  useEffect(() => {
    if (currentPage > 0 && workspacePath) {
      dispatch(fetchPageEntities({ workspacePath, page: currentPage }));
    }
  }, [currentPage, workspacePath, dispatch]);

  // Listen for verify-approval requests from agent
  useEffect(() => {
    const unsubVerifyApproval = window.electron.ipcRenderer.on(
      'human-input:verify-approval',
      (data: unknown) => {
        const event = data as VerifyRequest & { queueInfo?: typeof verifyQueueInfo };
        console.log('[DocumentViewer] Verify approval request:', event.pageNumber);

        // Navigate to the page
        dispatch(setReduxPage(event.pageNumber));

        // Show the verify panel (un-minimize agent panel if needed)
        setAgentPanelMinimized(false);

        // Clear loading, set the pending request
        setIsVerifyLoading(false);
        setPendingVerifyRequest(event);
        if (event.queueInfo) {
          setVerifyQueueInfo(event.queueInfo);
        }
      },
    );

    // Listen for verify agent completion
    const unsubVerifyEvent = window.electron.ipcRenderer.on(
      'verify-agent:event',
      (data: unknown) => {
        const message = data as { type: string; subtype?: string };
        if (message.type === 'result') {
          // Verification complete, clear loading state
          setIsVerifyLoading(false);
          setVerifyQueueInfo(null);
        }
      },
    );

    return () => {
      unsubVerifyApproval();
      unsubVerifyEvent();
    };
  }, [dispatch]);

  // Handle verify panel response
  const handleVerifyResponse = useCallback(
    async (action: 'verify' | 'flag' | 'skip' | 'reextract', notes?: string) => {
      if (!pendingVerifyRequest) return;

      try {
        // Show loading state while waiting for next page
        setIsVerifyLoading(true);

        await window.electron.ipcRenderer.invoke('human-input:response', {
          requestId: pendingVerifyRequest.requestId,
          response: { action, notes },
        });

        // Update queue info optimistically
        if (verifyQueueInfo) {
          setVerifyQueueInfo((prev) =>
            prev
              ? {
                  ...prev,
                  current: prev.current + 1,
                  verified: action === 'verify' ? prev.verified + 1 : prev.verified,
                  flagged: action === 'flag' ? prev.flagged + 1 : prev.flagged,
                }
              : null,
          );
        }

        // Clear the pending request - agent will send next one
        setPendingVerifyRequest(null);
      } catch (err) {
        console.error('[DocumentViewer] Failed to send verify response:', err);
        setIsVerifyLoading(false);
      }
    },
    [pendingVerifyRequest, verifyQueueInfo],
  );

  const handlePageChange = (page: number) => {
    dispatch(setReduxPage(page));
  };

  const handleToggleLayer = (layer: string) => {
    dispatch(toggleOverlay(layer));
  };

  const handleRunPlugin = useCallback(
    async (providerId: string, config: OcrProviderConfig) => {
      if (totalPages === 0) {
        console.log('[DocumentViewer] No pages to extract');
        return;
      }

      setRunningPluginId(providerId);
      try {
        await startRun({
          workspaceId: documentUuid,
          workspacePath,
          totalPages,
          nodes: [
            {
              nodeId: `${providerId}-extractor`,
              nodeType: providerId,
              config: (config || {}) as Record<string, unknown>,
            },
          ],
        });
      } catch (error) {
        console.error('[DocumentViewer] Failed to start extraction:', error);
      } finally {
        setRunningPluginId(null);
      }
    },
    [documentUuid, workspacePath, totalPages, startRun],
  );

  useEffect(() => {
    const findPdf = async () => {
      try {
        const files = await window.electron.ipcRenderer.invoke(
          'workspace:list-files',
          workspacePath,
        );

        if (files && files.length > 0) {
          const pdfFile = files.find((f: string) =>
            f.toLowerCase().endsWith('.pdf'),
          );

          if (pdfFile) {
            const fullPath = `${workspacePath}/${pdfFile}`;
            setPdfPath(fullPath);
          } else if (!missingPdfReported.current.has(documentUuid)) {
            missingPdfReported.current.add(documentUuid);
            if (SENTRY_ENABLED) {
              Sentry.captureMessage('[viewer] No PDF found in workspace', {
                level: 'warning',
                extra: {
                  documentUuid,
                  fileCount: files?.length ?? 0,
                },
              });
            }
          }
        }
      } catch (err) {
        console.error('Failed to find PDF:', err);
        if (SENTRY_ENABLED) {
          Sentry.captureException(err);
        }
      }
    };

    findPdf();
  }, [workspacePath, documentUuid]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const container = document.getElementById('split-container');
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const newWidthPercent = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPanelWidth(Math.min(Math.max(newWidthPercent, 30), 70));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-cream">
      {/* Header with drag region for macOS traffic lights */}
      <header className="bg-white shadow-sm border-b border-sidebar-border pr-4 py-3 flex items-center shrink-0">
        {/* Draggable spacer for traffic lights - only this area is draggable */}
        <div className="w-20 flex-shrink-0 drag-region self-stretch" />
        {/* Content area - all buttons are clickable */}
        <div className="flex items-center justify-between flex-1">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 hover:bg-sidebar-bg-hover rounded-lg transition-colors"
              title="Back to documents"
            >
              <svg
                className="w-5 h-5 text-sidebar-text"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-ink truncate max-w-[400px]">
                {documentName}
              </h1>
              <p className="text-xs text-sidebar-text">
                Page {currentPage} • {entities.length} entities
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusBubble />
            {hasQueryResults && (
              <button
                onClick={() => setShowResultsPanel((v) => !v)}
                className={`p-2 rounded-lg transition-colors ${
                  showResultsPanel
                    ? 'bg-okra-yellow text-ink'
                    : 'hover:bg-sidebar-bg-hover text-sidebar-text'
                }`}
                title="Query Results"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={() => {
                setShowSchemaPanel((v) => !v);
                if (!showSchemaPanel) setAgentPanelMinimized(false);
              }}
              className={`p-2 rounded-lg transition-colors ${
                showSchemaPanel
                  ? 'bg-okra-yellow text-ink'
                  : 'hover:bg-sidebar-bg-hover text-sidebar-text'
              }`}
              title="Schema Extraction"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <PluginMenu
              open={pluginMenuOpen}
              onOpenChange={setPluginMenuOpen}
              onRunPlugin={handleRunPlugin}
              runningPluginId={runningPluginId}
            />
            <LayerMenu
              open={layerMenuOpen}
              onOpenChange={setLayerMenuOpen}
              visibleLayers={visibleLayers}
              onToggleLayer={handleToggleLayer}
              layers={availableLayers}
            />
            <button
              onClick={() =>
                window.electron.ipcRenderer.invoke(
                  'workspace:open-in-finder',
                  workspacePath,
                )
              }
              className="p-2 hover:bg-sidebar-bg-hover rounded-lg transition-colors"
              title="Open in Finder"
            >
              <svg
                className="w-5 h-5 text-sidebar-text"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div
        id="split-container"
        className="flex-1 flex overflow-hidden min-h-0 relative"
      >
        <div
          className="h-full overflow-hidden border-r border-slate-200 transition-all"
          style={{
            width: agentPanelMinimized ? '100%' : `${leftPanelWidth}%`,
            minWidth: '400px',
          }}
        >
          {pdfPath ? (
            <PDFViewer
              pdfPath={pdfPath}
              initialPage={currentPage}
              onPageChange={handlePageChange}
              entities={entities}
              showEntityOverlays={showEntityOverlays}
              pageDimensions={pageDimensions}
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-slate-50">
              <div className="text-center">
                <div className="text-4xl mb-2">📄</div>
                <p className="text-slate-500 text-sm">Loading document...</p>
              </div>
            </div>
          )}
        </div>

        {!agentPanelMinimized && (
          <>
            <div
              className="w-1 bg-slate-200 hover:bg-blue-400 cursor-col-resize transition-colors shrink-0"
              onMouseDown={() => {
                isDragging.current = true;
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
              }}
            />
            <div
              className="flex-1 h-full overflow-hidden flex flex-col bg-white"
              style={{ minWidth: '350px' }}
            >
              {/* Show SchemaExtractionPanel, VerifyPanel, or ChatInterface */}
              {showSchemaPanel ? (
                <SchemaExtractionPanel
                  workspacePath={workspacePath}
                  onNavigateToPage={(page) => dispatch(setReduxPage(page))}
                  onClose={() => setShowSchemaPanel(false)}
                />
              ) : pendingVerifyRequest ? (
                <VerifyPanel
                  request={pendingVerifyRequest}
                  onRespond={handleVerifyResponse}
                  queueInfo={verifyQueueInfo || undefined}
                />
              ) : isVerifyLoading ? (
                <div className="flex flex-col h-full bg-white">
                  <div className="px-4 py-2 border-b border-slate-200 bg-okra-yellow/20 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-xs font-medium text-ink">Verification Mode</span>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-okra-yellow mx-auto mb-3" />
                      <p className="text-sm text-slate-600">Loading next page...</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
                    <h2 className="text-sm font-medium text-slate-700">
                      Okra Agent
                    </h2>
                    <button
                      onClick={() => setAgentPanelMinimized(true)}
                      className="p-1 hover:bg-slate-200 rounded transition-colors"
                      title="Minimize panel"
                    >
                      <svg
                        className="w-4 h-4 text-slate-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  </div>
                  <ChatInterface
                    onOpenSettings={onOpenSettings}
                    workspaceId={documentUuid}
                    workspacePath={workspacePath}
                    totalPages={totalPages}
                  />
                </>
              )}
            </div>
          </>
        )}

        {agentPanelMinimized && (
          <button
            onClick={() => setAgentPanelMinimized(false)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white border border-slate-200 rounded-lg shadow-md hover:bg-slate-50 transition-colors z-10"
            title="Show Okra Agent"
          >
            <svg
              className="w-5 h-5 text-slate-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        )}

        {showResultsPanel && (
          <div className="w-80 h-full shrink-0 border-l border-slate-200">
            <QueryResultsPanel
              selector={selector}
              results={selectorResults}
              onResultSelect={onResultSelect}
              onClose={() => {
                setShowResultsPanel(false);
                onSelectorUsed?.();
              }}
            />
          </div>
        )}
      </div>

      <ExtractionOverlay />
    </div>
  );
}
