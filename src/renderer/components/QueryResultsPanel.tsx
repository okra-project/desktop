import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

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
  workspaceId: string;
  workspaceName: string;
  workspacePath: string;
}

interface QueryResultsPanelProps {
  selector?: string | null;
  results?: SelectorResult[] | null;
  onClose?: () => void;
  onResultSelect: (result: SelectorResult) => void;
}

export function QueryResultsPanel({
  selector,
  results: preloadedResults,
  onClose,
  onResultSelect,
}: QueryResultsPanelProps) {
  const [pdfUrls, setPdfUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');

  const results = preloadedResults || [];

  useEffect(() => {
    let isActive = true;

    const fetchPdfPaths = async () => {
      const workspacePaths = Array.from(
        new Set(results.map((result) => result.workspacePath).filter(Boolean)),
      );

      const entries = await Promise.all(
        workspacePaths.map(async (path) => {
          try {
            const files = await window.electron.ipcRenderer.invoke(
              'workspace:list-files',
              path,
            );
            const pdfFile = files?.find((file: string) =>
              file.toLowerCase().endsWith('.pdf'),
            );
            if (pdfFile) {
              return [path, `file://${path}/${pdfFile}`] as const;
            }
          } catch {}
          return [path, ''] as const;
        }),
      );

      if (!isActive) return;

      setPdfUrls((prev) => {
        const next = { ...prev };
        entries.forEach(([path, url]) => {
          if (url || !next[path]) {
            next[path] = url;
          }
        });
        return next;
      });
    };

    if (results.length > 0) {
      fetchPdfPaths();
    }

    return () => {
      isActive = false;
    };
  }, [results]);

  const filteredResults = useMemo(() => {
    if (!filter.trim()) return results;
    const lower = filter.toLowerCase();
    return results.filter(
      (r) =>
        r.text.toLowerCase().includes(lower) ||
        r.type.toLowerCase().includes(lower),
    );
  }, [results, filter]);

  const groupedResults = useMemo(() => {
    const groups = new Map<string, SelectorResult[]>();

    filteredResults.forEach((result) => {
      const workspaceName = result.workspaceName || 'Unknown Workspace';
      const group = groups.get(workspaceName) ?? [];
      group.push(result);
      groups.set(workspaceName, group);
    });

    return Array.from(groups.entries()).map(([workspaceName, items]) => ({
      workspaceName,
      items,
    }));
  }, [filteredResults]);

  const handleResultClick = useCallback(
    (result: SelectorResult) => {
      onResultSelect(result);
    },
    [onResultSelect],
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

      <div className="flex-1 overflow-y-auto">
        {filteredResults.length === 0 ? (
          <div className="p-4 text-sm text-slate-400 text-center">
            No matches found
          </div>
        ) : (
          groupedResults.map((group) => (
            <div
              key={`${group.workspaceName}-${group.items[0]?.workspaceId ?? 'workspace'}`}
              className="border-b border-slate-100 last:border-b-0"
            >
              <div className="px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">
                {group.workspaceName}
              </div>
              <div className="divide-y divide-slate-100">
                {group.items.map((result) => {
                  const pdfUrl = pdfUrls[result.workspacePath];
                  return (
                    <button
                      key={`${result.workspaceId}-${result.id}`}
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
                        <div className="space-y-0.5 mb-1">
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            {result.workspaceId}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            {result.workspacePath}
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-3">
                          {result.text || '(content)'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
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
