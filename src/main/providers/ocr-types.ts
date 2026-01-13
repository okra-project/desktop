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

/**
 * Layer definition for plugin-declared entity types
 *
 * Plugins declare what entity layers they can extract, along with
 * UI metadata (icon, color, label). The host app renders layers
 * dynamically based on this - no hardcoding required.
 *
 * @example
 * ```ts
 * const tableLayer: LayerDefinition = {
 *   id: 'table',
 *   displayName: 'Tables',
 *   icon: 'Table2',  // lucide icon name
 *   color: { hex: '#3b82f6', border: 'rgba(59,130,246,0.9)', fill: 'rgba(59,130,246,0.15)' },
 *   category: 'entity'
 * };
 * ```
 */
export interface LayerDefinition {
  /** Unique layer ID - matches OcrBoundingBox.type */
  id: string;
  /** Display label for UI */
  displayName: string;
  /** Icon: unicode char ('▤') or lucide icon name ('Table2') */
  icon: string;
  /** Color scheme for overlays and UI */
  color: {
    hex: string;
    border: string;
    fill: string;
  };
  /** Category for UI grouping: 'entity' for semantic, 'ocr' for text blocks */
  category?: 'entity' | 'ocr';
}

export interface OcrBoundingBox {
  /** Layer type - matches LayerDefinition.id from plugin manifest */
  type: string;
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
  imageSize?: { width: number; height: number };
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
  /** Entity types this plugin extracts - required for bbox-producing plugins */
  layers: LayerDefinition[];
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
  /** npm packages required by this plugin (installed on-demand) */
  npmDependencies?: string[];
  /**
   * Workflow node definition - if present, plugin can be used in extraction workflows
   *
   * This enables the workflow system to dynamically dispatch to any provider
   * that declares workflow support, rather than hardcoding provider logic.
   */
  workflowNode?: WorkflowNodeDefinition;
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

// ============================================================================
// Workflow Node Types (ComfyUI/n8n-inspired)
// ============================================================================

/**
 * Data types that workflow nodes can consume/produce
 *
 * Inspired by ComfyUI's typed I/O system - nodes declare what they
 * accept as input and produce as output.
 */
export type WorkflowIOType =
  | 'pdf' // Raw PDF file path
  | 'page-images' // Rendered page images (Buffer)
  | 'text' // Extracted plain text
  | 'entities' // OcrPageResult with bboxes, tables
  | 'markdown'; // Final markdown output

/**
 * Workflow node definition in plugin metadata
 *
 * If present, the plugin can be used as a workflow node.
 * This is how plugins declare their workflow integration.
 */
export interface WorkflowNodeDefinition {
  /** What this node consumes from previous node */
  inputs: WorkflowIOType[];
  /** What this node produces for next node */
  outputs: WorkflowIOType[];
  /** Visual grouping in workflow editor */
  group: 'source' | 'processor' | 'output';
}

/**
 * Context passed to plugin's executeWorkflow method
 *
 * Contains everything the plugin needs to do its work,
 * plus utilities for progress reporting and cancellation.
 */
export interface WorkflowExecutionContext {
  workspacePath: string;
  pdfPath: string;
  pageNumber: number;
  totalPages: number;
  config: OcrProviderConfig;
  /** Input from previous node (based on declared inputs) */
  input: {
    pageImage?: Buffer;
    text?: string;
    entities?: OcrPageResult;
  };
  /** Report progress to UI */
  reportProgress(message: string, percent?: number): void;
  /** Abort signal for cancellation */
  signal: AbortSignal;
}

/**
 * Result from plugin's executeWorkflow method
 *
 * Contains output data (based on declared outputs) plus metadata.
 */
export interface WorkflowNodeResult {
  /** Extracted plain text */
  text?: string;
  /** Entities with bboxes, tables */
  entities?: OcrPageResult;
  /** Formatted markdown */
  markdown?: string;
  /** Time taken for this page */
  durationMs: number;
  /** Error message if failed */
  error?: string;
}
