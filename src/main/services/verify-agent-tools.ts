/**
 * Direct tools for the verify agent - no MCP transport, runs in-process
 */
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import { requestVerifyApproval } from './human-input.service';

interface WorkspaceInfo {
  workspaceId: string;
  workspacePath: string;
  totalPages: number;
}

/**
 * Creates an in-process MCP server with verify-specific tools.
 * These tools run directly in the Electron main process.
 */
export function createVerifyAgentTools(workspace: WorkspaceInfo) {
  const { workspaceId, workspacePath, totalPages } = workspace;

  return createSdkMcpServer({
    name: 'okrapdf-verify',
    tools: [
      // Get page extraction content
      tool(
        'get_page_extraction',
        'Get extraction markdown for a specific page',
        {
          pageNumber: z.number().describe('Page number (1-indexed)'),
          source: z
            .enum(['docai', 'openrouter', 'qwen-markdown', 'parse'])
            .optional()
            .describe('Extraction source (defaults to best available)'),
        },
        async ({ pageNumber, source }) => {
          const paddedPage = String(pageNumber).padStart(3, '0');
          // qwen-markdown is preferred for markdown extraction
          const sources = source ? [source] : ['qwen-markdown', 'parse', 'docai', 'openrouter'];

          for (const src of sources) {
            const filePath = path.join(
              workspacePath,
              'plugins',
              src === 'docai' ? 'google-docai' : src,
              `page-${paddedPage}.md`,
            );
            try {
              const content = await fs.readFile(filePath, 'utf-8');
              return { content: [{ type: 'text' as const, text: JSON.stringify({ source: src, content, pageNumber }) }] };
            } catch {
              // Try next source
            }
          }

          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `No extraction found for page ${pageNumber}` }) }] };
        },
      ),

      // List available extractions
      tool(
        'list_extractions',
        'List all available extractions in the workspace',
        {},
        async () => {
          const pluginsDir = path.join(workspacePath, 'plugins');
          const results: Record<string, number[]> = {};

          try {
            const plugins = await fs.readdir(pluginsDir);
            for (const plugin of plugins) {
              const pluginDir = path.join(pluginsDir, plugin);
              const stat = await fs.stat(pluginDir);
              if (!stat.isDirectory()) continue;

              const files = await fs.readdir(pluginDir);
              const pages = files
                .filter((f) => f.startsWith('page-') && f.endsWith('.md'))
                .map((f) => parseInt(f.replace('page-', '').replace('.md', ''), 10))
                .filter((n) => !isNaN(n))
                .sort((a, b) => a - b);

              if (pages.length > 0) {
                results[plugin] = pages;
              }
            }
          } catch {
            // plugins dir doesn't exist
          }

          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ workspaceId, totalPages, extractions: results }) }],
          };
        },
      ),

      // Get tables from workspace with rich metadata for prioritization
      tool(
        'get_tables',
        'Get all tables detected in workspace. Returns tables with page, title, rows, columns for priority queue building.',
        {},
        async () => {
          // Read from index if available
          const indexPath = path.join(workspacePath, '.okra', 'tables.json');
          try {
            const data = await fs.readFile(indexPath, 'utf-8');
            return { content: [{ type: 'text' as const, text: data }] };
          } catch {
            // Scan extractions for tables with richer metadata
            const tables: Array<{
              page: number;
              title: string;
              rows: number;
              columns: number;
              hasFinancialData: boolean;
            }> = [];
            const pluginsDir = path.join(workspacePath, 'plugins');
            const financialKeywords = /revenue|income|assets|liabilities|equity|cash|profit|loss|balance|expense/i;
            const currencyPattern = /\$[\d,]+|\d+\.\d{2}|[\d,]+\s*(million|billion|M|B|K)/i;

            try {
              // Prefer qwen-markdown, then parse, then docai
              const plugins = await fs.readdir(pluginsDir);
              const preferredOrder = ['qwen-markdown', 'parse', 'docai', 'openrouter'];
              const sortedPlugins = plugins.sort((a, b) => {
                const aIdx = preferredOrder.indexOf(a);
                const bIdx = preferredOrder.indexOf(b);
                return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
              });

              for (const plugin of sortedPlugins) {
                const pluginDir = path.join(pluginsDir, plugin);
                const stat = await fs.stat(pluginDir);
                if (!stat.isDirectory()) continue;

                const files = await fs.readdir(pluginDir);

                for (const file of files) {
                  if (!file.startsWith('page-') || !file.endsWith('.md')) continue;
                  const pageNum = parseInt(file.replace('page-', '').replace('.md', ''), 10);
                  const content = await fs.readFile(path.join(pluginDir, file), 'utf-8');

                  // Enhanced table detection
                  if (content.includes('|') && content.includes('---')) {
                    const lines = content.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                      const line = lines[i];
                      const nextLine = lines[i + 1];
                      if (line.includes('|') && nextLine?.includes('---') && nextLine.includes('|')) {
                        // Count columns from separator row
                        const columns = (nextLine.match(/\|/g) || []).length - 1;

                        // Count rows until table ends
                        let rows = 1; // header row
                        for (let j = i + 2; j < lines.length; j++) {
                          if (lines[j].includes('|')) {
                            rows++;
                          } else {
                            break;
                          }
                        }

                        // Get title from line before table or first header cell
                        let title = lines[i - 1]?.trim() || '';
                        if (!title || title.startsWith('|')) {
                          // Extract from first header cell
                          const headerCells = line.split('|').filter(c => c.trim());
                          title = headerCells[0]?.trim() || `Table on page ${pageNum}`;
                        }

                        // Check for financial data
                        const tableContent = lines.slice(i, i + rows + 2).join('\n');
                        const hasFinancialData = financialKeywords.test(tableContent) || currencyPattern.test(tableContent);

                        tables.push({
                          page: pageNum,
                          title: title.slice(0, 60),
                          rows,
                          columns: Math.max(columns, 1),
                          hasFinancialData,
                        });
                      }
                    }
                  }
                }
                break; // Only scan first available plugin
              }
            } catch {
              // No plugins
            }

            // Sort: financial tables first, then by size (rows * columns)
            tables.sort((a, b) => {
              if (a.hasFinancialData !== b.hasFinancialData) {
                return b.hasFinancialData ? 1 : -1;
              }
              return (b.rows * b.columns) - (a.rows * a.columns);
            });

            // Build priority queue recommendation
            const priorityPages = Array.from(new Set(tables.map(t => t.page)));

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  tables,
                  count: tables.length,
                  priorityQueue: priorityPages,
                  recommendation: priorityPages.length > 0
                    ? `Start with pages ${priorityPages.slice(0, 5).join(', ')} (tables with ${tables.filter(t => t.hasFinancialData).length} financial)`
                    : 'No tables found - process pages in order',
                }),
              }],
            };
          }
        },
      ),

      // Search workspace content
      tool(
        'search_workspace',
        'Search for text across all extractions',
        {
          query: z.string().describe('Search query (regex supported)'),
          limit: z.number().optional().describe('Max results (default 20)'),
        },
        async ({ query, limit = 20 }) => {
          const results: Array<{
            page: number;
            source: string;
            matches: string[];
          }> = [];
          const pluginsDir = path.join(workspacePath, 'plugins');
          const regex = new RegExp(query, 'gi');

          try {
            const plugins = await fs.readdir(pluginsDir);
            for (const plugin of plugins) {
              const pluginDir = path.join(pluginsDir, plugin);
              const stat = await fs.stat(pluginDir);
              if (!stat.isDirectory()) continue;

              const files = await fs.readdir(pluginDir);
              for (const file of files) {
                if (!file.startsWith('page-') || !file.endsWith('.md')) continue;

                const pageNum = parseInt(file.replace('page-', '').replace('.md', ''), 10);
                const content = await fs.readFile(path.join(pluginDir, file), 'utf-8');
                const matches = content.match(regex);

                if (matches && matches.length > 0) {
                  const uniqueMatches = Array.from(new Set(matches)).slice(0, 5);
                  results.push({
                    page: pageNum,
                    source: plugin,
                    matches: uniqueMatches,
                  });
                }

                if (results.length >= limit) break;
              }
              if (results.length >= limit) break;
            }
          } catch {
            // No plugins dir
          }

          return { content: [{ type: 'text' as const, text: JSON.stringify({ query, results, totalResults: results.length }) }] };
        },
      ),

      // Request human verification approval (BLOCKING)
      tool(
        'request_verify_approval',
        'Request human approval for a page verification. Shows PDF vs extraction side-by-side. BLOCKS until user responds. Extractions are loaded from disk automatically.',
        {
          pageNumber: z.number().describe('Page number to verify'),
          analysis: z.object({
            contentType: z.string().describe('Detected content type (e.g., "Balance Sheet", "Table")'),
            confidence: z.number().describe('Confidence score 0-1'),
            findings: z.array(z.string()).describe('Key findings from analysis'),
            issues: z.array(z.string()).optional().describe('Detected issues'),
          }),
        },
        async ({ pageNumber, analysis }) => {
          // Load extractions from disk to avoid agent token limits truncating content
          const loadedExtractions: Record<string, string> = {};
          const pluginsDir = path.join(workspacePath, 'plugins');
          const sources = ['qwen-markdown', 'parse', 'docai', 'openrouter'];

          for (const source of sources) {
            const filePath = path.join(pluginsDir, source, `page-${String(pageNumber).padStart(3, '0')}.md`);
            try {
              const content = await fs.readFile(filePath, 'utf-8');
              if (content.trim()) {
                loadedExtractions[source] = content;
              }
            } catch {
              // Source not available for this page
            }
          }

          // Read current progress to send queueInfo
          let queueInfo = { current: 1, total: totalPages, verified: 0, flagged: 0 };
          const progressPath = path.join(
            process.env.HOME || '',
            '.okrapdf',
            'verify-progress',
            `${workspaceId}.json`,
          );
          try {
            const progressData = await fs.readFile(progressPath, 'utf-8');
            const progress = JSON.parse(progressData);
            const verified = progress.summary?.verified || 0;
            const flagged = progress.summary?.flagged || 0;
            const skipped = progress.summary?.skipped || 0;
            queueInfo = {
              current: verified + flagged + skipped + 1,
              total: totalPages,
              verified,
              flagged,
            };
          } catch {
            // No progress file yet
          }

          const response = await requestVerifyApproval({
            workspaceId,
            pageNumber,
            analysis,
            extractions: loadedExtractions,
            queueInfo,
          });

          // Handle re-extract: agent should stay on this page
          if (response.action === 'reextract') {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  pageNumber,
                  action: 'reextract',
                  notes: response.notes,
                  instruction: 'User requested re-extraction. Stay on this page and wait for extraction to complete before requesting approval again.',
                }),
              }],
            };
          }

          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ pageNumber, action: response.action, notes: response.notes }) }],
          };
        },
      ),

      // Get verification progress
      tool(
        'get_progress',
        'Get current verification progress',
        {},
        async () => {
          const progressPath = path.join(
            process.env.HOME || '',
            '.okrapdf',
            'verify-progress',
            `${workspaceId}.json`,
          );

          try {
            const data = await fs.readFile(progressPath, 'utf-8');
            return { content: [{ type: 'text' as const, text: data }] };
          } catch {
            const defaultProgress = {
              workspaceId,
              totalPages,
              pages: {},
              summary: {
                verified: 0,
                flagged: 0,
                skipped: 0,
                pending: totalPages,
              },
            };
            return { content: [{ type: 'text' as const, text: JSON.stringify(defaultProgress) }] };
          }
        },
      ),

      // Find similar issues across pages (for batch fix proposals)
      tool(
        'find_similar_issues',
        'Find pages with similar content patterns or issues. Use after noticing repeated issues to propose batch fixes.',
        {
          pattern: z.string().describe('Regex pattern to match (e.g., "missing.*header", "\\$[0-9]+ vs \\$[0-9]+")'),
          issueDescription: z.string().describe('Human-readable description of the issue'),
        },
        async ({ pattern, issueDescription }) => {
          const matches: Array<{
            page: number;
            source: string;
            context: string;
          }> = [];
          const pluginsDir = path.join(workspacePath, 'plugins');

          try {
            const regex = new RegExp(pattern, 'gi');
            const plugins = await fs.readdir(pluginsDir);

            for (const plugin of plugins) {
              const pluginDir = path.join(pluginsDir, plugin);
              const stat = await fs.stat(pluginDir);
              if (!stat.isDirectory()) continue;

              const files = await fs.readdir(pluginDir);
              for (const file of files) {
                if (!file.startsWith('page-') || !file.endsWith('.md')) continue;

                const pageNum = parseInt(file.replace('page-', '').replace('.md', ''), 10);
                const content = await fs.readFile(path.join(pluginDir, file), 'utf-8');
                const match = content.match(regex);

                if (match && match.length > 0) {
                  // Get context around first match
                  const idx = content.indexOf(match[0]);
                  const start = Math.max(0, idx - 50);
                  const end = Math.min(content.length, idx + match[0].length + 50);
                  const context = content.slice(start, end).replace(/\n/g, ' ').trim();

                  matches.push({
                    page: pageNum,
                    source: plugin,
                    context: `...${context}...`,
                  });
                }
              }
              break; // Only scan first plugin
            }
          } catch (e) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({ error: `Invalid pattern: ${e instanceof Error ? e.message : 'unknown'}` }),
              }],
            };
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                issueDescription,
                pattern,
                matches,
                count: matches.length,
                pages: matches.map(m => m.page),
                suggestion: matches.length >= 3
                  ? `Found ${matches.length} pages with "${issueDescription}". Consider proposing a batch fix.`
                  : matches.length > 0
                    ? `Found ${matches.length} pages - not enough for batch fix yet.`
                    : 'No matching pages found.',
              }),
            }],
          };
        },
      ),

      // Update verification progress
      tool(
        'update_progress',
        'Update verification progress for a page',
        {
          pageNumber: z.number(),
          status: z.enum(['verified', 'flagged', 'skipped', 'pending']),
          notes: z.string().optional(),
        },
        async ({ pageNumber, status, notes }) => {
          const progressDir = path.join(process.env.HOME || '', '.okrapdf', 'verify-progress');
          const progressPath = path.join(progressDir, `${workspaceId}.json`);

          await fs.mkdir(progressDir, { recursive: true });

          let progress;
          try {
            const data = await fs.readFile(progressPath, 'utf-8');
            progress = JSON.parse(data);
          } catch {
            progress = {
              workspaceId,
              totalPages,
              pages: {},
              summary: { verified: 0, flagged: 0, skipped: 0, pending: totalPages },
            };
          }

          progress.pages[pageNumber] = {
            status,
            notes,
            timestamp: new Date().toISOString(),
          };

          // Recalculate summary
          const pages = Object.values(progress.pages) as Array<{ status: string }>;
          progress.summary = {
            verified: pages.filter((p) => p.status === 'verified').length,
            flagged: pages.filter((p) => p.status === 'flagged').length,
            skipped: pages.filter((p) => p.status === 'skipped').length,
            pending: totalPages - pages.length,
          };

          await fs.writeFile(progressPath, JSON.stringify(progress, null, 2));

          return { content: [{ type: 'text' as const, text: JSON.stringify(progress) }] };
        },
      ),
    ],
  });
}
