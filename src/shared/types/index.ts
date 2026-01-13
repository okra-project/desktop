export type EntityType = string;

export interface NormalizedBbox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface IndexedBbox {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  source: {
    plugin: string;
    filePath: string;
  };
  type: EntityType;
  text: string;
  bbox: NormalizedBbox;
}

export interface PluginManifest {
  plugin: string;
  version: string;
  schema: string;
  completed: boolean;
  pageCount?: number;
  extractedAt: string;
  capabilities?: EntityType[];
}

export interface SearchOptions {
  query: string;
  fuzzy?: boolean;
  documentId?: string;
  entityTypes?: EntityType[];
  limit?: number;
}

export interface SearchResult {
  entity: IndexedBbox;
  score: number;
  matches: Array<{ field: string; term: string }>;
}

export interface IndexStats {
  totalBboxes: number;
  totalDocuments: number;
  byType: Record<EntityType, number>;
  byDocument: Record<string, DocumentStats>;
  lastUpdated: string;
}

export interface DocumentStats {
  documentId: string;
  documentName: string;
  totalBboxes: number;
  byType: Partial<Record<EntityType, number>>;
  pageCount: number;
}

export interface PersistedIndex {
  version: 1;
  createdAt: string;
  lastUpdated: string;
  searchIndex: object;
  documentStats: Record<string, DocumentStats>;
}

export interface IndexMeta {
  lastFullIndex: string;
  fileHashes: Record<string, string>;
}

export interface SchemaAdapter {
  schemaId: string;
  canHandle(manifest: PluginManifest): boolean;
  extract(
    filePath: string,
    content: unknown,
    manifest: PluginManifest,
    documentId: string,
    documentName: string,
  ): IndexedBbox[];
}

export interface IndexUpdatedEvent {
  documentId: string;
  affectedPages: number[];
  addedCount: number;
  removedCount: number;
}

export interface OkraPageJson {
  pageNumber: number;
  markdown: string;
  bboxes: Array<{
    type: string;
    text: string;
    vertices: Array<{ x: number; y: number }>;
  }>;
  durationMs?: number;
  imageSize?: { width: number; height: number };
}
