import { useState, useEffect } from 'react';

interface ActiveRunState {
  runId: string;
  nodeId: string;
  nodeType: string;
  workspacePath: string;
  totalPages: number;
  currentPage: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  error?: string;
}

/**
 * Global status indicator for background extractions.
 * Shows in document browser when extractions are running.
 * VSCode-style: small, unobtrusive, expandable.
 */
export function GlobalExtractionStatus() {
  const [activeRuns, setActiveRuns] = useState<ActiveRunState[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Poll for active runs (simple approach, like VSCode's progress polling)
    const poll = async () => {
      try {
        const runs = await window.electron.ipcRenderer.invoke('workflow:get-all-active-runs');
        setActiveRuns(runs || []);
      } catch {
        // Silent fail
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

  if (activeRuns.length === 0) {
    return null;
  }

  const totalProgress = activeRuns.reduce((acc, run) => {
    return acc + (run.currentPage / run.totalPages);
  }, 0) / activeRuns.length * 100;

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all"
      >
        {/* Spinning indicator */}
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
        </span>

        <span>
          {activeRuns.length} extraction{activeRuns.length > 1 ? 's' : ''} running
        </span>

        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-slate-200 z-50 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Background Extractions
              </span>
              <span className="text-xs text-blue-600 font-mono">
                {Math.round(totalProgress)}%
              </span>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {activeRuns.map((run) => {
              const percent = Math.round((run.currentPage / run.totalPages) * 100);
              const name = run.workspacePath.split('/').pop() || 'Document';

              return (
                <div key={run.runId} className="px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-700 truncate max-w-[180px]" title={name}>
                      {name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {run.currentPage}/{run.totalPages}
                    </span>
                  </div>
                  <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
