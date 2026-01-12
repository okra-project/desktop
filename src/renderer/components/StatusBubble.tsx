import { useState, useMemo } from 'react';
import { useAppSelector } from '../store';
import {
  selectExtractionProgress,
  selectRecentEvents,
} from '../store/processingEventsSlice';

export function StatusBubble() {
  const [expanded, setExpanded] = useState(false);
  const progress = useAppSelector(selectExtractionProgress);
  const selectRecent5 = useMemo(() => selectRecentEvents(5), []);
  const recentEvents = useAppSelector(selectRecent5);

  if (progress.status === 'idle') {
    return null;
  }

  const isProcessing = progress.status === 'processing';
  const isComplete = progress.status === 'completed';
  const isError = progress.status === 'error';

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
          isProcessing
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            : isComplete
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
        }`}
      >
        {isProcessing && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
        )}
        {isComplete && (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {isError && (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        )}

        {isProcessing ? (
          <span>
            {progress.provider}: {progress.pagesCompleted}/{progress.totalPages}{' '}
            pages
            {progress.progressPercent > 0 && ` (${progress.progressPercent}%)`}
          </span>
        ) : isComplete ? (
          <span>{progress.entitiesFound} entities extracted</span>
        ) : (
          <span>Extraction failed</span>
        )}

        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
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

      {expanded && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-slate-200 z-50 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Extraction Progress
              </span>
              {isProcessing && (
                <span className="text-xs text-blue-600 font-mono">
                  {progress.progressPercent}%
                </span>
              )}
            </div>
            {progress.totalPages > 0 && (
              <div className="mt-1.5 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    isProcessing
                      ? 'bg-blue-500'
                      : isComplete
                        ? 'bg-green-500'
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${progress.progressPercent}%` }}
                />
              </div>
            )}
          </div>

          <div className="max-h-48 overflow-y-auto">
            {recentEvents.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                No events yet
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentEvents.map((event) => (
                  <div key={event.id} className="px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          event.type === 'extraction_error'
                            ? 'bg-red-500'
                            : event.type === 'extraction_complete'
                              ? 'bg-green-500'
                              : 'bg-blue-500'
                        }`}
                      />
                      <span className="text-slate-600 truncate">
                        {event.message}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
