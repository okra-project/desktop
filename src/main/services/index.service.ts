import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import MiniSearch from 'minisearch';
import chokidar from 'chokidar';
import type { IService } from './index';
import { getAdapter } from './adapters';
import type {
  IndexedBbox,
  PluginManifest,
  SearchOptions,
  SearchResult,
  IndexStats,
  DocumentStats,
  PersistedIndex,
  EntityType,
  IndexUpdatedEvent,
} from '../../shared/types/index';

const OKRAPDF_DIR = path.join(app.getPath('home'), '.okrapdf');
const WORKSPACES_DIR = path.join(OKRAPDF_DIR, 'workspaces');
const INDEX_FILE = path.join(OKRAPDF_DIR, 'search-index.json');

const ENTITY_TYPES: EntityType[] = [
  'table',
  'figure',
  'footnote',
  'signature',
  'callout',
  'text',
  'unknown',
];

function debounce<T extends (...args: string[]) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function debounceVoid(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(), ms);
  };
}

class IndexService implements IService {
  readonly serviceName = 'IndexService';

  private searchIndex: MiniSearch<IndexedBbox>;
  private documentStats: Map<string, DocumentStats> = new Map();
  private watcher: chokidar.FSWatcher | null = null;
  private eventListeners: Array<(event: IndexUpdatedEvent) => void> = [];
  private debouncedPersist: () => void;

  constructor() {
    this.searchIndex = this.createIndex();
    this.debouncedPersist = debounceVoid(() => this.persistIndexNow(), 2000);
  }

  private createIndex(): MiniSearch<IndexedBbox> {
    return new MiniSearch<IndexedBbox>({
      fields: ['text', 'documentName', 'type'],
      storeFields: [
        'id',
        'documentId',
        'documentName',
        'pageNumber',
        'source',
        'type',
        'text',
        'bbox',
      ],
      searchOptions: {
        prefix: true,
        fuzzy: 0.2,
        boost: { documentName: 2, text: 1 },
      },
    });
  }

  async init(): Promise<void> {
    await this.loadOrRebuild();
    this.startWatcher();
  }

  async dispose(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private async loadOrRebuild(): Promise<void> {
    if (fs.existsSync(INDEX_FILE)) {
      try {
        const data = JSON.parse(
          fs.readFileSync(INDEX_FILE, 'utf-8'),
        ) as PersistedIndex;
        this.searchIndex = MiniSearch.loadJSON(
          JSON.stringify(data.searchIndex),
          {
            fields: ['text', 'documentName', 'type'],
            storeFields: [
              'id',
              'documentId',
              'documentName',
              'pageNumber',
              'source',
              'type',
              'text',
              'bbox',
            ],
          },
        );
        this.documentStats = new Map(Object.entries(data.documentStats));
        console.log(
          `[IndexService] Loaded ${this.searchIndex.documentCount} bboxes from cache`,
        );
        return;
      } catch (err) {
        console.warn('[IndexService] Failed to load cache, rebuilding:', err);
      }
    }
    await this.reindexAll();
  }

  private startWatcher(): void {
    const pattern = path.join(WORKSPACES_DIR, '*/plugins/*/*.json');

    this.watcher = chokidar.watch(pattern, {
      ignored: /manifest\.json$/,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300 },
    });

    const handleChange = debounce((filePath: string) => {
      this.indexFile(filePath);
    }, 100);

    this.watcher.on('add', handleChange);
    this.watcher.on('change', handleChange);
    this.watcher.on('unlink', (filePath: string) => this.removeFile(filePath));

    console.log('[IndexService] Watching for plugin output changes');
  }

  private async indexFile(filePath: string): Promise<void> {
    try {
      const { documentId, documentName, manifest } =
        await this.resolveContext(filePath);
      if (!manifest) return;

      const adapter = getAdapter(manifest);
      if (!adapter) {
        console.warn(
          `[IndexService] No adapter for schema: ${manifest.schema}`,
        );
        return;
      }

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const bboxes = adapter.extract(
        filePath,
        content,
        manifest,
        documentId,
        documentName,
      );

      this.removeByFile(filePath);

      for (const bbox of bboxes) {
        this.searchIndex.add(bbox);
      }

      this.updateDocumentStats(documentId, documentName);
      this.debouncedPersist();
      this.emit({
        documentId,
        affectedPages: [...new Set(bboxes.map((b) => b.pageNumber))],
        addedCount: bboxes.length,
        removedCount: 0,
      });
    } catch (err) {
      console.error(`[IndexService] Failed to index ${filePath}:`, err);
    }
  }

  private removeFile(filePath: string): void {
    const removed = this.removeByFile(filePath);
    if (removed > 0) {
      this.debouncedPersist();
    }
  }

  private removeByFile(filePath: string): number {
    const toRemove = this.searchIndex
      .search('', { filter: (r) => r.source?.filePath === filePath })
      .map((r) => r.id);

    for (const id of toRemove) {
      this.searchIndex.discard(id);
    }
    return toRemove.length;
  }

  private async resolveContext(filePath: string): Promise<{
    documentId: string;
    documentName: string;
    manifest: PluginManifest | null;
  }> {
    const parts = filePath.split(path.sep);
    const workspacesIdx = parts.indexOf('workspaces');
    if (workspacesIdx === -1) {
      return { documentId: '', documentName: '', manifest: null };
    }

    const documentId = parts[workspacesIdx + 1];
    const pluginDir = path.dirname(filePath);
    const manifestPath = path.join(pluginDir, 'manifest.json');

    let documentName = documentId;
    const metadataPath = path.join(WORKSPACES_DIR, documentId, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        documentName = meta.fileName || meta.name || documentId;
      } catch {
        /* empty */
      }
    }

    let manifest: PluginManifest | null = null;
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch {
        /* empty */
      }
    }

    if (!manifest) {
      manifest = {
        plugin: path.basename(pluginDir),
        version: '1.0.0',
        schema: 'okra-page-v1',
        completed: true,
        extractedAt: new Date().toISOString(),
      };
    }

    return { documentId, documentName, manifest };
  }

  private updateDocumentStats(documentId: string, documentName: string): void {
    const allForDoc = this.searchIndex.search('', {
      filter: (r) => r.documentId === documentId,
    });

    const byType: Partial<Record<EntityType, number>> = {};
    const pages = new Set<number>();

    for (const result of allForDoc) {
      const doc = result as unknown as IndexedBbox;
      byType[doc.type] = (byType[doc.type] || 0) + 1;
      pages.add(doc.pageNumber);
    }

    this.documentStats.set(documentId, {
      documentId,
      documentName,
      totalBboxes: allForDoc.length,
      byType,
      pageCount: pages.size,
    });
  }

  private persistIndexNow(): void {
    try {
      const data: PersistedIndex = {
        version: 1,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        searchIndex: JSON.parse(JSON.stringify(this.searchIndex)),
        documentStats: Object.fromEntries(this.documentStats),
      };
      fs.writeFileSync(INDEX_FILE, JSON.stringify(data));
      console.log(
        `[IndexService] Persisted ${this.searchIndex.documentCount} bboxes`,
      );
    } catch (err) {
      console.error('[IndexService] Failed to persist index:', err);
    }
  }

  async reindexAll(): Promise<void> {
    console.log('[IndexService] Full reindex starting...');
    this.searchIndex = this.createIndex();
    this.documentStats.clear();

    if (!fs.existsSync(WORKSPACES_DIR)) {
      console.log('[IndexService] No workspaces directory');
      return;
    }

    const workspaces = fs
      .readdirSync(WORKSPACES_DIR)
      .filter((f) => fs.statSync(path.join(WORKSPACES_DIR, f)).isDirectory());

    for (const wsId of workspaces) {
      await this.reindexDocument(wsId);
    }

    this.persistIndexNow();
    console.log(
      `[IndexService] Indexed ${this.searchIndex.documentCount} bboxes from ${workspaces.length} documents`,
    );
  }

  async reindexDocument(documentId: string): Promise<void> {
    const pluginsDir = path.join(WORKSPACES_DIR, documentId, 'plugins');
    if (!fs.existsSync(pluginsDir)) return;

    for (const dir of [pluginsDir]) {
      const plugins = fs
        .readdirSync(dir)
        .filter((f) => fs.statSync(path.join(dir, f)).isDirectory());

      for (const pluginName of plugins) {
        const pluginDir = path.join(dir, pluginName);
        const files = fs
          .readdirSync(pluginDir)
          .filter((f) => f.endsWith('.json') && f !== 'manifest.json');

        for (const file of files) {
          await this.indexFile(path.join(pluginDir, file));
        }
      }
    }
  }

  search(options: SearchOptions): SearchResult[] {
    const results = this.searchIndex.search(options.query, {
      prefix: true,
      fuzzy: options.fuzzy ? 0.2 : false,
      filter: (result) => {
        const doc = result as unknown as IndexedBbox;
        if (options.documentId && doc.documentId !== options.documentId) {
          return false;
        }
        if (
          options.entityTypes?.length &&
          !options.entityTypes.includes(doc.type)
        ) {
          return false;
        }
        return true;
      },
    });

    return results.slice(0, options.limit || 50).map((r) => ({
      entity: r as unknown as IndexedBbox,
      score: r.score,
      matches: Object.entries(r.match).map(([term, fields]) => ({
        term,
        field: (fields as string[])[0],
      })),
    }));
  }

  getPageBboxes(documentId: string, pageNumber: number): IndexedBbox[] {
    return this.searchIndex
      .search('', {
        filter: (r) => {
          const doc = r as unknown as IndexedBbox;
          return doc.documentId === documentId && doc.pageNumber === pageNumber;
        },
      })
      .map((r) => r as unknown as IndexedBbox);
  }

  findBboxAtPoint(
    documentId: string,
    pageNumber: number,
    x: number,
    y: number,
  ): IndexedBbox | null {
    const bboxes = this.getPageBboxes(documentId, pageNumber);
    return (
      bboxes.find(
        (b) =>
          x >= b.bbox.xMin &&
          x <= b.bbox.xMax &&
          y >= b.bbox.yMin &&
          y <= b.bbox.yMax,
      ) ?? null
    );
  }

  getStats(): IndexStats {
    const byType: Record<EntityType, number> = {} as Record<EntityType, number>;
    for (const type of ENTITY_TYPES) {
      byType[type] = 0;
    }

    for (const stats of this.documentStats.values()) {
      for (const [type, count] of Object.entries(stats.byType)) {
        byType[type as EntityType] += count || 0;
      }
    }

    return {
      totalBboxes: this.searchIndex.documentCount,
      totalDocuments: this.documentStats.size,
      byType,
      byDocument: Object.fromEntries(this.documentStats),
      lastUpdated: new Date().toISOString(),
    };
  }

  getDocumentStats(documentId: string): DocumentStats | null {
    return this.documentStats.get(documentId) ?? null;
  }

  onUpdate(listener: (event: IndexUpdatedEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener);
    };
  }

  private emit(event: IndexUpdatedEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }
}

export const indexService = new IndexService();
