import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useAppDispatch } from '../store';
import { setCurrentPage } from '../store/viewerSlice';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface SelectorResult {
  id: string;
  page: number;
  type: string;
  text: string;
  bbox: { xMin: number; yMin: number; xMax: number; yMax: number };
}

interface QueryResultsPanelProps {
  selector?: string | null;
  results?: SelectorResult[] | null;
  workspaceId: string;
  workspacePath: string;
  onClose?: () => void;
}

export function QueryResultsPanel({
  selector,
  results: preloadedResults,
  workspacePath,
  onClose,
}: QueryResultsPanelProps) {
  const dispatch = useAppDispatch();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const fetchPdfPath = async () => {
      try {
        const files = await window.electron.ipcRenderer.invoke(
          'workspace:list-files',
          workspacePath,
        );
        const pdfFile = files?.find((f: string) =>
          f.toLowerCase().endsWith('.pdf'),
        );
        if (pdfFile) {
          setPdfUrl(`file://${workspacePath}/${pdfFile}`);
        }
      } catch {}
    };
    fetchPdfPath();
  }, [workspacePath]);

  const results = preloadedResults || [];

  const filteredResults = useMemo(() => {
    if (!filter.trim()) return results;
    const lower = filter.toLowerCase();
    return results.filter(
      (r) =>
        r.text.toLowerCase().includes(lower) ||
        r.type.toLowerCase().includes(lower),
    );
  }, [results, filter]);

  const handleResultClick = useCallback(
    (result: SelectorResult) => {
      dispatch(setCurrentPage(result.page));
    },
    [dispatch],
  );

  if (!selector) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center text-slate-400 text-sm">
        No active query
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
        <div className="text-sm font-medium text-slate-700">
          {results.length} Results
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded"
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

      <div className="px-3 py-1.5 border-b border-slate-100 text-xs text-slate-500 bg-slate-50 font-mono">
        {selector}
      </div>

      <div className="px-3 py-2 border-b border-slate-100">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter..."
          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:border-blue-400"
        />
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {filteredResults.length === 0 ? (
          <div className="p-4 text-sm text-slate-400 text-center">
            No matches found
          </div>
        ) : (
          filteredResults.map((result) => (
            <button
              key={result.id}
              onClick={() => handleResultClick(result)}
              className="w-full text-left flex gap-3 p-2 hover:bg-slate-50 transition-colors"
            >
              <div className="w-14 h-18 bg-slate-100 rounded overflow-hidden flex-shrink-0 relative">
                {pdfUrl ? (
                  <Document file={pdfUrl} loading={null} error={null}>
                    <Page
                      pageNumber={result.page}
                      width={56}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  </Document>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-mono">
                    {result.page}
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[9px] text-center py-0.5">
                  p.{result.page}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase"
                    style={{
                      backgroundColor: getTypeColor(result.type),
                      color: '#fff',
                    }}
                  >
                    {result.type}
                  </span>
                </div>
                <p className="text-xs text-slate-600 line-clamp-3">
                  {result.text || '(content)'}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="px-3 py-2 border-t border-slate-200 text-xs text-slate-400 bg-slate-50">
        Click result to navigate
      </div>
    </div>
  );
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    table: '#10b981',
    figure: '#8b5cf6',
    footnote: '#f59e0b',
    signature: '#ef4444',
    callout: '#3b82f6',
    text: '#6b7280',
  };
  return colors[type] ?? '#6b7280';
}

export default QueryResultsPanel;
