import type {
  ISearchProvider,
  SearchMatch,
  SearchState,
  SearchOptions,
} from './types';

const HIGHLIGHT_CLASS = 'okra-search-highlight';
const CURRENT_CLASS = 'okra-search-current';

export class DomSearchProvider implements ISearchProvider {
  readonly id = 'dom-text-layer';
  readonly name = 'DOM Text Layer Search';

  private _state: SearchState = {
    query: '',
    matches: [],
    currentIndex: -1,
    total: 0,
    isSearching: false,
  };

  private listeners = new Set<(state: SearchState) => void>();
  private container: HTMLElement;
  private highlights: HTMLElement[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  get state(): SearchState {
    return this._state;
  }

  async search(query: string, options: SearchOptions = {}): Promise<void> {
    this.clear();

    if (!query.trim()) return;

    this._state = { ...this._state, query, isSearching: true };
    this.notify();

    try {
      await new Promise((r) => setTimeout(r, 100));
      const matches = this.findMatches(query, options);
      this._state = {
        query,
        matches,
        currentIndex: matches.length > 0 ? 0 : -1,
        total: matches.length,
        isSearching: false,
      };

      this.renderHighlights();
      if (matches.length > 0) this.scrollToMatch(0);
    } catch (err) {
      this._state = {
        ...this._state,
        isSearching: false,
        error: err instanceof Error ? err.message : 'Search failed',
      };
    }

    this.notify();
  }

  next(): SearchMatch | null {
    if (this._state.total === 0) return null;
    const newIndex = (this._state.currentIndex + 1) % this._state.total;
    return this.goTo(newIndex);
  }

  prev(): SearchMatch | null {
    if (this._state.total === 0) return null;
    const newIndex =
      this._state.currentIndex <= 0
        ? this._state.total - 1
        : this._state.currentIndex - 1;
    return this.goTo(newIndex);
  }

  goTo(index: number): SearchMatch | null {
    if (index < 0 || index >= this._state.total) return null;

    this._state = { ...this._state, currentIndex: index };
    this.updateCurrentHighlight();
    this.scrollToMatch(index);
    this.notify();

    return this._state.matches[index];
  }

  clear(): void {
    this.removeHighlights();
    this._state = {
      query: '',
      matches: [],
      currentIndex: -1,
      total: 0,
      isSearching: false,
    };
    this.notify();
  }

  subscribe(listener: (state: SearchState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.clear();
    this.listeners.clear();
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this._state);
      } catch {}
    });
  }

  private findMatches(query: string, options: SearchOptions): SearchMatch[] {
    const matches: SearchMatch[] = [];
    let textLayers = this.container.querySelectorAll(
      '.react-pdf__Page__textContent',
    );

    if (textLayers.length === 0) {
      textLayers = this.container.querySelectorAll('.textLayer');
    }

    const flags = options.caseSensitive ? 'g' : 'gi';
    const pattern = options.regex
      ? new RegExp(query, flags)
      : new RegExp(this.escapeRegex(query), flags);

    textLayers.forEach((layer, pageIndex) => {
      const page = pageIndex + 1;
      const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      let nodeOffset = 0;

      while ((node = walker.nextNode() as Text)) {
        const text = node.textContent || '';
        let match: RegExpExecArray | null;

        pattern.lastIndex = 0;
        while ((match = pattern.exec(text)) !== null) {
          if (options.maxResults && matches.length >= options.maxResults) {
            return matches;
          }

          matches.push({
            id: `match-${page}-${nodeOffset + match.index}`,
            page,
            charIndex: nodeOffset + match.index,
            text: match[0],
          });
        }
        nodeOffset += text.length;
      }
    });

    return matches;
  }

  private renderHighlights(): void {
    this.removeHighlights();

    const textLayers = this.container.querySelectorAll(
      '.react-pdf__Page__textContent',
    );

    for (const match of this._state.matches) {
      const layer = textLayers[match.page - 1];
      if (!layer) continue;

      const highlight = this.createHighlightForMatch(layer, match);
      if (highlight) this.highlights.push(highlight);
    }

    this.updateCurrentHighlight();
  }

  private createHighlightForMatch(
    layer: Element,
    match: SearchMatch,
  ): HTMLElement | null {
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    let offset = 0;

    while ((node = walker.nextNode() as Text)) {
      const text = node.textContent || '';
      const nodeEnd = offset + text.length;

      if (match.charIndex >= offset && match.charIndex < nodeEnd) {
        const localIndex = match.charIndex - offset;
        const range = document.createRange();

        try {
          range.setStart(node, localIndex);
          range.setEnd(
            node,
            Math.min(localIndex + match.text.length, text.length),
          );

          const rect = range.getBoundingClientRect();
          const layerRect = layer.getBoundingClientRect();

          const highlight = document.createElement('div');
          highlight.className = HIGHLIGHT_CLASS;
          highlight.dataset.matchId = match.id;
          Object.assign(highlight.style, {
            position: 'absolute',
            left: `${rect.left - layerRect.left}px`,
            top: `${rect.top - layerRect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            background: 'rgba(255, 213, 0, 0.4)',
            pointerEvents: 'none',
            zIndex: '1',
            borderRadius: '2px',
          });

          (layer as HTMLElement).style.position = 'relative';
          layer.appendChild(highlight);

          return highlight;
        } catch {
          return null;
        }
      }
      offset = nodeEnd;
    }
    return null;
  }

  private updateCurrentHighlight(): void {
    for (const h of this.highlights) {
      h.classList.remove(CURRENT_CLASS);
      h.style.background = 'rgba(255, 213, 0, 0.4)';
    }

    if (this._state.currentIndex >= 0) {
      const currentMatch = this._state.matches[this._state.currentIndex];
      const current = this.highlights.find(
        (h) => h.dataset.matchId === currentMatch?.id,
      );
      if (current) {
        current.classList.add(CURRENT_CLASS);
        current.style.background = 'rgba(255, 140, 0, 0.6)';
      }
    }
  }

  private scrollToMatch(index: number): void {
    const match = this._state.matches[index];
    if (!match) return;

    const highlight = this.highlights.find(
      (h) => h.dataset.matchId === match.id,
    );
    highlight?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  private removeHighlights(): void {
    for (const h of this.highlights) h.remove();
    this.highlights = [];
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
