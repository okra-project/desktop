/**
 * MCP Service - Manages MCP server lifecycle
 *
 * Handles starting/stopping the MCP server and provides workspace access
 * for external tools (Claude Code, etc.)
 */

import fs from 'fs';
import path from 'path';
import type { IService } from './index';
import { storeService } from './store.service';
import { indexService } from './index.service';
import {
  createMcpServer,
  type McpServerInstance,
  type WorkspaceProvider,
} from '../mcp';

function findPluginDir(workspacePath: string): string | null {
  const pluginsDir = path.join(workspacePath, 'plugins');
  if (!fs.existsSync(pluginsDir)) return null;

  const providerDirs = fs
    .readdirSync(pluginsDir)
    .filter((f) => fs.statSync(path.join(pluginsDir, f)).isDirectory());

  return providerDirs.length > 0
    ? path.join(pluginsDir, providerDirs[0])
    : null;
}

class McpService implements IService {
  readonly serviceName = 'McpService';

  private serverInstance: McpServerInstance | null = null;

  /**
   * Create workspace provider that exposes workspace data to MCP tools
   */
  createWorkspaceProvider(): WorkspaceProvider {
    return {
      listWorkspaces: () => storeService.getLocalWorkspaces(),

      getWorkspace: (id: string) => storeService.getWorkspaceById(id) || null,

      getWorkspaceContent: async (id: string, pageNum?: number) => {
        const workspace = storeService.getWorkspaceById(id);
        if (!workspace) return null;

        const activeDir = findPluginDir(workspace.workspacePath);
        if (!activeDir) return null;

        const parsePageContent = (content: string) => {
          try {
            return JSON.parse(content);
          } catch {
            return { raw: content };
          }
        };

        if (pageNum !== undefined) {
          const pageFile = path.join(
            activeDir,
            `page-${String(pageNum).padStart(3, '0')}.md`,
          );
          if (fs.existsSync(pageFile)) {
            const content = fs.readFileSync(pageFile, 'utf-8');
            return {
              workspaceId: id,
              workspaceName: workspace.name,
              pages: [{ page: pageNum, ...parsePageContent(content) }],
            };
          }
          return null;
        }

        const files = fs
          .readdirSync(activeDir)
          .filter((f) => f.endsWith('.md'))
          .sort();
        const pages = files.map((f) => {
          const pageMatch = f.match(/page-(\d+)\.md/);
          const page = pageMatch ? parseInt(pageMatch[1], 10) : 0;
          const content = fs.readFileSync(path.join(activeDir, f), 'utf-8');
          return { page, ...parsePageContent(content) };
        });
        return {
          workspaceId: id,
          workspaceName: workspace.name,
          totalPages: pages.length,
          pages,
        };
      },

      searchWorkspace: async (id: string, query: string) => {
        const searchResults = indexService.search({ query, documentId: id });
        return searchResults.map((r) => ({
          page: r.entity.pageNumber,
          snippet: r.entity.text.slice(0, 200),
        }));
      },

      globalSearch: async (query: string) => {
        const searchResults = indexService.search({ query, limit: 100 });

        const resultsByDoc = new Map<
          string,
          {
            workspaceId: string;
            workspaceName: string;
            filePath: string;
            matches: Array<{ page: number; line: string }>;
          }
        >();

        for (const r of searchResults) {
          const docId = r.entity.documentId;
          if (!resultsByDoc.has(docId)) {
            const ws = storeService.getWorkspaceById(docId);
            resultsByDoc.set(docId, {
              workspaceId: docId,
              workspaceName: r.entity.documentName,
              filePath: ws?.workspacePath ?? '',
              matches: [],
            });
          }
          resultsByDoc.get(docId)!.matches.push({
            page: r.entity.pageNumber,
            line: r.entity.text.slice(0, 100),
          });
        }

        return Array.from(resultsByDoc.values());
      },

      queryBySelector: async (id: string, selector: string) => {
        const types: string[] = [];
        let textContains: string | null = null;
        let pageFilter: number[] | null = null;

        let limit: number | null = null;
        let offset: number | null = null;

        const typeMatches = selector.match(/\.(\w+)/g);
        if (typeMatches) {
          for (const m of typeMatches) {
            types.push(m.slice(1));
          }
        }

        const typeAttrMatches = selector.match(/\[type=["'][^"']+["']\]/g);
        if (typeAttrMatches) {
          for (const m of typeAttrMatches) {
            const value = m.match(/\[type=["']([^"']+)["']\]/)?.[1];
            if (!value) continue;
            for (const t of value.split(',')) {
              types.push(t.trim());
            }
          }
        }

        const typePseudoMatches = selector.match(/:type\(([^)]+)\)/g);
        if (typePseudoMatches) {
          for (const m of typePseudoMatches) {
            const value = m.match(/:type\(([^)]+)\)/)?.[1];
            if (!value) continue;
            for (const t of value.split(',')) {
              types.push(t.trim());
            }
          }
        }

        const textMatch = selector.match(/\[text\*=["']([^"']+)["']\]/);
        if (textMatch) {
          textContains = textMatch[1];
        }

        const pageMatch = selector.match(/:page\((\d+)(?:-(\d+))?\)/);
        if (pageMatch) {
          const start = parseInt(pageMatch[1], 10);
          const end = pageMatch[2] ? parseInt(pageMatch[2], 10) : start;
          pageFilter = [];
          for (let p = start; p <= end; p++) {
            pageFilter.push(p);
          }
        }

        const limitMatch = selector.match(/:limit\((\d+)\)/);
        if (limitMatch) {
          limit = parseInt(limitMatch[1], 10);
        }

        const offsetMatch = selector.match(/:offset\((\d+)\)/);
        if (offsetMatch) {
          offset = parseInt(offsetMatch[1], 10);
        }

        type SearchResultLike = {
          entity: {
            id: string;
            pageNumber: number;
            type: string;
            text: string;
            bbox: { xMin: number; yMin: number; xMax: number; yMax: number };
          };
        };

        let searchResults: SearchResultLike[] = [];

        if (textContains) {
          searchResults = indexService.search({
            query: textContains,
            documentId: id,
            entityTypes: types.length > 0 ? types : undefined,
            limit: 200,
          });
        } else if (types.length > 0) {
          searchResults = indexService.searchFiltered({
            documentId: id,
            entityTypes: types,
            limit: 200,
          });
        }

        // Fallback: if searching for structural types (table, figure) and no index results,
        // extract from structured workspace content
        const structuralTypes = ['table', 'figure', 'footnote', 'signature'];
        const requestedStructural = types.filter((t) =>
          structuralTypes.includes(t),
        );
        if (
          searchResults.length === 0 &&
          requestedStructural.length > 0 &&
          !textContains
        ) {
          const workspace = storeService.getWorkspaceById(id);
          if (workspace) {
            const activeDir = findPluginDir(workspace.workspacePath);
            if (activeDir) {
              const files = fs
                .readdirSync(activeDir)
                .filter((f) => f.endsWith('.md'))
                .sort();

              const structuralResults: SearchResultLike[] = [];

              for (const f of files) {
                const pageMatch = f.match(/page-(\d+)\.md/);
                const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 0;
                const content = fs.readFileSync(path.join(activeDir, f), 'utf-8');

                try {
                  const parsed = JSON.parse(content);

                  if (requestedStructural.includes('table') && parsed.tables) {
                    for (const t of parsed.tables) {
                      const [xMin, yMin, xMax, yMax] = t.bbox_2d || [0, 0, 0, 0];
                      structuralResults.push({
                        entity: {
                          id: `table-${pageNum}-${structuralResults.length}`,
                          pageNumber: pageNum,
                          type: 'table',
                          text: t.title || '',
                          bbox: { xMin, yMin, xMax, yMax },
                        },
                      });
                    }
                  }

                  if (requestedStructural.includes('figure') && parsed.figures) {
                    for (const fig of parsed.figures) {
                      const [xMin, yMin, xMax, yMax] = fig.bbox_2d || [0, 0, 0, 0];
                      structuralResults.push({
                        entity: {
                          id: `figure-${pageNum}-${structuralResults.length}`,
                          pageNumber: pageNum,
                          type: 'figure',
                          text: fig.title || '',
                          bbox: { xMin, yMin, xMax, yMax },
                        },
                      });
                    }
                  }

                  if (
                    requestedStructural.includes('footnote') &&
                    parsed.footnotes
                  ) {
                    for (const fn of parsed.footnotes) {
                      structuralResults.push({
                        entity: {
                          id: `footnote-${pageNum}-${structuralResults.length}`,
                          pageNumber: pageNum,
                          type: 'footnote',
                          text: fn.text || '',
                          bbox: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
                        },
                      });
                    }
                  }

                  if (
                    requestedStructural.includes('signature') &&
                    parsed.signatures
                  ) {
                    for (const sig of parsed.signatures) {
                      structuralResults.push({
                        entity: {
                          id: `signature-${pageNum}-${structuralResults.length}`,
                          pageNumber: pageNum,
                          type: 'signature',
                          text: sig.text || '',
                          bbox: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
                        },
                      });
                    }
                  }
                } catch {
                  // Not valid JSON, skip
                }
              }

              searchResults = structuralResults;
            }
          }
        }

        let filtered = searchResults;
        if (pageFilter) {
          filtered = filtered.filter((r) =>
            pageFilter!.includes(r.entity.pageNumber),
          );
        }
        if (offset && offset > 0) {
          filtered = filtered.slice(offset);
        }
        if (limit && limit > 0) {
          filtered = filtered.slice(0, limit);
        }

        return filtered.map((r) => ({
          id: r.entity.id,
          page: r.entity.pageNumber,
          type: r.entity.type,
          text: r.entity.text,
          bbox: r.entity.bbox,
        }));
      },
    };
  }

  async start(): Promise<void> {
    const settings = storeService.getMcpServerSettings();
    if (!settings.enabled) return;

    if (this.serverInstance?.isRunning()) {
      console.log('[MCP] Server already running');
      return;
    }

    this.serverInstance = createMcpServer({
      port: settings.port,
      workspaceProvider: this.createWorkspaceProvider(),
    });

    try {
      await this.serverInstance.start();
    } catch (err) {
      console.error('[MCP] Failed to start server:', err);
    }
  }

  async stop(): Promise<void> {
    if (this.serverInstance) {
      await this.serverInstance.stop();
      this.serverInstance = null;
    }
  }

  isRunning(): boolean {
    return this.serverInstance?.isRunning() ?? false;
  }

  getPort(): number {
    return storeService.getMcpServerSettings().port;
  }

  async dispose(): Promise<void> {
    await this.stop();
  }
}

// Singleton
export const mcpService = new McpService();
