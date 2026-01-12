/**
 * MCP Service - Manages MCP server lifecycle
 *
 * Handles starting/stopping the MCP server and provides workspace access
 * for external tools (Claude Code, etc.)
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { IService } from './index';
import { storeService, type LocalWorkspace } from './store.service';
import {
  createMcpServer,
  type McpServerInstance,
  type WorkspaceProvider,
} from '../mcp';

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

        const ocrDir = path.join(workspace.workspacePath, 'ocr');
        if (!fs.existsSync(ocrDir)) return null;

        // Find provider subdirectory (e.g., ocr/openrouter/)
        const providerDirs = fs
          .readdirSync(ocrDir)
          .filter((f) => fs.statSync(path.join(ocrDir, f)).isDirectory());
        const activeDir = providerDirs.length > 0 ? path.join(ocrDir, providerDirs[0]) : ocrDir;

        if (pageNum !== undefined) {
          const pageFile = path.join(
            activeDir,
            `page-${String(pageNum).padStart(3, '0')}.md`,
          );
          if (fs.existsSync(pageFile)) {
            return fs.readFileSync(pageFile, 'utf-8');
          }
          return null;
        }

        // Return all pages concatenated
        const files = fs
          .readdirSync(activeDir)
          .filter((f) => f.endsWith('.md'))
          .sort();
        const contents = files.map((f) => {
          const pageMatch = f.match(/page-(\d+)\.md/);
          const page = pageMatch ? parseInt(pageMatch[1], 10) : 0;
          const content = fs.readFileSync(path.join(activeDir, f), 'utf-8');
          return `## Page ${page}\n\n${content}`;
        });
        return contents.join('\n\n---\n\n');
      },

      searchWorkspace: async (id: string, query: string) => {
        const workspace = storeService.getWorkspaceById(id);
        if (!workspace) return [];

        const ocrDir = path.join(workspace.workspacePath, 'ocr');
        if (!fs.existsSync(ocrDir)) return [];

        // Find provider subdirectory (e.g., ocr/openrouter/)
        const providerDirs = fs
          .readdirSync(ocrDir)
          .filter((f) => fs.statSync(path.join(ocrDir, f)).isDirectory());
        const activeDir = providerDirs.length > 0 ? path.join(ocrDir, providerDirs[0]) : ocrDir;

        const results: Array<{ page: number; snippet: string }> = [];
        const files = fs
          .readdirSync(activeDir)
          .filter((f) => f.endsWith('.md'))
          .sort();
        const lowerQuery = query.toLowerCase();

        for (const f of files) {
          const pageMatch = f.match(/page-(\d+)\.md/);
          const page = pageMatch ? parseInt(pageMatch[1], 10) : 0;
          const content = fs.readFileSync(path.join(activeDir, f), 'utf-8');

          if (content.toLowerCase().includes(lowerQuery)) {
            const idx = content.toLowerCase().indexOf(lowerQuery);
            const start = Math.max(0, idx - 100);
            const end = Math.min(content.length, idx + query.length + 100);
            const snippet =
              (start > 0 ? '...' : '') +
              content.slice(start, end) +
              (end < content.length ? '...' : '');
            results.push({ page, snippet });
          }
        }
        return results;
      },

      globalSearch: async (query: string) => {
        const workspaces = storeService.getLocalWorkspaces();

        // Collect all ocr directories that exist (including provider subdirs)
        const ocrDirs: Array<{
          workspace: LocalWorkspace;
          ocrDir: string;
        }> = [];
        for (const ws of workspaces) {
          const ocrDir = path.join(ws.workspacePath, 'ocr');
          if (fs.existsSync(ocrDir)) {
            // Check for provider subdirectories
            const providerDirs = fs
              .readdirSync(ocrDir)
              .filter((f) => fs.statSync(path.join(ocrDir, f)).isDirectory());
            if (providerDirs.length > 0) {
              // Use first provider dir
              ocrDirs.push({ workspace: ws, ocrDir: path.join(ocrDir, providerDirs[0]) });
            } else {
              ocrDirs.push({ workspace: ws, ocrDir });
            }
          }
        }

        if (ocrDirs.length === 0) return [];

        const results: Array<{
          workspaceId: string;
          workspaceName: string;
          filePath: string;
          matches: Array<{ page: number; line: string }>;
        }> = [];

        try {
          // Use ripgrep for fast search
          const rgArgs = [
            '--json',
            '-i',
            '-n',
            '--max-count',
            '5',
            query,
            ...ocrDirs.map((d) => d.ocrDir),
          ];

          const rgOutput = await new Promise<string>((resolve, reject) => {
            const rg = spawn('rg', rgArgs);
            let stdout = '';
            let stderr = '';

            rg.stdout.on('data', (data) => {
              stdout += data.toString();
            });
            rg.stderr.on('data', (data) => {
              stderr += data.toString();
            });
            rg.on('close', (code) => {
              if (code === 0 || code === 1) {
                resolve(stdout);
              } else {
                reject(new Error(`rg exited with code ${code}: ${stderr}`));
              }
            });
            rg.on('error', (err) => reject(err));
          });

          // Parse JSON lines output
          const lines = rgOutput.trim().split('\n').filter(Boolean);
          const matchesByFile = new Map<
            string,
            Array<{ line: number; text: string }>
          >();

          for (const line of lines) {
            try {
              const obj = JSON.parse(line);
              if (obj.type === 'match') {
                const filePath = obj.data.path.text;
                const lineNum = obj.data.line_number;
                const text = obj.data.lines.text.trim();

                if (!matchesByFile.has(filePath)) {
                  matchesByFile.set(filePath, []);
                }
                matchesByFile.get(filePath)!.push({ line: lineNum, text });
              }
            } catch {
              // Skip malformed JSON
            }
          }

          // Map file paths back to workspaces
          for (const [filePath, fileMatches] of matchesByFile) {
            const ocrEntry = ocrDirs.find((d) =>
              filePath.startsWith(d.ocrDir),
            );
            if (ocrEntry) {
              const fileName = path.basename(filePath);
              const pageMatch = fileName.match(/page-(\d+)\.md/);
              const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 0;

              let wsResult = results.find(
                (r) => r.workspaceId === ocrEntry.workspace.id,
              );
              if (!wsResult) {
                wsResult = {
                  workspaceId: ocrEntry.workspace.id,
                  workspaceName: ocrEntry.workspace.name,
                  filePath: ocrEntry.workspace.workspacePath,
                  matches: [],
                };
                results.push(wsResult);
              }

              for (const m of fileMatches) {
                wsResult.matches.push({ page: pageNum, line: m.text });
              }
            }
          }
        } catch (err) {
          console.error('[McpService.globalSearch] ripgrep error:', err);
        }

        return results;
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
