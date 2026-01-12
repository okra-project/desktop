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
  selectPageDimensions,
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
  const pageDimensions = useAppSelector(selectPageDimensions);

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
  const isDragging = useRef(false);
  const missingPdfReported = useRef<Set<string>>(new Set());

  useEffect(() => {
    dispatch(setWorkspacePath(workspacePath));
  }, [workspacePath, dispatch]);

  useEffect(() => {
    if (currentPage > 0 && workspacePath) {
      dispatch(fetchPageEntities({ workspacePath, page: currentPage }));
    }
  }, [currentPage, workspacePath, dispatch]);

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
          <LayerMenu
            open={layerMenuOpen}
            onOpenChange={setLayerMenuOpen}
            visibleLayers={visibleLayers}
            onToggleLayer={handleToggleLayer}
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
