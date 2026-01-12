# Codemode + Declarative Query System

> Spec v1.0 | 2026-01-12

## Overview

Transform MCP tool interactions from sequential round-trips to single code executions with a declarative query system for PDF content display.

**Goals:**

1. Agent generates JS code that chains multiple MCP tools in one execution
2. Replace imperative `show_result(id, page)` with declarative `query("SELECT tables FROM ...")`
3. UI reactively renders query results (grid, list, overlay, carousel)

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           AGENT (Claude, etc.)                        │
│  Instead of N tool_calls, generates ONE codemode block               │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         CODEMODE EXECUTOR                             │
│  - Receives JS async function body                                   │
│  - Executes in Node.js VM with sandboxed `mcp` proxy                 │
│  - Routes tool calls to actual handlers                              │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          QUERY ENGINE                                 │
│  - Parses SQL-like DSL or natural language                           │
│  - Queries IndexService for matching bboxes                          │
│  - Returns structured QueryResultSet                                 │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      REDUX STATE (querySlice)                         │
│  - Stores active query + results                                     │
│  - Controls display mode (grid/list/overlay/split)                   │
│  - Manages selection, focus, pinned results                          │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         REACTIVE UI                                   │
│  - QueryBar: SQL-like input with autocomplete                        │
│  - ResultsPanel: grid/list/carousel of matches                       │
│  - PDFViewer: highlights matching bboxes                             │
└──────────────────────────────────────────────────────────────────────┘
```

## Part 1: Codemode Executor

### 1.1 Type Definitions

```typescript
// src/main/codemode/types.ts

export interface CodemodeRequest {
  /** Generated JS async function body */
  code: string;
  /** Timeout in ms (default: 30000) */
  timeout?: number;
  /** Whether to allow mutations (default: false) */
  allowMutations?: boolean;
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

export interface McpToolExecutor {
  name: string;
  execute: (args: unknown) => Promise<unknown>;
}
```

### 1.2 Executor Implementation

Uses Node.js `vm` module (available in Electron main process) for sandboxed execution:

```typescript
// src/main/codemode/executor.ts

import vm from 'vm';

export class CodemodeExecutor {
  private toolExecutors: Map<string, McpToolExecutor>;

  constructor(executors: McpToolExecutor[]) {
    this.toolExecutors = new Map(executors.map((e) => [e.name, e]));
  }

  async execute(request: CodemodeRequest): Promise<CodemodeResult> {
    const startTime = Date.now();
    const toolCalls: ToolCallLog[] = [];

    // Create MCP proxy that routes to real executors
    const mcp = new Proxy(
      {},
      {
        get: (_, toolName: string) => {
          return async (args: unknown) => {
            const executor = this.toolExecutors.get(toolName);
            if (!executor) throw new Error(`Unknown tool: ${toolName}`);

            const callStart = Date.now();
            const result = await executor.execute(args);
            toolCalls.push({
              tool: toolName,
              args,
              result,
              durationMs: Date.now() - callStart,
            });
            return result;
          };
        },
      },
    );

    // Wrap code in async function
    const wrappedCode = `
      (async function(mcp) {
        ${request.code}
      })
    `;

    try {
      // Create sandboxed context
      const context = vm.createContext({
        mcp,
        console: { log: () => {}, error: () => {}, warn: () => {} },
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Date,
        Math,
        RegExp,
        Promise,
        parseFloat,
        parseInt,
      });

      // Compile and run
      const script = new vm.Script(wrappedCode, {
        timeout: request.timeout || 30000,
      });
      const fn = script.runInContext(context);
      const result = await fn(mcp);

      return {
        success: true,
        result,
        executionMs: Date.now() - startTime,
        toolCalls,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionMs: Date.now() - startTime,
        toolCalls,
      };
    }
  }
}
```

### 1.3 Type Generation for Tools

Generate TypeScript declarations so the LLM knows the tool signatures:

```typescript
// src/main/codemode/type-generator.ts

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<
    string,
    { type: string; description?: string; required?: boolean }
  >;
  outputSchema?: Record<string, { type: string; description?: string }>;
}

export function generateToolTypes(tools: ToolSchema[]): string {
  let types = '';
  let declarations = '';

  for (const tool of tools) {
    const inputType = toCamelCase(tool.name) + 'Input';
    const outputType = toCamelCase(tool.name) + 'Output';

    // Generate input interface
    types += `interface ${inputType} {\n`;
    for (const [key, schema] of Object.entries(tool.inputSchema)) {
      const optional = schema.required === false ? '?' : '';
      types += `  ${key}${optional}: ${tsType(schema.type)};\n`;
    }
    types += '}\n\n';

    // Generate output interface (generic if not specified)
    if (tool.outputSchema) {
      types += `interface ${outputType} {\n`;
      for (const [key, schema] of Object.entries(tool.outputSchema)) {
        types += `  ${key}: ${tsType(schema.type)};\n`;
      }
      types += '}\n\n';
    } else {
      types += `interface ${outputType} { [key: string]: unknown; }\n\n`;
    }

    // Add to declarations
    declarations += `  /** ${tool.description} */\n`;
    declarations += `  ${tool.name}: (input: ${inputType}) => Promise<${outputType}>;\n`;
  }

  return `${types}\ndeclare const mcp: {\n${declarations}};\n`;
}

function toCamelCase(str: string): string {
  return str
    .replace(/_([a-z])/g, (_, l) => l.toUpperCase())
    .replace(/^[a-z]/, (l) => l.toUpperCase());
}

function tsType(jsonType: string): string {
  const map: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    object: 'Record<string, unknown>',
    array: 'unknown[]',
  };
  return map[jsonType] || 'unknown';
}
```

## Part 2: Declarative Query System

### 2.1 Query Types

```typescript
// src/shared/types/query.ts

export type EntitySelector =
  | 'table'
  | 'figure'
  | 'footnote'
  | 'signature'
  | 'text'
  | 'all';

export type QuerySource =
  | { type: 'workspace'; id: string }
  | { type: 'page'; workspaceId: string; page: number }
  | { type: 'all' }
  | { type: 'current' };

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

export interface WhereClause {
  field:
    | 'type'
    | 'text'
    | 'confidence'
    | 'page'
    | 'workspace'
    | 'amount'
    | 'date';
  op: WhereOperator;
  value: string | number | string[] | number[];
}

export interface QueryAST {
  select: EntitySelector[];
  from: QuerySource;
  where?: WhereClause[];
  orderBy?: { field: string; dir: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
  display?: {
    mode: 'grid' | 'list' | 'carousel' | 'split' | 'overlay';
    highlight?: boolean;
    groupBy?: 'page' | 'workspace' | 'type';
  };
}

export interface QueryResultItem {
  id: string;
  workspaceId: string;
  workspaceName: string;
  page: number;
  type: string;
  bbox: { xMin: number; yMin: number; xMax: number; yMax: number };
  text: string;
  confidence?: number;
  thumbnail?: string;
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
```

### 2.2 Query Parser

Supports both SQL-like syntax and natural language:

```typescript
// src/main/query/parser.ts

const ENTITY_ALIASES: Record<string, EntitySelector> = {
  table: 'table',
  tables: 'table',
  figure: 'figure',
  figures: 'figure',
  image: 'figure',
  images: 'figure',
  footnote: 'footnote',
  footnotes: 'footnote',
  signature: 'signature',
  signatures: 'signature',
  text: 'text',
  paragraph: 'text',
  paragraphs: 'text',
  all: 'all',
  '*': 'all',
  everything: 'all',
};

export function parseQuery(input: string): QueryAST {
  const normalized = input.trim();

  // Try SQL-like first
  const sqlMatch = normalized.match(
    /^SELECT\s+(.+?)\s+FROM\s+(.+?)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i,
  );

  if (sqlMatch) {
    return parseSqlQuery(sqlMatch);
  }

  // Try natural language patterns
  return parseNaturalLanguage(normalized);
}

function parseSqlQuery(match: RegExpMatchArray): QueryAST {
  const [, selectPart, fromPart, wherePart, orderPart, limitPart] = match;

  // Parse SELECT
  const select = selectPart.split(',').map((s) => {
    const trimmed = s.trim().toLowerCase();
    return ENTITY_ALIASES[trimmed] || 'all';
  });

  // Parse FROM
  const from = parseFrom(fromPart.trim());

  // Parse WHERE
  const where = wherePart ? parseWhere(wherePart) : undefined;

  // Parse ORDER BY
  const orderBy = orderPart ? parseOrderBy(orderPart) : undefined;

  // Parse LIMIT
  const limit = limitPart ? parseInt(limitPart, 10) : undefined;

  return { select, from, where, orderBy, limit };
}

function parseFrom(fromPart: string): QuerySource {
  const lower = fromPart.toLowerCase();

  if (lower === 'all' || lower === '*') {
    return { type: 'all' };
  }
  if (lower === 'current' || lower === 'this') {
    return { type: 'current' };
  }
  if (lower.startsWith('page ')) {
    const pageNum = parseInt(lower.replace('page ', ''), 10);
    return { type: 'page', workspaceId: 'current', page: pageNum };
  }

  return { type: 'workspace', id: fromPart };
}

function parseWhere(wherePart: string): WhereClause[] {
  const clauses: WhereClause[] = [];
  const conditions = wherePart.split(/\s+AND\s+/i);

  for (const cond of conditions) {
    // text CONTAINS 'value'
    const containsMatch = cond.match(/(\w+)\s+CONTAINS\s+['"](.+?)['"]/i);
    if (containsMatch) {
      clauses.push({
        field: containsMatch[1] as any,
        op: 'contains',
        value: containsMatch[2],
      });
      continue;
    }

    // field > value
    const compMatch = cond.match(/(\w+)\s*(=|!=|>|>=|<|<=)\s*(\d+(?:\.\d+)?)/);
    if (compMatch) {
      const opMap: Record<string, WhereOperator> = {
        '=': 'eq',
        '!=': 'neq',
        '>': 'gt',
        '>=': 'gte',
        '<': 'lt',
        '<=': 'lte',
      };
      clauses.push({
        field: compMatch[1] as any,
        op: opMap[compMatch[2]],
        value: parseFloat(compMatch[3]),
      });
    }
  }

  return clauses;
}

function parseOrderBy(orderPart: string): {
  field: string;
  dir: 'asc' | 'desc';
} {
  const parts = orderPart.trim().split(/\s+/);
  return {
    field: parts[0],
    dir: parts[1]?.toLowerCase() === 'desc' ? 'desc' : 'asc',
  };
}

function parseNaturalLanguage(input: string): QueryAST {
  const lower = input.toLowerCase();

  // "all tables" / "show tables" / "tables"
  for (const [alias, type] of Object.entries(ENTITY_ALIASES)) {
    if (lower.includes(alias)) {
      return {
        select: [type],
        from: { type: 'current' },
      };
    }
  }

  // Default: search text
  return {
    select: ['all'],
    from: { type: 'current' },
    where: [{ field: 'text', op: 'contains', value: input }],
  };
}
```

### 2.3 Query Engine

```typescript
// src/main/query/engine.ts

import { indexService } from '../services/index.service';
import { storeService } from '../services/store.service';
import type {
  QueryAST,
  QueryResultSet,
  QueryResultItem,
  WhereClause,
} from '../../shared/types/query';

export class QueryEngine {
  async execute(query: QueryAST): Promise<QueryResultSet> {
    const start = Date.now();

    // Resolve workspace IDs
    const workspaceIds = await this.resolveSource(query.from);

    // Query index
    let results = this.queryIndex(workspaceIds, query.select);

    // Apply filters
    if (query.where?.length) {
      results = this.applyFilters(results, query.where);
    }

    // Sort
    if (query.orderBy) {
      results = this.sortResults(results, query.orderBy);
    }

    // Paginate
    const totalCount = results.length;
    const truncated = query.limit ? totalCount > query.limit : false;
    if (query.limit) {
      results = results.slice(
        query.offset || 0,
        (query.offset || 0) + query.limit,
      );
    }

    return {
      query,
      executedAt: new Date().toISOString(),
      results,
      totalCount,
      truncated,
      executionMs: Date.now() - start,
    };
  }

  private async resolveSource(source: QuerySource): Promise<string[]> {
    switch (source.type) {
      case 'all':
        return storeService.getLocalWorkspaces().map((w) => w.id);
      case 'current':
        // Get from renderer state via IPC or use last opened
        const current = storeService.getCurrentWorkspaceId();
        return current ? [current] : [];
      case 'workspace':
        return [source.id];
      case 'page':
        return [
          source.workspaceId === 'current'
            ? storeService.getCurrentWorkspaceId() || ''
            : source.workspaceId,
        ];
    }
  }

  private queryIndex(
    workspaceIds: string[],
    select: EntitySelector[],
  ): QueryResultItem[] {
    const types = select.includes('all') ? undefined : select;

    const results: QueryResultItem[] = [];

    for (const docId of workspaceIds) {
      const searchResults = indexService.search({
        query: '',
        documentId: docId,
        entityTypes: types as any,
        limit: 10000,
      });

      for (const r of searchResults) {
        results.push({
          id: r.entity.id,
          workspaceId: r.entity.documentId,
          workspaceName: r.entity.documentName,
          page: r.entity.pageNumber,
          type: r.entity.type,
          bbox: r.entity.bbox,
          text: r.entity.text,
          confidence: r.score,
        });
      }
    }

    return results;
  }

  private applyFilters(
    results: QueryResultItem[],
    clauses: WhereClause[],
  ): QueryResultItem[] {
    return results.filter((item) =>
      clauses.every((clause) => this.evaluateClause(item, clause)),
    );
  }

  private evaluateClause(item: QueryResultItem, clause: WhereClause): boolean {
    const value = this.extractField(item, clause.field);

    switch (clause.op) {
      case 'eq':
        return value === clause.value;
      case 'neq':
        return value !== clause.value;
      case 'gt':
        return typeof value === 'number' && value > (clause.value as number);
      case 'gte':
        return typeof value === 'number' && value >= (clause.value as number);
      case 'lt':
        return typeof value === 'number' && value < (clause.value as number);
      case 'lte':
        return typeof value === 'number' && value <= (clause.value as number);
      case 'contains':
        return (
          typeof value === 'string' &&
          value.toLowerCase().includes((clause.value as string).toLowerCase())
        );
      case 'matches':
        return (
          typeof value === 'string' &&
          new RegExp(clause.value as string, 'i').test(value)
        );
      case 'in':
        return (clause.value as unknown[]).includes(value);
      default:
        return true;
    }
  }

  private extractField(item: QueryResultItem, field: string): unknown {
    switch (field) {
      case 'type':
        return item.type;
      case 'text':
        return item.text;
      case 'confidence':
        return item.confidence;
      case 'page':
        return item.page;
      case 'workspace':
        return item.workspaceId;
      case 'amount':
        return this.extractAmount(item.text);
      case 'date':
        return this.extractDate(item.text);
      default:
        return item.metadata?.[field];
    }
  }

  private extractAmount(text: string): number | null {
    const match = text.match(/\$?([\d,]+(?:\.\d{2})?)/);
    return match ? parseFloat(match[1].replace(/,/g, '')) : null;
  }

  private extractDate(text: string): string | null {
    const match = text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  }

  private sortResults(
    results: QueryResultItem[],
    orderBy: { field: string; dir: 'asc' | 'desc' },
  ): QueryResultItem[] {
    return [...results].sort((a, b) => {
      const aVal = this.extractField(a, orderBy.field);
      const bVal = this.extractField(b, orderBy.field);

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return orderBy.dir === 'desc' ? -cmp : cmp;
    });
  }
}

export const queryEngine = new QueryEngine();
```

## Part 3: MCP Integration

### 3.1 Updated MCP Tools

```typescript
// Add to src/main/mcp/server.ts

// Tool: codemode
server.tool(
  'codemode',
  `Execute JavaScript code that can call multiple MCP tools with variables, loops, and conditionals.
  
Available tools via 'mcp' object:
- mcp.list_workspaces() - List all PDF workspaces
- mcp.get_workspace({ workspaceId, page? }) - Get workspace content
- mcp.search_workspace({ workspaceId, query }) - Search in workspace
- mcp.global_search({ query }) - Search all workspaces
- mcp.query({ query, display? }) - Declarative query with display

Example:
  const ws = await mcp.list_workspaces();
  for (const w of ws.workspaces) {
    const results = await mcp.query({ query: \`SELECT tables FROM \${w.id}\` });
    if (results.totalCount > 0) return results;
  }
`,
  {
    code: z.string().describe('JavaScript async function body'),
    timeout: z.number().optional().describe('Timeout in ms (default: 30000)'),
  },
  async ({ code, timeout }) => {
    const result = await codemodeExecutor.execute({ code, timeout });

    if (!result.success) {
      return {
        content: [{ type: 'text', text: `Execution failed: ${result.error}` }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Executed in ${result.executionMs}ms (${result.toolCalls.length} tool calls)\n\nResult: ${JSON.stringify(result.result, null, 2)}`,
        },
      ],
    };
  },
);

// Tool: query (replaces show_result)
server.tool(
  'query',
  `Execute a declarative query and display results in the PDF viewer.
  
Query syntax (SQL-like):
  SELECT <entities> FROM <source> [WHERE <conditions>] [ORDER BY <field>] [LIMIT <n>]

Entities: tables, figures, footnotes, signatures, text, all
Source: workspace ID, "page N", "current", "all"

Examples:
  - "SELECT tables FROM current"
  - "SELECT figures FROM page 5 WHERE confidence > 0.8"
  - "SELECT * FROM all WHERE text CONTAINS 'revenue' ORDER BY page"
  - "tables" (shorthand for SELECT tables FROM current)
`,
  {
    query: z.string().describe('SQL-like query or natural language'),
    display: z
      .enum(['grid', 'list', 'carousel', 'split', 'overlay'])
      .optional(),
  },
  async ({ query, display }) => {
    const ast = parseQuery(query);
    if (display) ast.display = { mode: display };

    const results = await queryEngine.execute(ast);

    // Emit to UI
    progressQueue.send('query:results', { results, timestamp: Date.now() });

    const summary = results.results
      .slice(0, 5)
      .map((r) => `- ${r.type} p${r.page}: "${r.text.slice(0, 40)}..."`)
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `Found ${results.totalCount} result(s) in ${results.executionMs}ms:\n\n${summary}${results.truncated ? '\n\n(showing first 5)' : ''}`,
        },
      ],
    };
  },
);
```

### 3.2 Type Endpoint

```typescript
// GET /mcp/types - Returns TypeScript declarations for codemode
app.get('/mcp/types', (_req, res) => {
  const types = generateToolTypes([
    {
      name: 'list_workspaces',
      description: 'List all local PDF workspaces',
      inputSchema: {},
      outputSchema: { workspaces: { type: 'array' } },
    },
    {
      name: 'get_workspace',
      description: 'Get workspace content',
      inputSchema: {
        workspaceId: { type: 'string', required: true },
        page: { type: 'number', required: false },
      },
    },
    {
      name: 'search_workspace',
      description: 'Search within a workspace',
      inputSchema: {
        workspaceId: { type: 'string', required: true },
        query: { type: 'string', required: true },
      },
    },
    {
      name: 'global_search',
      description: 'Search all workspaces',
      inputSchema: {
        query: { type: 'string', required: true },
      },
    },
    {
      name: 'query',
      description: 'Execute declarative query and display results',
      inputSchema: {
        query: { type: 'string', required: true },
        display: { type: 'string', required: false },
      },
      outputSchema: {
        totalCount: { type: 'number' },
        results: { type: 'array' },
        executionMs: { type: 'number' },
      },
    },
  ]);

  res.type('text/plain').send(types);
});
```

## Part 4: Redux State (Reactive to MCP)

**Key insight**: No QueryBar UI. The app is purely reactive to agent MCP calls.

```
Agent calls mcp.query()
    → QueryEngine executes
    → Results returned to agent (tool response)
    → Results pushed to Electron app (progressQueue.send)
    → Redux store updates (setResultsFromMcp)
    → UI reactively renders results
```

```typescript
// src/renderer/store/querySlice.ts

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type {
  QueryAST,
  QueryResultSet,
  QueryResultItem,
} from '../../shared/types/query';

interface QueryState {
  activeQuery: QueryAST | null;
  results: QueryResultSet | null;
  displayMode: 'grid' | 'list' | 'carousel' | 'split' | 'overlay';
  focusedIndex: number | null;
  selectedIds: string[];
  pinnedResults: QueryResultItem[];
  history: Array<{ query: QueryAST; timestamp: string }>;
  isExecuting: boolean;
  error: string | null;
}

const initialState: QueryState = {
  activeQuery: null,
  results: null,
  displayMode: 'grid',
  focusedIndex: null,
  selectedIds: [],
  pinnedResults: [],
  history: [],
  isExecuting: false,
  error: null,
};

export const executeQuery = createAsyncThunk(
  'query/execute',
  async (input: string | QueryAST) => {
    return window.electron.ipcRenderer.invoke('query:execute', input);
  },
);

const querySlice = createSlice({
  name: 'query',
  initialState,
  reducers: {
    setDisplayMode: (
      state,
      action: PayloadAction<QueryState['displayMode']>,
    ) => {
      state.displayMode = action.payload;
    },
    focusResult: (state, action: PayloadAction<number | null>) => {
      state.focusedIndex = action.payload;
    },
    toggleSelect: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      const idx = state.selectedIds.indexOf(id);
      if (idx >= 0) {
        state.selectedIds.splice(idx, 1);
      } else {
        state.selectedIds.push(id);
      }
    },
    pinResult: (state, action: PayloadAction<QueryResultItem>) => {
      if (!state.pinnedResults.find((r) => r.id === action.payload.id)) {
        state.pinnedResults.push(action.payload);
      }
    },
    unpinResult: (state, action: PayloadAction<string>) => {
      state.pinnedResults = state.pinnedResults.filter(
        (r) => r.id !== action.payload,
      );
    },
    clearQuery: (state) => {
      state.activeQuery = null;
      state.results = null;
      state.focusedIndex = null;
      state.selectedIds = [];
    },
    setResultsFromMcp: (state, action: PayloadAction<QueryResultSet>) => {
      state.activeQuery = action.payload.query;
      state.results = action.payload;
      state.focusedIndex = action.payload.results.length > 0 ? 0 : null;
      state.history.unshift({
        query: action.payload.query,
        timestamp: action.payload.executedAt,
      });
      state.history = state.history.slice(0, 50);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(executeQuery.pending, (state) => {
        state.isExecuting = true;
        state.error = null;
      })
      .addCase(executeQuery.fulfilled, (state, action) => {
        state.isExecuting = false;
        state.activeQuery = action.payload.query;
        state.results = action.payload;
        state.focusedIndex = action.payload.results.length > 0 ? 0 : null;
      })
      .addCase(executeQuery.rejected, (state, action) => {
        state.isExecuting = false;
        state.error = action.error.message || 'Query failed';
      });
  },
});

export const {
  setDisplayMode,
  focusResult,
  toggleSelect,
  pinResult,
  unpinResult,
  clearQuery,
  setResultsFromMcp,
} = querySlice.actions;

export default querySlice.reducer;
```

## Part 5: File Structure

```
src/
├── main/
│   ├── codemode/
│   │   ├── index.ts           # exports
│   │   ├── types.ts           # CodemodeRequest, CodemodeResult
│   │   ├── executor.ts        # CodemodeExecutor (vm sandbox)
│   │   └── type-generator.ts  # generateToolTypes()
│   │
│   ├── query/
│   │   ├── index.ts           # exports
│   │   ├── types.ts           # re-export from shared
│   │   ├── parser.ts          # parseQuery()
│   │   └── engine.ts          # QueryEngine
│   │
│   ├── mcp/
│   │   └── server.ts          # Add codemode + query tools
│   │
│   └── handlers/
│       └── query.handlers.ts  # IPC handlers for query
│
├── renderer/
│   ├── store/
│   │   ├── index.ts           # Add querySlice
│   │   └── querySlice.ts      # Query state management
│   │
│   └── components/
│       ├── QueryResults/
│       │   ├── index.tsx      # Container (shows when results exist)
│       │   ├── GridView.tsx   # Thumbnail grid
│       │   ├── ListView.tsx   # List view
│       │   └── ResultCard.tsx # Single result
│       └── PDFViewer.tsx      # Update to highlight query results
│
│   # NO QueryBar - UI is purely reactive to MCP agent calls
│
└── shared/
    └── types/
        └── query.ts           # QueryAST, QueryResultSet, etc.
```

## Implementation Status

### Completed ✅

1. **Core Types** - `src/shared/types/query.ts`
   - QueryAST, QueryResultSet, QueryResultItem
   - CodemodeRequest, CodemodeResult, ToolCallLog
   - ToolSchema for type generation

2. **Query Engine**
   - `src/main/query/parser.ts` - SQL-like DSL parser
   - `src/main/query/engine.ts` - Executes against IndexService
   - `src/main/query/index.ts` - Exports

3. **Codemode Executor**
   - `src/main/codemode/executor.ts` - Node.js vm sandbox
   - `src/main/codemode/type-generator.ts` - TS declarations for tools
   - `src/main/codemode/index.ts` - Exports

4. **MCP Integration**
   - Updated `src/main/mcp/server.ts` with `codemode` and `query` tools

5. **IPC Handlers**
   - `src/main/handlers/query.handlers.ts`
   - Updated `src/main/handlers/index.ts` to register
   - Updated `src/main/preload.ts` with new channels

6. **Redux State**
   - `src/renderer/store/querySlice.ts` - Full query state management
   - Updated `src/renderer/store/index.ts` to include reducer
   - Updated `src/renderer/hooks/useMcpEvents.ts` to dispatch query results

### In Progress 🔄

7. **UI Components**
   - QueryResultsOverlay.tsx - Reactive bbox display

## Example Usage

### Agent Query Flow

````
User: "Find all tables with revenue over $10,000"

Agent generates codemode:
```javascript
const results = await mcp.query({
  query: "SELECT tables FROM all WHERE text CONTAINS 'revenue'",
  display: 'grid'
});

// Filter in code for amount logic
const filtered = results.results.filter(r => {
  const match = r.text.match(/\$?([\d,]+)/);
  return match && parseFloat(match[1].replace(/,/g, '')) > 10000;
});

if (filtered.length > 0) {
  // Re-query with specific IDs for display
  await mcp.query({
    query: `SELECT * FROM all WHERE id IN ('${filtered.map(f => f.id).join("','")}')`,
    display: 'grid'
  });
}

return { found: filtered.length, sample: filtered[0] };
````

### Direct User Query

User types in QueryBar: `SELECT tables FROM current ORDER BY page`

→ UI immediately shows grid of tables sorted by page number
→ Clicking a result highlights it in PDFViewer
