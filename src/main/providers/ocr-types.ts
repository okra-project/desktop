/**
 * OCR Provider Types for Desktop
 *
 * These types mirror the okrapdf-sdk provider interface.
 * They can be replaced with SDK imports once the dependency is added.
 */

export type OcrProviderId =
  | 'google-docai'
  | 'openrouter'
  | 'anthropic'
  | string;
export type OcrProviderRuntime = 'api' | 'local' | 'python';
export type OcrProviderCategory = 'ocr' | 'agent' | 'vlm';

export enum PluginState {
  NotInstalled = 'not-installed',
  Installing = 'installing',
  Installed = 'installed',
  Uninstalling = 'uninstalling',
  UpdateAvailable = 'update-available',
  Error = 'error',
}

export interface OcrProviderCapabilities {
  supportsText: boolean;
  supportsTables: boolean;
  supportsBboxes: boolean;
  supportsFigures: boolean;
  supportsHandwriting: boolean;
  supportsMultiLanguage: boolean;
  outputFormats: ('json' | 'markdown' | 'text')[];
  maxPagesPerRequest: number;
}

export interface OcrBoundingBox {
  type:
    | 'text'
    | 'table'
    | 'figure'
    | 'heading'
    | 'paragraph'
    | 'line'
    | 'footnote'
    | 'signature';
  vertices: { x: number; y: number }[];
  text?: string;
  confidence?: number;
  blockId?: string;
}

export interface OcrTableData {
  id: string;
  markdown: string;
  headers?: string[];
  rowCount: number;
  colCount: number;
  bbox?: OcrBoundingBox;
}

export interface OcrPageResult {
  pageNumber: number;
  markdown?: string;
  bboxes: OcrBoundingBox[];
  tables?: OcrTableData[];
  confidence?: number;
  durationMs?: number;
  error?: string;
}

export interface OcrProviderConfig {
  apiKey?: string;
  projectId?: string;
  processorId?: string;
  modelId?: string;
  options?: Record<string, unknown>;
}

/**
 * How credentials are used in API requests (n8n-style)
 */
export interface OcrCredentialAuthenticate {
  type: 'header' | 'query' | 'body' | 'bearer' | 'service-account';
  /** Header name if type is 'header' */
  headerName?: string;
  /** Query param name if type is 'query' */
  queryName?: string;
}

export interface OcrProviderMetadata {
  id: OcrProviderId;
  name: string;
  description: string;
  runtime: OcrProviderRuntime;
  /** Provider category: 'ocr' for extraction, 'agent' for chat, 'vlm' for vision-language */
  category: OcrProviderCategory;
  capabilities: OcrProviderCapabilities;
  /** JSON Schema for provider config fields (n8n-style properties) */
  configSchema?: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        title: string;
        description?: string;
        format?: 'password' | 'file' | 'uri';
        enum?: string[];
        default?: unknown;
      }
    >;
    required?: string[];
  };
  /** How the credential is used in requests */
  authenticate?: OcrCredentialAuthenticate;
  documentationUrl?: string;
  costPerPage?: number;
  isCloud: boolean;
  installInstructions?: string;
}

export interface OcrProgress {
  providerId: OcrProviderId;
  phase: 'starting' | 'processing' | 'completed' | 'failed';
  currentPage?: number;
  totalPages?: number;
  message?: string;
  error?: string;
}

export interface OcrExtractionRequest {
  providerId: OcrProviderId;
  workspacePath: string;
  config: OcrProviderConfig;
  options?: {
    startPage?: number;
    endPage?: number;
  };
}

export interface OcrComparisonRequest {
  providerIds: OcrProviderId[];
  workspacePath: string;
  configs: Record<OcrProviderId, OcrProviderConfig>;
  options?: {
    startPage?: number;
    endPage?: number;
  };
}

export interface OcrComparisonResult {
  providerId: OcrProviderId;
  pages: OcrPageResult[];
  totalDurationMs: number;
  error?: string;
}
