export interface SearchMatch {
  id: string;
  page: number;
  charIndex: number;
  text: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface SearchState {
  query: string;
  matches: SearchMatch[];
  currentIndex: number;
  total: number;
  isSearching: boolean;
  error?: string;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  highlightAll?: boolean;
  maxResults?: number;
}

export interface ISearchProvider {
  readonly id: string;
  readonly name: string;
  readonly state: SearchState;
  search(query: string, options?: SearchOptions): Promise<void>;
  next(): SearchMatch | null;
  prev(): SearchMatch | null;
  goTo(index: number): SearchMatch | null;
  clear(): void;
  subscribe(listener: (state: SearchState) => void): () => void;
  dispose?(): void;
}
