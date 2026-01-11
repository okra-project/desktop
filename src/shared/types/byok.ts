/**
 * BYOK (Bring Your Own Key) Settings Types
 *
 * Enables fully local operation without server signup.
 * Users provide their own API keys for:
 * - Anthropic Claude (required for agent + table extraction)
 * - OpenRouter (optional, for alternative models)
 */

export interface BYOKSettings {
  /** Anthropic API key for Claude - required for agent and table extraction */
  anthropicApiKey?: string;

  /** OpenRouter API key - optional, for alternative models */
  openrouterApiKey?: string;

  /** Whether BYOK mode is enabled (has at least anthropicApiKey) */
  enabled: boolean;

  /** Last validated timestamp */
  lastValidated?: string;
}

export interface BYOKValidationResult {
  valid: boolean;
  provider: 'anthropic' | 'openrouter';
  error?: string;
  model?: string;
}

export interface LocalWorkspace {
  id: string;
  name: string;
  pdfPath: string;
  workspacePath: string;
  createdAt: string;
  lastOpenedAt: string;
  pageCount?: number;
  extractionStatus: 'pending' | 'extracting' | 'completed' | 'failed';
  extractionProgress?: number;
}

export interface LocalWorkspaceMetadata {
  id: string;
  fileName: string;
  originalPath: string;
  createdAt: string;
  mode: 'local';
  pageCount?: number;
  extractionStatus: 'pending' | 'extracting' | 'completed' | 'failed';
  textExtractionComplete?: boolean;
  tableExtractionComplete?: boolean;
}

/**
 * Local verification state stored in workspace
 */
export interface LocalVerificationState {
  version: 1;
  jobId: string;
  documentName: string;
  totalPages: number;
  pages: Record<number, LocalPageState>;
  tables: Record<string, LocalTableState>;
  lastModified: string;
}

export interface LocalPageState {
  page: number;
  status: 'pending' | 'verified' | 'flagged' | 'rejected';
  hasOcr: boolean;
  ocrLineCount: number;
  entities: LocalEntityInfo[];
  resolution?: string;
  classification?: string;
  lastModified: string;
}

export interface LocalEntityInfo {
  id: string;
  type: 'table' | 'figure' | 'footnote' | 'summary' | 'signature';
  title?: string;
  page: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface LocalTableState {
  id: string;
  page: number;
  status: 'pending' | 'verified' | 'flagged' | 'rejected';
  markdown: string;
  bbox?: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
  confidence?: number;
  versions: LocalTableVersion[];
  lastModified: string;
}

export interface LocalTableVersion {
  id: string;
  markdown: string;
  source: 'extraction' | 'user_edit' | 'ai_correction';
  createdAt: string;
  editNote?: string;
}

/**
 * Extraction progress event sent during local PDF processing
 */
export interface ExtractionProgressEvent {
  phase: 'text' | 'tables' | 'metadata';
  currentPage: number;
  totalPages: number;
  status: 'processing' | 'completed' | 'failed';
  message?: string;
  error?: string;
}
