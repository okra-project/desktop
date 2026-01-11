import { useExtraction } from '../providers/ExtractionContext';

export function ExtractionOverlay() {
  const { status, progress, totalPages, cancelExtraction } = useExtraction();

  if (status !== 'extracting') return null;

  const currentPage = progress?.currentPage ?? 0;
  const percent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">📄</div>
          <h3 className="text-lg font-semibold text-ink">Extracting Text</h3>
          <p className="text-sm text-sidebar-text mt-1">
            Processing page {currentPage} of {totalPages}
          </p>
        </div>

        <div className="mb-4">
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-okra-yellow transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
          </div>
          <p className="text-xs text-sidebar-text text-center mt-1">{percent}%</p>
        </div>

        <button
          onClick={cancelExtraction}
          className="w-full py-2 text-sm text-sidebar-text hover:text-ink border border-sidebar-border rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
