import React, { useState, useEffect, useCallback } from 'react';

interface Document {
  uuid: string;
  file_name: string;
  file_size: number;
  upload_date: string;
  document_type: string;
  thumbnail_url?: string;
  verification_progress?: {
    totalPages?: number;
    extractionStatus?: string;
  };
}

interface DocumentBrowserProps {
  onSelectDocument: (doc: Document) => void;
  onLogout: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function DocumentBrowser({ onSelectDocument, onLogout }: DocumentBrowserProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bootstrappingDoc, setBootstrappingDoc] = useState<string | null>(null);

  const fetchLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electron.ipcRenderer.invoke('library:fetch');

      if (result.success) {
        setDocuments(result.documents);
      } else {
        setError(result.error || 'Failed to fetch documents');
        if (result.error?.includes('expired') || result.error?.includes('login')) {
          onLogout();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [onLogout]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const handleConnectLocalAgent = async (doc: Document) => {
    setBootstrappingDoc(doc.uuid);
    setError(null);

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'workspace:bootstrap',
        doc.uuid,
        doc.file_name,
      );

      if (result.success) {
        onSelectDocument(doc);
      } else {
        setError(result.error || 'Failed to set up workspace');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBootstrappingDoc(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-cream">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-okra-orange mx-auto mb-4"></div>
          <p className="text-sidebar-text">Loading your documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-cream">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-sidebar-border bg-white">
        <div>
          <h1 className="text-2xl font-semibold font-serif text-ink">Your Documents</h1>
          <p className="text-sm text-sidebar-text">
            Select a document to connect your local Claude agent
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={fetchLibrary}
            className="px-3 py-2 text-sm text-sidebar-text hover:text-ink hover:bg-sidebar-bg-hover rounded-lg transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={onLogout}
            className="px-3 py-2 text-sm text-sidebar-text hover:text-ink hover:bg-sidebar-bg-hover rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Document list */}
      <div className="flex-1 overflow-auto p-6">
        {documents.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📄</div>
            <h3 className="text-lg font-medium text-ink mb-2">
              No documents yet
            </h3>
            <p className="text-sidebar-text">
              Upload documents at{' '}
              <a
                href="https://app.okrapdf.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-okra-orange hover:text-okra-orange/80 underline"
              >
                app.okrapdf.com
              </a>
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <div
                key={doc.uuid}
                className="bg-white rounded-lg border border-sidebar-border p-4 hover:shadow-md transition-shadow"
              >
                {/* Thumbnail */}
                <div className="aspect-[4/3] bg-sidebar-bg rounded-lg mb-3 overflow-hidden">
                  {doc.thumbnail_url ? (
                    <img
                      src={doc.thumbnail_url}
                      alt={doc.file_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl text-sidebar-text">
                      📄
                    </div>
                  )}
                </div>

                {/* Document info */}
                <h3 className="font-medium text-ink truncate mb-1" title={doc.file_name}>
                  {doc.file_name}
                </h3>
                <div className="flex items-center gap-2 text-sm text-sidebar-text mb-3">
                  <span>{formatFileSize(doc.file_size)}</span>
                  <span>•</span>
                  <span>{formatDate(doc.upload_date)}</span>
                  {doc.verification_progress?.totalPages && (
                    <>
                      <span>•</span>
                      <span>{doc.verification_progress.totalPages} pages</span>
                    </>
                  )}
                </div>

                {/* Actions */}
                <button
                  onClick={() => handleConnectLocalAgent(doc)}
                  disabled={bootstrappingDoc === doc.uuid}
                  className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                    bootstrappingDoc === doc.uuid
                      ? 'bg-gray-100 text-gray-400 cursor-wait'
                      : 'bg-okra-yellow text-ink hover:bg-okra-yellow-hover'
                  }`}
                >
                  {bootstrappingDoc === doc.uuid ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin h-4 w-4 border-2 border-ink border-t-transparent rounded-full"></span>
                      Setting up...
                    </span>
                  ) : (
                    'Connect Local Agent'
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentBrowser;
