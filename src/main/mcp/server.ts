import express, { Request, Response } from 'express';
import { Server } from 'http';
import { randomUUID } from 'crypto';
import { progressQueue } from '../utils/progress-queue';

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

export interface WorkspaceProvider {
  listWorkspaces: () => Workspace[];
  getWorkspace: (id: string) => Workspace | null;
  getWorkspaceContent: (id: string, pageNum?: number) => Promise<string | null>;
  searchWorkspace: (
    id: string,
    query: string,
  ) => Promise<Array<{ page: number; snippet: string }>>;
  globalSearch: (query: string) => Promise<GlobalSearchResult[]>;
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

    const { McpServer } = await import(
      '@modelcontextprotocol/sdk/server/mcp.js'
    );
    const { StreamableHTTPServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/streamableHttp.js'
    );
    const { isInitializeRequest } = await import(
      '@modelcontextprotocol/sdk/types.js'
    );
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
        tools: ['list_workspaces', 'get_workspace', 'search_workspace'],
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
        progressQueue.send('mcp:server-started', { port, timestamp: Date.now() });
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
  server.tool(
    'list_workspaces',
    'List all local PDF workspaces with their metadata',
    {},
    wrapToolHandler('list_workspaces', async () => {
      const workspaces = provider.listWorkspaces();

      if (workspaces.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No workspaces found. Open a PDF in OkraPDF to create a workspace.',
            },
          ],
        };
      }

      const summary = workspaces
        .map(
          (w) =>
            `- **${w.name}** (${w.id})\n  Pages: ${w.pageCount ?? '?'} | Status: ${w.extractionStatus}\n  Last opened: ${new Date(w.lastOpenedAt).toLocaleDateString()}`,
        )
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${workspaces.length} workspace(s):\n\n${summary}`,
          },
        ],
      };
    }),
  );

  server.tool(
    'get_workspace',
    'Get details and extracted content from a specific workspace',
    {
      workspaceId: z.string().describe('The workspace ID to retrieve'),
      page: z
        .number()
        .optional()
        .describe(
          'Specific page number to get (1-indexed). Omit for all pages.',
        ),
    },
    wrapToolHandler('get_workspace', async ({ workspaceId, page }: { workspaceId: string; page?: number }) => {
      const workspace = provider.getWorkspace(workspaceId);

      if (!workspace) {
        return {
          content: [
            { type: 'text', text: `Workspace not found: ${workspaceId}` },
          ],
          isError: true,
        };
      }

      const content = await provider.getWorkspaceContent(workspaceId, page);

      if (!content) {
        return {
          content: [
            {
              type: 'text',
              text: `No extracted content available for workspace: ${workspace.name}. Run OCR extraction first.`,
            },
          ],
        };
      }

      const header = `# ${workspace.name}\n\nPages: ${workspace.pageCount ?? '?'} | Status: ${workspace.extractionStatus}\n\n---\n\n`;
      return { content: [{ type: 'text', text: header + content }] };
    }),
  );

  server.tool(
    'search_workspace',
    "Search for text within a workspace's extracted content",
    {
      workspaceId: z.string().describe('The workspace ID to search'),
      query: z.string().describe('Search query (keyword or phrase)'),
    },
    wrapToolHandler('search_workspace', async ({ workspaceId, query }: { workspaceId: string; query: string }) => {
      const workspace = provider.getWorkspace(workspaceId);

      if (!workspace) {
        return {
          content: [
            { type: 'text', text: `Workspace not found: ${workspaceId}` },
          ],
          isError: true,
        };
      }

      const results = await provider.searchWorkspace(workspaceId, query);

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No results found for "${query}" in ${workspace.name}`,
            },
          ],
        };
      }

      const resultText = results
        .slice(0, 10)
        .map((r) => `**Page ${r.page}:**\n${r.snippet}`)
        .join('\n\n---\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${results.length} result(s) for "${query}" in ${workspace.name}:\n\n${resultText}`,
          },
        ],
      };
    }),
  );

  server.tool(
    'global_search',
    'Search across all PDF workspaces. Returns matching documents with snippets.',
    {
      query: z.string().describe('Search text (plain words or phrase)'),
    },
    wrapToolHandler('global_search', async ({ query }: { query: string }) => {
      if (!query || query.trim().length < 2) {
        return {
          content: [
            { type: 'text', text: 'Query must be at least 2 characters' },
          ],
          isError: true,
        };
      }

      const results = await provider.globalSearch(query.trim());

      if (results.length === 0) {
        return {
          content: [
            { type: 'text', text: `No documents found matching "${query}"` },
          ],
        };
      }

      const summary = results
        .slice(0, 20)
        .map((r) => {
          const matchPreview = r.matches
            .slice(0, 2)
            .map((m) => `  - Page ${m.page}: ${m.line.slice(0, 100)}${m.line.length > 100 ? '...' : ''}`)
            .join('\n');
          return `**${r.workspaceName}** (${r.workspaceId})\n${matchPreview}`;
        })
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${results.length} document(s) matching "${query}":\n\n${summary}`,
          },
        ],
      };
    }),
  );
}
