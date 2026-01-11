import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ENTITY_COLORS, type EntityColorType } from '../lib/entity-colors';
import { DomSearchProvider, useSearch } from '../search';

// Bundle worker locally - versions now synced (5.4.296)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// ============================================================================
// Types
// ============================================================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EntityOverlay {
  id: string;
  type: 'table' | 'figure' | 'footnote' | 'summary' | 'paragraph' | 'signature';
  title: string | null;
  bbox?: BoundingBox;
  page: number;
}

export interface PageDimension {
  width: number | null;
  height: number | null;
}

interface PDFViewerProps {
  pdfPath: string; // Local file path or URL
  initialPage?: number;
  onPageChange?: (page: number) => void;
  /** Entities with bbox for overlay */
  entities?: EntityOverlay[];
  /** Whether to show entity overlays */
  showEntityOverlays?: boolean;
  /** Callback when an entity overlay is clicked */
  onEntityClick?: (entity: EntityOverlay, event: React.MouseEvent) => void;
  /** DocAI dimensions per page for bbox scaling */
  pageDimensions?: Record<number, PageDimension>;
}

// ============================================================================
// Overlay Colors Configuration
// ============================================================================

const OVERLAY_COLORS: Record<
  string,
  { border: string; fill: string; label: string }
> = {
  table: {
    border: ENTITY_COLORS.table.border,
    fill: ENTITY_COLORS.table.fill,
    label: ENTITY_COLORS.table.hex,
  },
  figure: {
    border: ENTITY_COLORS.figure.border,
    fill: ENTITY_COLORS.figure.fill,
    label: ENTITY_COLORS.figure.hex,
  },
  footnote: {
    border: ENTITY_COLORS.footnote.border,
    fill: ENTITY_COLORS.footnote.fill,
    label: ENTITY_COLORS.footnote.hex,
  },
  summary: {
    border: ENTITY_COLORS.summary.border,
    fill: ENTITY_COLORS.summary.fill,
    label: ENTITY_COLORS.summary.hex,
  },
  paragraph: {
    border: ENTITY_COLORS.paragraph.border,
    fill: ENTITY_COLORS.paragraph.fill,
    label: ENTITY_COLORS.paragraph.hex,
  },
  signature: {
    border: ENTITY_COLORS.signature.border,
    fill: ENTITY_COLORS.signature.fill,
    label: ENTITY_COLORS.signature.hex,
  },
};

// ============================================================================
// Main Component
// ============================================================================

export default function PDFViewer({
  pdfPath,
  initialPage = 1,
  onPageChange,
  entities = [],
  showEntityOverlays = false,
  onEntityClick,
  pageDimensions = {},
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [scale, setScale] = useState<number>(1.0);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchProvider, setSearchProvider] =
    useState<DomSearchProvider | null>(null);

  const { total, currentIndex, isSearching, search, next, prev, clear } =
    useSearch(searchProvider);

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

  useEffect(() => {
    if (containerRef.current && numPages > 0) {
      setSearchProvider(new DomSearchProvider(containerRef.current));
    }
  }, [numPages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (e.key === 'Escape' && isSearchOpen) {
        e.preventDefault();
        setIsSearchOpen(false);
        setSearchQuery('');
        clear();
        return;
      }

      if (isInput) return;

      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }

      if (total > 0) {
        if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          next();
        } else if (e.key === 'N' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          prev();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, total, next, prev, clear]);

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (searchQuery.trim()) {
        search(searchQuery);
      }
    },
    [searchQuery, search],
  );

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    clear();
  }, [clear]);

  const onDocumentLoadSuccess = ({ numPages: pages }: { numPages: number }) => {
    setNumPages(pages);
    // Use initialPage but clamp to valid range
    setCurrentPage(Math.max(1, Math.min(initialPage, pages)));
  };

  // Sync with external page changes
  useEffect(() => {
    if (initialPage && numPages > 0 && initialPage !== currentPage) {
      setCurrentPage(Math.max(1, Math.min(initialPage, numPages)));
    }
  }, [initialPage, numPages]);

  const handlePageChange = (page: number) => {
    const newPage = Math.max(1, Math.min(page, numPages));
    setCurrentPage(newPage);
    onPageChange?.(newPage);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    // Estimate which page is visible based on scroll position
    const scrollRatio =
      container.scrollTop / (container.scrollHeight - container.clientHeight);
    const estimatedPage = Math.max(1, Math.ceil(scrollRatio * numPages));
    if (estimatedPage !== currentPage && estimatedPage <= numPages) {
      setCurrentPage(estimatedPage);
      onPageChange?.(estimatedPage);
    }
  };

  // Get entities for a specific page
  const getPageEntities = useCallback(
    (pageNum: number) => {
      if (!showEntityOverlays || !entities.length) return [];
      return entities.filter((e) => e.page === pageNum);
    },
    [entities, showEntityOverlays],
  );

  // Handle entity click on overlay
  const handleOverlayClick = useCallback(
    (entity: EntityOverlay, event: React.MouseEvent) => {
      event.stopPropagation();
      onEntityClick?.(entity, event);
    },
    [onEntityClick],
  );

  // Track rendered page dimensions for overlay scaling
  const [renderedPageDimensions, setRenderedPageDimensions] = useState<
    Record<number, { width: number; height: number }>
  >({});

  // Scale bbox from DocAI coordinates to rendered coordinates
  const scaleBbox = useCallback(
    (
      bbox: BoundingBox,
      pageNum: number,
      renderedWidth: number,
      renderedHeight: number,
    ) => {
      const docDims = pageDimensions[pageNum];
      if (!docDims || !docDims.width || !docDims.height) {
        // Fallback: assume bbox is already in percentage
        return {
          left: bbox.x * renderedWidth,
          top: bbox.y * renderedHeight,
          width: bbox.width * renderedWidth,
          height: bbox.height * renderedHeight,
        };
      }
      // Scale from DocAI page dimensions to rendered dimensions
      const scaleX = renderedWidth / docDims.width;
      const scaleY = renderedHeight / docDims.height;
      return {
        left: bbox.x * scaleX,
        top: bbox.y * scaleY,
        width: bbox.width * scaleX,
        height: bbox.height * scaleY,
      };
    },
    [pageDimensions],
  );

  // Handle page render complete to capture dimensions
  const handlePageRenderSuccess = useCallback((pageNum: number) => {
    // Get the rendered canvas dimensions after a small delay
    setTimeout(() => {
      const pageDiv = pageRefs.current.get(pageNum);
      if (pageDiv) {
        const canvas = pageDiv.querySelector('canvas');
        if (canvas) {
          setRenderedPageDimensions((prev) => ({
            ...prev,
            [pageNum]: { width: canvas.width, height: canvas.height },
          }));
        }
      }
    }, 50);
  }, []);

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
    <div className="flex flex-col h-full min-h-0 bg-slate-50">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-slate-200 bg-white flex items-center justify-between gap-2 shrink-0 flex-none">
        {/* Page navigation */}
        <div className="text-xs font-mono text-slate-600 flex items-center gap-1">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="w-6 h-6 hover:bg-slate-100 rounded text-slate-600 flex items-center justify-center disabled:opacity-30"
          >
            <svg
              className="w-3 h-3"
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
            <svg
              className="w-3 h-3"
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

        <div className="flex items-center gap-2">
          {!isSearchOpen && (
            <button
              onClick={() => {
                setIsSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 0);
              }}
              className="w-6 h-6 hover:bg-slate-100 rounded text-slate-500 flex items-center justify-center"
              title="Search (press /)"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>
          )}
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
      </div>

      {isSearchOpen && (
        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center gap-2 shrink-0">
          <form
            onSubmit={handleSearchSubmit}
            className="flex-1 flex items-center gap-2"
          >
            <div className="relative flex-1 max-w-md">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in document..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <button
              type="submit"
              disabled={!searchQuery.trim() || isSearching}
              className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {total > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <span className="font-mono">
                {currentIndex + 1}/{total}
              </span>
              <button
                onClick={() => prev()}
                className="w-6 h-6 hover:bg-slate-200 rounded flex items-center justify-center"
                title="Previous (N)"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 15l7-7 7 7"
                  />
                </svg>
              </button>
              <button
                onClick={() => next()}
                className="w-6 h-6 hover:bg-slate-200 rounded flex items-center justify-center"
                title="Next (n)"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            </div>
          )}

          <button
            onClick={closeSearch}
            className="w-6 h-6 hover:bg-slate-200 rounded flex items-center justify-center text-slate-500"
            title="Close (Esc)"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* PDF Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 flex flex-col items-center min-h-0"
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
          {Array.from({ length: numPages }, (_, index) => {
            const pageNum = index + 1;
            const pageEntities = getPageEntities(pageNum);
            const renderedDims = renderedPageDimensions[pageNum];

            return (
              <div
                key={`page_${pageNum}`}
                className="mb-4 shadow-lg relative"
                ref={(el) => {
                  if (el) pageRefs.current.set(pageNum, el);
                }}
              >
                <Page
                  pageNumber={pageNum}
                  width={pageWidth * scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  onRenderSuccess={() => handlePageRenderSuccess(pageNum)}
                />

                {/* Entity Overlays */}
                {showEntityOverlays &&
                  pageEntities.length > 0 &&
                  renderedDims && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        width: pageWidth * scale,
                        height:
                          (renderedDims.height / renderedDims.width) *
                          pageWidth *
                          scale,
                      }}
                    >
                      {pageEntities.map((entity) => {
                        if (!entity.bbox) return null;
                        const colors =
                          OVERLAY_COLORS[entity.type] ||
                          OVERLAY_COLORS.paragraph;
                        const scaled = scaleBbox(
                          entity.bbox,
                          pageNum,
                          pageWidth * scale,
                          (renderedDims.height / renderedDims.width) *
                            pageWidth *
                            scale,
                        );

                        return (
                          <div
                            key={entity.id}
                            className="absolute pointer-events-auto cursor-pointer transition-all hover:brightness-110"
                            style={{
                              left: scaled.left,
                              top: scaled.top,
                              width: scaled.width,
                              height: scaled.height,
                              border: `2px solid ${colors.border}`,
                              backgroundColor: colors.fill,
                              borderRadius: 2,
                            }}
                            onClick={(e) => handleOverlayClick(entity, e)}
                            title={
                              entity.title || `${entity.type} #${entity.id}`
                            }
                          >
                            {/* Entity label */}
                            <span
                              className="absolute -top-5 left-0 text-[10px] font-medium px-1 py-0.5 rounded whitespace-nowrap"
                              style={{
                                backgroundColor: colors.label,
                                color: 'white',
                              }}
                            >
                              {entity.type}
                              {entity.title ? `: ${entity.title}` : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>
            );
          })}
        </Document>
      </div>
    </div>
  );
}
