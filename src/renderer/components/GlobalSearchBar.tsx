import React, { useState, useRef, useEffect, useCallback } from 'react';

interface LocalWorkspace {
  id: string;
  name: string;
  pdfPath: string;
  workspacePath: string;
  createdAt: string;
  lastOpenedAt: string;
  pageCount?: number;
  extractionStatus: string;
}

interface SearchMatch {
  page: number;
  line: string;
}

interface GlobalSearchResult {
  workspaceId: string;
  workspaceName: string;
  filePath: string;
  matches: SearchMatch[];
}

interface GlobalSearchBarProps {
  onSelectWorkspace: (workspace: { id: string; name: string; workspacePath: string; page?: number }) => void;
  /** Number of documents to show in collapsed state */
  documentCount?: number;
  className?: string;
}

type SearchMode = 'workspaces' | 'content';

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 30) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function GlobalSearchBar({ onSelectWorkspace, documentCount, className = '' }: GlobalSearchBarProps) {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('workspaces');
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [workspaces, setWorkspaces] = useState<LocalWorkspace[]>([]);
  const [contentResults, setContentResults] = useState<GlobalSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load workspaces on mount and when expanded
  useEffect(() => {
    const loadWorkspaces = async () => {
      try {
        const result = await window.electron.ipcRenderer.invoke('workspace:list-local');
        setWorkspaces(result || []);
      } catch (err) {
        console.error('Failed to load workspaces:', err);
      }
    };
    loadWorkspaces();
  }, [isExpanded]);

  // Filter workspaces by name
  const filteredWorkspaces = workspaces.filter((ws) =>
    ws.name.toLowerCase().includes(query.toLowerCase())
  );

  // Content search with debounce
  useEffect(() => {
    if (searchMode !== 'content' || query.length < 2) {
      setContentResults([]);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await window.electron.ipcRenderer.invoke('search:global', query);
        setContentResults(results || []);
      } catch (err) {
        console.error('Global search failed:', err);
        setContentResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, searchMode]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredWorkspaces.length, contentResults.length, searchMode]);

  const getResults = () => {
    if (searchMode === 'workspaces') {
      return filteredWorkspaces;
    }
    return contentResults;
  };

  const results = getResults();

  const handleSelect = useCallback((index: number) => {
    if (searchMode === 'workspaces') {
      const ws = filteredWorkspaces[index];
      if (ws) {
        onSelectWorkspace({
          id: ws.id,
          name: ws.name,
          workspacePath: ws.workspacePath,
        });
        setIsExpanded(false);
        setQuery('');
      }
    } else {
      const result = contentResults[index];
      if (result) {
        const firstPage = result.matches[0]?.page || 1;
        onSelectWorkspace({
          id: result.workspaceId,
          name: result.workspaceName,
          workspacePath: result.filePath,
          page: firstPage,
        });
        setIsExpanded(false);
        setQuery('');
      }
    }
  }, [searchMode, filteredWorkspaces, contentResults, onSelectWorkspace]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsExpanded(false);
      setQuery('');
      return;
    }

    if (e.key === 'Tab' && isExpanded) {
      e.preventDefault();
      setSearchMode((prev) => (prev === 'workspaces' ? 'content' : 'workspaces'));
      return;
    }

    if (!isExpanded || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        handleSelect(selectedIndex);
        break;
    }
  }, [isExpanded, results.length, selectedIndex, handleSelect]);

  // Global ⌘K shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsExpanded(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isExpanded]);

  // Mode filter tabs
  const FilterTabs = () => (
    <div className="flex items-center px-2 py-2 border-b border-sidebar-border bg-slate-50/50 gap-2">
      <button
        onClick={() => setSearchMode('workspaces')}
        className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
          searchMode === 'workspaces'
            ? 'bg-white text-ink shadow-sm ring-1 ring-black/5'
            : 'text-sidebar-text hover:text-ink hover:bg-black/5'
        }`}
      >
        <span>📄</span>
        Documents
      </button>
      <button
        onClick={() => setSearchMode('content')}
        className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
          searchMode === 'content'
            ? 'bg-white text-ink shadow-sm ring-1 ring-black/5'
            : 'text-sidebar-text hover:text-ink hover:bg-black/5'
        }`}
      >
        <span>🔍</span>
        Content
      </button>
    </div>
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Search Bar Input Area */}
      <div
        className={`group flex items-center gap-3 px-3 py-2.5 bg-white border rounded-xl transition-all duration-200 ease-out ${
          isExpanded
            ? 'border-okra-yellow ring-4 ring-okra-yellow/10 shadow-sm'
            : 'border-sidebar-border hover:border-sidebar-text/50 shadow-sm hover:shadow'
        }`}
      >
        <svg 
          className={`w-5 h-5 transition-colors ${isExpanded ? 'text-okra-yellow-dark' : 'text-sidebar-text group-hover:text-ink'}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsExpanded(true)}
          placeholder="Search documents..."
          className="flex-1 text-sm bg-transparent outline-none text-ink placeholder:text-sidebar-text/70"
        />

        {/* Right side items */}
        <div className="flex items-center gap-2">
          {isSearching && (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-sidebar-border border-t-okra-yellow mr-1" />
          )}
          
          {documentCount !== undefined && !isExpanded && (
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-xs font-medium text-sidebar-text border border-slate-200">
              {documentCount} docs
            </span>
          )}

          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-medium text-sidebar-text">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
      </div>

      {/* Dropdown Results */}
      {isExpanded && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-sidebar-border/80 rounded-xl shadow-xl shadow-black/5 max-h-[32rem] overflow-hidden z-50 ring-1 ring-black/5 backdrop-blur-xl">
          <FilterTabs />

          <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            {searchMode === 'workspaces' ? (
              // Workspace results
              filteredWorkspaces.length > 0 ? (
                <div className="py-1">
                  <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-sidebar-text/80 bg-slate-50/50 sticky top-0 backdrop-blur-sm z-10">
                    {query ? `Found ${filteredWorkspaces.length} documents` : 'Recent Documents'}
                  </div>
                  {filteredWorkspaces.slice(0, 10).map((ws, index) => (
                    <button
                      key={ws.id}
                      onClick={() => handleSelect(index)}
                      className={`w-full text-left px-4 py-3 border-l-2 transition-all ${
                        index === selectedIndex 
                          ? 'bg-okra-yellow/5 border-okra-yellow' 
                          : 'bg-transparent border-transparent hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${index === selectedIndex ? 'bg-white shadow-sm' : 'bg-slate-100'}`}>
                          <span className="text-xl">📄</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-ink truncate">
                              {ws.name}
                            </span>
                            <span className="text-xs text-sidebar-text flex-shrink-0">
                              {formatRelativeTime(ws.lastOpenedAt || ws.createdAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {ws.extractionStatus === 'completed' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                                Ready
                              </span>
                            ) : ws.extractionStatus === 'extracting' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                                Extracting
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded-full">
                                Pending
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-sidebar-text">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm">No documents found</p>
                </div>
              )
            ) : (
              // Content search results
              query.length < 2 ? (
                <div className="flex flex-col items-center justify-center py-12 text-sidebar-text">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="text-sm">Type to search content...</p>
                </div>
              ) : isSearching ? (
                <div className="flex flex-col items-center justify-center py-12 text-sidebar-text">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-okra-yellow mb-3" />
                  <p className="text-sm">Searching contents...</p>
                </div>
              ) : contentResults.length > 0 ? (
                <div className="py-1">
                  <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-sidebar-text/80 bg-slate-50/50 sticky top-0 backdrop-blur-sm z-10">
                    Found matches in {contentResults.length} documents
                  </div>
                  {contentResults.slice(0, 10).map((result, index) => (
                    <button
                      key={result.workspaceId}
                      onClick={() => handleSelect(index)}
                      className={`w-full text-left px-4 py-3 border-l-2 transition-all ${
                        index === selectedIndex 
                          ? 'bg-okra-yellow/5 border-okra-yellow' 
                          : 'bg-transparent border-transparent hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg mt-0.5 ${index === selectedIndex ? 'bg-white shadow-sm' : 'bg-slate-100'}`}>
                          <span className="text-xl">📄</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-sm font-medium text-ink truncate">
                              {result.workspaceName}
                            </span>
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-okra-yellow/20 text-okra-yellow-dark rounded-full">
                              {result.matches.length} matches
                            </span>
                          </div>
                          <div className="space-y-1">
                            {result.matches.slice(0, 2).map((match, i) => (
                              <div key={i} className="flex gap-2 text-xs text-sidebar-text/80 font-mono bg-slate-50/50 p-1 rounded border border-slate-100">
                                <span className="text-ink/50 select-none">p.{match.page}</span>
                                <span className="truncate" dangerouslySetInnerHTML={{ 
                                  __html: match.line
                                    .replace(/</g, '&lt;')
                                    .replace(/>/g, '&gt;') 
                                }} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-sidebar-text">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm">No matches found for "{query}"</p>
                </div>
              )
            )}
          </div>

          {/* Footer hints */}
          <div className="px-3 py-2 border-t border-sidebar-border bg-slate-50/80 backdrop-blur flex items-center justify-between text-[10px] text-sidebar-text font-medium">
            <div className="flex gap-3">
              <span className="flex items-center gap-1.5">
                <kbd className="min-w-[18px] h-[18px] flex items-center justify-center bg-white border border-slate-200 rounded shadow-sm font-sans">↕</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="min-w-[18px] h-[18px] flex items-center justify-center bg-white border border-slate-200 rounded shadow-sm font-sans">⇥</kbd>
                switch mode
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="min-w-[18px] h-[18px] flex items-center justify-center bg-white border border-slate-200 rounded shadow-sm font-sans">↵</kbd>
                open
              </span>
            </div>
            <span className="flex items-center gap-1.5">
              <kbd className="min-w-[18px] h-[18px] flex items-center justify-center bg-white border border-slate-200 rounded shadow-sm font-sans">esc</kbd>
              close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
