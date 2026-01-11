import { useState, useRef, useEffect } from 'react';
import * as Sentry from '@sentry/electron/renderer';
import PDFViewer from './PDFViewer';
import ChatInterface from './ChatInterface';
import { ExtractionOverlay } from './ExtractionOverlay';
import { SENTRY_ENABLED } from '../../config/sentry';

interface DocumentViewerProps {
  documentUuid: string;
  documentName: string;
  workspacePath: string;
  onBack: () => void;
}

/**
 * Two-panel layout: PDF viewer (left) + Chat (right)
 * Same layout as okrapdf web's ocr/[jobId] page
 */
export default function DocumentViewer({
  documentUuid,
  documentName,
  workspacePath,
  onBack,
}: DocumentViewerProps) {
  const [leftPanelWidth, setLeftPanelWidth] = useState(50); // percentage
  const [pdfPath, setPdfPath] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const isDragging = useRef(false);
  const missingPdfReported = useRef<Set<string>>(new Set());

  // Find PDF file in workspace
  useEffect(() => {
    const findPdf = async () => {
      try {
        // Look for source.pdf or any .pdf file in workspace
        const files = await window.electron.ipcRenderer.invoke(
          'workspace:list-files',
          workspacePath
        );

        if (files && files.length > 0) {
          // Prefer source.pdf, otherwise take first PDF
          const sourcePdf = files.find((f: string) => f === 'source.pdf');
          const anyPdf = files.find((f: string) => f.endsWith('.pdf'));
          const pdfFile = sourcePdf || anyPdf;

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
  }, [workspacePath]);

  // Handle panel resize
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
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-sidebar-border px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-sidebar-bg-hover rounded-lg transition-colors"
            title="Back to documents"
          >
            <svg className="w-5 h-5 text-sidebar-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold text-ink truncate max-w-[400px]">
              {documentName}
            </h1>
            <p className="text-xs text-sidebar-text">
              Page {currentPage}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.electron.ipcRenderer.invoke('workspace:open-in-finder', workspacePath)}
            className="p-2 hover:bg-sidebar-bg-hover rounded-lg transition-colors"
            title="Open folder in Finder"
          >
            <svg className="w-5 h-5 text-sidebar-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Two-panel layout: PDF + Chat */}
      <div id="split-container" className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: PDF Viewer */}
        <div
          className="h-full overflow-hidden border-r border-slate-200"
          style={{ width: `${leftPanelWidth}%`, minWidth: '400px' }}
        >
          {pdfPath ? (
            <PDFViewer pdfPath={pdfPath} onPageChange={setCurrentPage} />
          ) : (
            <div className="flex items-center justify-center h-full bg-slate-50">
              <div className="text-center">
                <div className="text-4xl mb-2">📄</div>
                <p className="text-slate-500 text-sm">Loading document...</p>
              </div>
            </div>
          )}
        </div>

        {/* Divider (draggable) */}
        <div
          className="w-1 bg-slate-200 hover:bg-blue-400 cursor-col-resize transition-colors shrink-0"
          onMouseDown={() => {
            isDragging.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
        />

        {/* Right: Chat Interface */}
        <div className="flex-1 h-full overflow-hidden flex flex-col bg-white" style={{ minWidth: '350px' }}>
          <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
            <h2 className="text-sm font-medium text-slate-700">Chat with your document</h2>
            <p className="text-xs text-slate-500">
              Ask questions about the PDF content
            </p>
          </div>
          <ChatInterface />
        </div>
      </div>

      <ExtractionOverlay />
    </div>
  );
}
