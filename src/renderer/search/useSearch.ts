import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ISearchProvider,
  SearchState,
  SearchOptions,
  SearchMatch,
} from './types';

const initialState: SearchState = {
  query: '',
  matches: [],
  currentIndex: -1,
  total: 0,
  isSearching: false,
};

export function useSearch(provider: ISearchProvider | null) {
  const [state, setState] = useState<SearchState>(initialState);
  const providerRef = useRef(provider);
  providerRef.current = provider;

  useEffect(() => {
    if (!provider) return;

    setState(provider.state);
    const unsubscribe = provider.subscribe(setState);

    return () => {
      unsubscribe();
      provider.dispose?.();
    };
  }, [provider]);

  const search = useCallback(
    (query: string, options?: SearchOptions) =>
      providerRef.current?.search(query, options),
    [],
  );

  const next = useCallback(
    (): SearchMatch | null => providerRef.current?.next() ?? null,
    [],
  );

  const prev = useCallback(
    (): SearchMatch | null => providerRef.current?.prev() ?? null,
    [],
  );

  const goTo = useCallback(
    (index: number): SearchMatch | null =>
      providerRef.current?.goTo(index) ?? null,
    [],
  );

  const clear = useCallback(() => providerRef.current?.clear(), []);

  return { ...state, search, next, prev, goTo, clear };
}
