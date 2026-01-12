# Indexing Architecture

## Overview

Index extraction data from `~/.okrapdf/workspaces/` for fast search and spatial queries.

**Design Principles:**

- Filesystem is Single Source of Truth (SoT)
- In-memory index with persistence (no SQLite)
- Plugin-agnostic: any plugin writes to its namespace, indexer adapts
- Lazy loading for performance

## Directory Structure

```
~/.okrapdf/
├── workspaces/{id}/
│   ├── metadata.json                 # document identity
│   ├── source.pdf
│   ├── thumbnail.png
│   └── plugins/                      # all plugin outputs
│       └── {plugin-name}/
│           ├── manifest.json         # schema declaration
│           └── *.json                # plugin-specific data
├── search-index.json                 # MiniSearch serialized
└── index-meta.json                   # {lastIndexed, fileHashes}
```

## Plugin Manifest

Each plugin declares its schema so the indexer knows how to extract entities:

```typescript
interface PluginManifest {
  plugin: string; // e.g., "openrouter-vlm"
  version: string; // e.g., "1.0.0"
  schema: string; // e.g., "okra-page-v1", "docling-v2"
  completed: boolean;
  pageCount?: number;
  extractedAt: string; // ISO timestamp
  capabilities?: string[]; // e.g., ["tables", "figures", "text"]
}
```

## Indexable Entity (Normalized)

All plugins output different formats. The indexer normalizes to:

```typescript
interface IndexableEntity {
  id: string; // unique: `${docId}:${plugin}:${page}:${idx}`
  documentId: string;
  documentName: string;
  pageNumber: number;
  source: {
    plugin: string;
    filePath: string;
  };
  type: EntityType; // 'text' | 'table' | 'figure' | 'footnote' | ...
  text: string; // searchable content
  bbox?: NormalizedBbox; // { xMin, yMin, xMax, yMax } in 0-1 coords
}

type EntityType =
  | 'text'
  | 'table'
  | 'figure'
  | 'footnote'
  | 'signature'
  | 'callout'
  | 'unknown';

interface NormalizedBbox {
  xMin: number; // 0-1
  yMin: number;
  xMax: number;
  yMax: number;
}
```

## Schema Adapters

Each plugin schema gets an adapter:

```typescript
interface SchemaAdapter {
  schemaId: string;
  extract(
    filePath: string,
    content: unknown,
    manifest: PluginManifest,
  ): IndexableEntity[];
}

// Built-in adapters:
// - OkraPageV1Adapter: current VLM output (page-NNN.json with bboxes)
// - DoclingV2Adapter: docling JSON format
// - GenericAdapter: fallback, indexes all string fields
```

## IndexService

Main service managing search index and file watching:

```typescript
class IndexService implements IService {
  readonly serviceName = 'IndexService';

  private searchIndex: MiniSearch<IndexableEntity>;
  private bboxCache: Map<string, Map<number, IndexableEntity[]>>; // docId -> page -> entities
  private watcher: FSWatcher | null;
  private adapters: Map<string, SchemaAdapter>;

  // Lifecycle
  async init(): Promise<void>;
  async dispose(): Promise<void>;

  // Search API
  search(query: string, options?: SearchOptions): SearchResult[];

  // Spatial API (lazy loaded per page)
  getPageEntities(docId: string, page: number): Promise<IndexableEntity[]>;
  findEntityAtPoint(
    docId: string,
    page: number,
    x: number,
    y: number,
  ): IndexableEntity | null;
  findEntitiesInRegion(
    docId: string,
    page: number,
    region: NormalizedBbox,
  ): IndexableEntity[];

  // Stats
  getStats(): { documents: number; pages: number; entities: number };

  // Manual triggers
  reindexDocument(docId: string): Promise<void>;
  reindexAll(): Promise<void>;
}

interface SearchOptions {
  fuzzy?: boolean;
  documentId?: string;
  entityTypes?: EntityType[];
  limit?: number;
}

interface SearchResult {
  entity: IndexableEntity;
  score: number;
  matches: Array<{ field: string; term: string }>;
}
```

## Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    PLUGIN WRITES TO FS                            │
│  VLM Plugin → plugins/openrouter-vlm/page-001.json               │
│  Docling    → plugins/docling/document.json                      │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │ chokidar watches plugins/**/*.json
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                      INDEX SERVICE                                │
│  1. Detect file change (add/change/unlink)                       │
│  2. Load manifest.json → determine schema                        │
│  3. Find adapter for schema                                      │
│  4. Extract IndexableEntity[]                                    │
│  5. Update MiniSearch index                                      │
│  6. Invalidate bbox cache for affected pages                     │
│  7. Persist index (debounced)                                    │
│  8. Emit 'index:updated' event                                   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC: 'index:search', 'index:get-page'
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                        RENDERER                                   │
│  - Search bar uses index:search                                  │
│  - PDF viewer uses index:get-page for bbox overlays              │
│  - RTK Query invalidates on 'index:updated' event                │
└──────────────────────────────────────────────────────────────────┘
```

## Startup Sequence

1. Check if `search-index.json` exists
2. If exists: load with `MiniSearch.loadJSON()`, then sync changed files
3. If not: full rebuild from all `plugins/` directories
4. Start chokidar watcher
5. Service ready

## Persistence

```typescript
// Saved to ~/.okrapdf/search-index.json
interface PersistedIndex {
  version: 1;
  createdAt: string;
  miniSearchData: object; // MiniSearch.toJSON()
}

// Saved to ~/.okrapdf/index-meta.json
interface IndexMeta {
  lastFullIndex: string;
  fileHashes: Record<string, string>; // filePath -> contentHash
}
```

## Migration: ocr/ → plugins/

Existing workspaces have `ocr/openrouter/`. Migration:

1. On first access, check if `plugins/` exists
2. If not, move `ocr/{provider}/` → `plugins/{provider}/`
3. Update manifest.json to new format if needed
4. Log migration

## IPC Handlers

```typescript
// Main process handlers
ipcMain.handle('index:search', (_, query, options) =>
  indexService.search(query, options),
);
ipcMain.handle('index:get-page', (_, docId, page) =>
  indexService.getPageEntities(docId, page),
);
ipcMain.handle('index:get-stats', () => indexService.getStats());
ipcMain.handle('index:reindex', (_, docId?) =>
  docId ? indexService.reindexDocument(docId) : indexService.reindexAll(),
);

// Events pushed to renderer
mainWindow.webContents.send('index:updated', { documentId, affectedPages });
```

## Dependencies

```json
{
  "minisearch": "^7.0.0",
  "chokidar": "^3.6.0"
}
```

## File Locations

```
src/main/services/index.service.ts      # IndexService
src/main/services/adapters/             # Schema adapters
  ├── index.ts
  ├── okra-page-v1.adapter.ts
  ├── docling-v2.adapter.ts
  └── generic.adapter.ts
src/shared/types/index.types.ts         # IndexableEntity, etc.
src/main/handlers/index.handlers.ts     # IPC handlers
```
