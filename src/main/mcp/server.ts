import express, { Request, Response } from 'express';
import { Server } from 'http';
import { randomUUID } from 'crypto';
import { progressQueue } from '../utils/progress-queue';
import { parseQuery, parseDisplayMode, queryEngine } from '../query';
import {
  CodemodeExecutor,
  generateToolTypes,
  MCP_TOOL_SCHEMAS,
} from '../codemode';

export interface McpServerConfig {
  port: number;
  workspaceProvider: WorkspaceProvider;
}

export interface McpServerInstance {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
  getPort: () => number;
}

export interface Workspace {
  id: string;
  name: string;
  pdfPath: string;
  workspacePath: string;
  createdAt: string;
  lastOpenedAt: string;
  pageCount?: number;
  extractionStatus: string;
}

export interface GlobalSearchResult {
  workspaceId: string;
  workspaceName: string;
  filePath: string;
  matches: Array<{ page: number; line: string }>;
}

export interface SelectorResult {
  id: string;
  page: number;
  type: string;
  text: string;
  bbox: { xMin: number; yMin: number; xMax: number; yMax: number };
}

export interface WorkspaceProvider {
  listWorkspaces: () => Workspace[];
  getWorkspace: (id: string) => Workspace | null;
  getWorkspaceContent: (id: string, pageNum?: number) => Promise<string | null>;
  searchWorkspace: (
    id: string,
    query: string,
  ) => Promise<Array<{ page: number; snippet: string }>>;
  globalSearch: (query: string) => Promise<GlobalSearchResult[]>;
  queryBySelector: (id: string, selector: string) => Promise<SelectorResult[]>;
}

export function createMcpServer(config: McpServerConfig): McpServerInstance {
  const { port, workspaceProvider } = config;

  let httpServer: Server | null = null;
  let running = false;
  const transports: Map<string, any> = new Map();

  const start = async (): Promise<void> => {
    if (running) {
      console.log('[MCP] Server already running');
      return;
    }

    const { McpServer } =
      await import('@modelcontextprotocol/sdk/server/mcp.js');
    const { StreamableHTTPServerTransport } =
      await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const { isInitializeRequest } =
      await import('@modelcontextprotocol/sdk/types.js');
    const { z } = await import('zod');

    const app = express();
    app.use(express.json());

    app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, mcp-session-id',
      );
      next();
    });

    app.options('/mcp', (_req, res) => res.sendStatus(204));

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', service: 'okrapdf-mcp' });
    });

    app.get('/', (_req, res) => {
      res.json({
        name: 'okrapdf-desktop',
        version: '1.0.0',
        description: 'MCP server for local PDF workspace access',
        mcpEndpoint: '/mcp',
        tools: ['codemode'],
      });
    });

    app.post('/mcp', async (req: Request, res: Response) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: any;

        if (sessionId && transports.has(sessionId)) {
          transport = transports.get(sessionId)!;
        } else if (isInitializeRequest(req.body)) {
          const mcpServer = new McpServer({
            name: 'okrapdf-desktop',
            version: '1.0.0',
          });

          registerToolsWithZod(mcpServer, workspaceProvider, z);

          const newSessionId = randomUUID();
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => newSessionId,
            onsessioninitialized: (sid: string) => {
              transports.set(sid, transport);
              console.log(`[MCP] Session initialized: ${sid}`);
              progressQueue.send('mcp:session-connected', {
                sessionId: sid,
                timestamp: Date.now(),
              });
            },
          });

          await mcpServer.connect(transport);

          transport.onclose = () => {
            transports.delete(newSessionId);
            console.log(`[MCP] Session closed: ${newSessionId}`);
            progressQueue.send('mcp:session-disconnected', {
              sessionId: newSessionId,
              timestamp: Date.now(),
            });
          };
        } else {
          res
            .status(400)
            .json({ error: 'No session. Send initialize request first.' });
          return;
        }

        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('[MCP] Error handling request:', error);
        res.status(500).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32603, message: 'Internal error' },
        });
      }
    });

    app.delete('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.close();
        transports.delete(sessionId);
        res.sendStatus(204);
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    });

    return new Promise((resolve, reject) => {
      httpServer = app.listen(port, () => {
        running = true;
        console.log(`[MCP] Server started on port ${port}`);
        progressQueue.send('mcp:server-started', {
          port,
          timestamp: Date.now(),
        });
        resolve();
      });

      httpServer.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(err);
        }
      });
    });
  };

  const stop = async (): Promise<void> => {
    if (!running || !httpServer) {
      console.log('[MCP] Server not running');
      return;
    }

    for (const [sessionId, transport] of transports) {
      await transport.close();
      console.log(`[MCP] Closed session: ${sessionId}`);
    }
    transports.clear();

    return new Promise((resolve) => {
      httpServer!.close(() => {
        running = false;
        httpServer = null;
        console.log('[MCP] Server stopped');
        progressQueue.send('mcp:server-stopped', { timestamp: Date.now() });
        resolve();
      });
    });
  };

  const isRunning = (): boolean => running;
  const getPort = (): number => port;

  return { start, stop, isRunning, getPort };
}

// Helper to wrap tool handlers with event emission
function wrapToolHandler<T>(
  toolName: string,
  handler: (params: T) => Promise<any>,
): (params: T) => Promise<any> {
  return async (params: T) => {
    const startTime = Date.now();
    progressQueue.send('mcp:tool-called', {
      tool: toolName,
      params,
      timestamp: startTime,
    });

    try {
      const result = await handler(params);
      progressQueue.send('mcp:tool-completed', {
        tool: toolName,
        success: !result.isError,
        durationMs: Date.now() - startTime,
        timestamp: Date.now(),
      });
      return result;
    } catch (error) {
      progressQueue.send('mcp:tool-completed', {
        tool: toolName,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime,
        timestamp: Date.now(),
      });
      throw error;
    }
  };
}

function registerToolsWithZod(
  server: any,
  provider: WorkspaceProvider,
  z: any,
): void {
  const codemodeExecutor = new CodemodeExecutor([
    {
      name: 'list_workspaces',
      execute: async () => ({ workspaces: provider.listWorkspaces() }),
    },
    {
      name: 'get_workspace',
      execute: async (args: unknown) => {
        const { workspaceId, page } = args as {
          workspaceId: string;
          page?: number;
        };
        const content = await provider.getWorkspaceContent(workspaceId, page);
        return { content };
      },
    },
    {
      name: 'search_workspace',
      execute: async (args: unknown) => {
        const { workspaceId, query } = args as {
          workspaceId: string;
          query: string;
        };
        const results = await provider.searchWorkspace(workspaceId, query);
        return { results };
      },
    },
    {
      name: 'global_search',
      execute: async (args: unknown) => {
        const { query } = args as { query: string };
        const results = await provider.globalSearch(query);
        return { results };
      },
    },
    {
      name: 'query_selector',
      execute: async (args: unknown) => {
        const { workspaceId, selector } = args as {
          workspaceId: string;
          selector: string;
        };
        const results = await provider.queryBySelector(workspaceId, selector);
        return { results };
      },
    },
    {
      name: 'find_workspaces',
      execute: async (args: unknown) => {
        const { query } = args as { query: string };
        const needle = query?.trim().toLowerCase();
        if (!needle) {
          return { results: [] };
        }
        const results = provider
          .listWorkspaces()
          .filter((w) =>
            [w.id, w.name].some((val) => val.toLowerCase().includes(needle)),
          )
          .map((w) => ({ id: w.id, name: w.name }));
        return { results };
      },
    },
    {
      name: 'search_all',
      execute: async (args: unknown) => {
        const { query, selector } = args as {
          query?: string;
          selector?: string;
        };
        const sanitizedQuery = query ? query.replace(/"/g, '\\"') : '';
        const fallbackSelector = sanitizedQuery
          ? `[text*="${sanitizedQuery}"]`
          : null;
        const effectiveSelector = selector || fallbackSelector;
        if (!effectiveSelector) {
          return { results: [] };
        }
        const workspaces = provider.listWorkspaces();
        const results = await Promise.all(
          workspaces.map(async (w) => ({
            workspaceId: w.id,
            workspaceName: w.name,
            workspacePath: w.workspacePath,
            results: await provider.queryBySelector(w.id, effectiveSelector),
          })),
        );
        return { results };
      },
    },

    {
      name: 'show_result',
      execute: async (args: unknown) => {
        const { workspaceId, selector, results, label } = args as {
          workspaceId?: string;
          selector?: string;
          results?: Array<{
            workspaceId: string;
            page: number;
            type: string;
            text: string;
            bbox: { xMin: number; yMin: number; xMax: number; yMax: number };
            workspaceName?: string;
            workspacePath?: string;
          }>;
          label?: string;
        };

        const resolvedResults = results ?? [];

        if (resolvedResults.length === 0) {
          if (!workspaceId || !selector) {
            return { results: [] };
          }
          const workspace = provider.getWorkspace(workspaceId);
          if (!workspace) {
            return { error: `Workspace not found: ${workspaceId}` };
          }
          const queried = await provider.queryBySelector(workspaceId, selector);
          const enriched = queried.map((r) => ({
            ...r,
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            workspacePath: workspace.workspacePath,
          }));
          progressQueue.send('mcp:show-result', {
            workspaceId,
            workspaceName: workspace.name,
            workspacePath: workspace.workspacePath,
            selector,
            results: enriched,
            timestamp: Date.now(),
          });
          return { results: enriched };
        }

        const enriched = resolvedResults.map((r) => {
          const ws = provider.getWorkspace(r.workspaceId);
          return {
            ...r,
            workspaceName: r.workspaceName ?? ws?.name ?? r.workspaceId,
            workspacePath: r.workspacePath ?? ws?.workspacePath ?? '',
          };
        });

        progressQueue.send('mcp:show-result', {
          selector: selector ?? label ?? 'custom',
          results: enriched,
          timestamp: Date.now(),
        });

        return { results: enriched };
      },
    },
    {
      name: 'query',
      execute: async (args: unknown) => {
        const { query, display } = args as { query: string; display?: unknown };
        const ast = parseQuery(query);
        if (display) {
          ast.display = { mode: parseDisplayMode(display) };
        }
        const results = await queryEngine.execute(ast);
        progressQueue.send('query:results', { results, timestamp: Date.now() });
        return results;
      },
    },
  ]);

  server.tool(
    'codemode',
    `Execute JavaScript code that chains multiple MCP tools.

Available tools via 'mcp' object:
- mcp.list_workspaces() → { workspaces: [...] }
- mcp.get_workspace({ workspaceId, page? }) → { content: string }
- mcp.search_workspace({ workspaceId, query }) → { results: [...] }
- mcp.global_search({ query }) → { results: [...] }
- mcp.query_selector({ workspaceId, selector }) → { results: [...] }
- mcp.find_workspaces({ query }) → { results: [{ id, name }] }
- mcp.search_all({ query?, selector? }) → { results: [{ workspaceId, workspaceName, workspacePath, results: [...] }] }
- mcp.show_result({ workspaceId?, selector?, results?, label? }) → { results: [...] }
- mcp.query({ query, display? }) → { results: [...], totalCount, executionMs }

Example:
  const ws = await mcp.list_workspaces();
  for (const w of ws.workspaces) {
    const r = await mcp.query({ query: "SELECT tables FROM " + w.id });
    if (r.totalCount > 0) return { found: w.name, tables: r.totalCount };
  }
  return { found: null };
`,
    {
      code: z.string().describe('JavaScript async function body'),
      timeout: z.number().optional().describe('Timeout in ms (default: 30000)'),
    },
    wrapToolHandler(
      'codemode',
      async ({ code, timeout }: { code: string; timeout?: number }) => {
        const result = await codemodeExecutor.execute({ code, timeout });

        if (!result.success) {
          return {
            content: [
              { type: 'text', text: `Execution failed: ${result.error}` },
            ],
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
    ),
  );
}
