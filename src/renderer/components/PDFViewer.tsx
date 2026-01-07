import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Bundle worker locally - versions now synced (5.4.296)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PDFViewerProps {
  pdfPath: string; // Local file path or URL
  onPageChange?: (page: number) => void;
}

export default function PDFViewer({ pdfPath, onPageChange }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Convert local path to file:// URL or use as-is if already URL
  useEffect(() => {
    if (pdfPath.startsWith('http://') || pdfPath.startsWith('https://')) {
      setPdfUrl(pdfPath);
    } else if (pdfPath.startsWith('file://')) {
      setPdfUrl(pdfPath);
    } else {
      // Local path - convert to file:// URL
      setPdfUrl(`file://${pdfPath}`);
    }
  }, [pdfPath]);

  // Track container width for responsive scaling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const onDocumentLoadSuccess = ({ numPages: pages }: { numPages: number }) => {
    setNumPages(pages);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    const newPage = Math.max(1, Math.min(page, numPages));
    setCurrentPage(newPage);
    onPageChange?.(newPage);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    // Estimate which page is visible based on scroll position
    const scrollRatio = container.scrollTop / (container.scrollHeight - container.clientHeight);
    const estimatedPage = Math.max(1, Math.ceil(scrollRatio * numPages));
    if (estimatedPage !== currentPage && estimatedPage <= numPages) {
      setCurrentPage(estimatedPage);
      onPageChange?.(estimatedPage);
    }
  };

  // Calculate page width to fit container
  const pageWidth = containerWidth ? Math.min(containerWidth - 32, 800) : 600;

  if (!pdfUrl) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-slate-400">Loading PDF...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-slate-200 bg-white flex items-center justify-between gap-2 shrink-0">
        {/* Page navigation */}
        <div className="text-xs font-mono text-slate-600 flex items-center gap-1">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="w-6 h-6 hover:bg-slate-100 rounded text-slate-600 flex items-center justify-center disabled:opacity-30"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <input
            type="number"
            min={1}
            max={numPages}
            value={currentPage}
            onChange={(e) => handlePageChange(parseInt(e.target.value, 10))}
            className="w-12 text-center bg-transparent border border-slate-300 rounded px-1 focus:outline-none focus:border-blue-400"
          />
          <span className="text-slate-400">/</span>
          <span>{numPages}</span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= numPages}
            className="w-6 h-6 hover:bg-slate-100 rounded text-slate-600 flex items-center justify-center disabled:opacity-30"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
            className="w-6 h-6 hover:bg-slate-100 rounded text-slate-600 flex items-center justify-center text-xs"
          >
            −
          </button>
          <span className="text-[10px] font-mono min-w-[32px] text-center text-slate-500">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.0, s + 0.1))}
            className="w-6 h-6 hover:bg-slate-100 rounded text-slate-600 flex items-center justify-center text-xs"
          >
            +
          </button>
        </div>
      </div>

      {/* PDF Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 flex flex-col items-center"
        onScroll={handleScroll}
      >
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          }
          error={
            <div className="flex items-center justify-center py-20 text-red-500">
              Failed to load PDF
            </div>
          }
        >
          {Array.from({ length: numPages }, (_, index) => (
            <div key={`page_${index + 1}`} className="mb-4 shadow-lg">
              <Page
                pageNumber={index + 1}
                width={pageWidth * scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}
