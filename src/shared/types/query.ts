/**
 * Query System Types
 *
 * Declarative query language for PDF content.
 * Agents call mcp.query() → results displayed reactively in UI.
 */

// ============================================
// Entity Types
// ============================================

export type EntitySelector = string | 'all';

// ============================================
// Query Source
// ============================================

export type QuerySource =
  | { type: 'workspace'; id: string }
  | { type: 'page'; workspaceId: string; page: number }
  | { type: 'all' }
  | { type: 'current' };

// ============================================
// WHERE Clauses
// ============================================

export type WhereOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'matches'
  | 'in'
  | 'notIn';

export type WhereField =
  | 'type'
  | 'text'
  | 'confidence'
  | 'page'
  | 'workspace'
  | 'amount'
  | 'date';

export interface WhereClause {
  field: WhereField;
  op: WhereOperator;
  value: string | number | string[] | number[];
}

// ============================================
// Display Options
// ============================================

export type DisplayMode = 'grid' | 'list' | 'carousel' | 'split' | 'overlay';

export interface DisplayOptions {
  mode: DisplayMode;
  highlight?: boolean;
  groupBy?: 'page' | 'workspace' | 'type';
}

// ============================================
// Query AST
// ============================================

export interface QueryAST {
  select: EntitySelector[];
  from: QuerySource;
  where?: WhereClause[];
  orderBy?: { field: string; dir: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
  display?: DisplayOptions;
}

// ============================================
// Query Results
// ============================================

export interface QueryResultItem {
  id: string;
  workspaceId: string;
  workspaceName: string;
  page: number;
  type: string;
  bbox: {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
  };
  text: string;
  confidence?: number;
  thumbnail?: string; // base64 cropped image
  metadata?: Record<string, unknown>;
}

export interface QueryResultSet {
  query: QueryAST;
  executedAt: string;
  results: QueryResultItem[];
  totalCount: number;
  truncated: boolean;
  executionMs: number;
}

// ============================================
// Query Events (MCP → UI)
// ============================================

export interface QueryResultsEvent {
  results: QueryResultSet;
  timestamp: number;
}

export interface QueryClearedEvent {
  timestamp: number;
}

// ============================================
// Codemode Types
// ============================================

export interface CodemodeRequest {
  /** Generated JS async function body */
  code: string;
  /** Timeout in ms (default: 30000) */
  timeout?: number;
}

export interface CodemodeResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionMs: number;
  toolCalls: ToolCallLog[];
}

export interface ToolCallLog {
  tool: string;
  args: unknown;
  result: unknown;
  durationMs: number;
}

// ============================================
// Tool Schema (for type generation)
// ============================================

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<
    string,
    { type: string; description?: string; required?: boolean }
  >;
  outputSchema?: Record<string, { type: string; description?: string }>;
}
