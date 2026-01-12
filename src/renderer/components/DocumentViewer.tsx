import { useState, useRef, useEffect, useMemo } from 'react';
import * as Sentry from '@sentry/electron/renderer';
import PDFViewer from './PDFViewer';
import ChatInterface from './ChatInterface';
import { ExtractionOverlay } from './ExtractionOverlay';
import { LayerMenu } from './review/LayerMenu';
import { StatusBubble } from './StatusBubble';
import { SENTRY_ENABLED } from '../../config/sentry';
import { useAppDispatch, useAppSelector } from '../store';
import { useExtractionProgress } from '../hooks/useExtractionProgress';
import {
  setWorkspacePath,
  setCurrentPage as setReduxPage,
  fetchPageEntities,
  toggleOverlay,
  selectVisibleEntities,
  selectShowAnyOverlay,
  selectCurrentPage,
  selectOverlayVisibility,
  type OverlayType,
} from '../store/viewerSlice';

interface DocumentViewerProps {
  documentUuid: string;
  documentName: string;
  workspacePath: string;
  onBack: () => void;
  onOpenSettings: () => void;
}

export default function DocumentViewer({
  documentUuid,
  documentName,
  workspacePath,
  onBack,
  onOpenSettings,
}: DocumentViewerProps) {
  const dispatch = useAppDispatch();
  const entities = useAppSelector(selectVisibleEntities);
  const showEntityOverlays = useAppSelector(selectShowAnyOverlay);
  const currentPage = useAppSelector(selectCurrentPage);
  const overlayVisibility = useAppSelector(selectOverlayVisibility);

  const [leftPanelWidth, setLeftPanelWidth] = useState(50);
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  useExtractionProgress(workspacePath);

  // Convert overlayVisibility to Set for LayerMenu
  const visibleLayers = useMemo(() => {
    const layers = new Set<string>();
    if (overlayVisibility.table) layers.add('table');
    if (overlayVisibility.figure) layers.add('figure');
    if (overlayVisibility.footnote) layers.add('footnote');
    if (overlayVisibility.ocr) layers.add('ocr');
    return layers;
  }, [overlayVisibility]);
  const [pdfPath, setPdfPath] = useState<string>('');
  const [newFileCount, setNewFileCount] = useState(0);
  const [showFileList, setShowFileList] = useState(false);
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);
  const lastOpenedFileCount = useRef<number>(0);
  const isDragging = useRef(false);
  const missingPdfReported = useRef<Set<string>>(new Set());
  const fileListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dispatch(setWorkspacePath(workspacePath));
  }, [workspacePath, dispatch]);

  useEffect(() => {
    if (currentPage > 0 && workspacePath) {
      dispatch(fetchPageEntities({ workspacePath, page: currentPage }));
    }
  }, [currentPage, workspacePath, dispatch]);

  useEffect(() => {
    const initFileCount = async () => {
      const files = await window.electron.ipcRenderer.invoke(
        'workspace:list-files',
        workspacePath,
      );
      lastOpenedFileCount.current = files?.length ?? 0;
      setWorkspaceFiles(files || []);
    };
    initFileCount();
  }, [workspacePath]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        fileListRef.current &&
        !fileListRef.current.contains(e.target as Node)
      ) {
        setShowFileList(false);
      }
    };
    if (showFileList) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFileList]);

  const handleToggleFileList = async () => {
    if (!showFileList) {
      const files = await window.electron.ipcRenderer.invoke(
        'workspace:list-files',
        workspacePath,
      );
      setWorkspaceFiles(files || []);
      lastOpenedFileCount.current = files?.length ?? 0;
      setNewFileCount(0);
    }
    setShowFileList(!showFileList);
  };

  const handleOpenFile = async (fileName: string) => {
    const filePath = `${workspacePath}/${fileName}`;
    await window.electron.ipcRenderer.invoke(
      'workspace:open-in-finder',
      filePath,
    );
  };

  const handlePageChange = (page: number) => {
    dispatch(setReduxPage(page));
  };

  const handleToggleLayer = (layer: string) => {
    dispatch(toggleOverlay(layer as OverlayType));
  };

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
      <header className="bg-white shadow-sm border-b border-sidebar-border px-4 py-3 flex items-center justify-between shrink-0">
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
          <LayerMenu
            open={layerMenuOpen}
            onOpenChange={setLayerMenuOpen}
            visibleLayers={visibleLayers}
            onToggleLayer={handleToggleLayer}
          />
          <div className="relative">
            <button
              onClick={handleToggleFileList}
              className="p-2 hover:bg-sidebar-bg-hover rounded-lg transition-colors relative"
              title="View workspace files"
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
              {newFileCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {newFileCount}
                </span>
              )}
            </button>

            {showFileList && (
              <div
                ref={fileListRef}
                className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-lg border border-slate-200 z-50 max-h-96 overflow-auto"
              >
                <div className="px-3 py-2 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Files
                  </span>
                  <button
                    onClick={() =>
                      window.electron.ipcRenderer.invoke(
                        'workspace:open-in-finder',
                        workspacePath,
                      )
                    }
                    className="text-xs text-blue-500 hover:text-blue-600"
                  >
                    Reveal
                  </button>
                </div>
                {workspaceFiles.length === 0 ? (
                  <div className="p-4 text-xs text-slate-400 text-center">
                    Empty
                  </div>
                ) : (
                  <div className="py-1">
                    {workspaceFiles.map((file) => (
                      <button
                        key={file}
                        onClick={() => handleOpenFile(file)}
                        className="w-full px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100 flex items-center gap-2 font-mono"
                      >
                        <span className="w-4 text-slate-400 text-[11px]">
                          {file.split('.').pop()}
                        </span>
                        <span className="truncate">{file}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div id="split-container" className="flex-1 flex overflow-hidden min-h-0">
        <div
          className="h-full overflow-hidden border-r border-slate-200"
          style={{ width: `${leftPanelWidth}%`, minWidth: '400px' }}
        >
          {pdfPath ? (
            <PDFViewer
              pdfPath={pdfPath}
              onPageChange={handlePageChange}
              entities={entities}
              showEntityOverlays={showEntityOverlays}
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
          <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
            <h2 className="text-sm font-medium text-slate-700">
              Chat with your document
            </h2>
            <p className="text-xs text-slate-500">
              Ask questions about the PDF content
            </p>
          </div>
          <ChatInterface onOpenSettings={onOpenSettings} />
        </div>
      </div>

      <ExtractionOverlay />
    </div>
  );
}
