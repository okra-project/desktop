/**
 * Agent Handlers - Claude Code and Review Agent integration
 */

import { ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { storeService } from '../services/store.service';
import { getHandlerContext } from './index';
import { sendTelemetryEvent } from './telemetry.handlers';
import { getClaudeEnv } from '../utils/pdf.utils';

// Store active review agent abort controllers
const reviewAgentAbortControllers = new Map<string, AbortController>();

/**
 * Get bundled bun path (works on fresh install without Node.js)
 */
function getBundledBunPath(): string | undefined {
  if (app.isPackaged) {
    const bunPath = path.join(process.resourcesPath, 'bun');
    if (fs.existsSync(bunPath)) return bunPath;
  }
  // Development: use resources directory or system bun
  const devResourcePath = path.join(__dirname, '../../resources/bun');
  if (fs.existsSync(devResourcePath)) return devResourcePath;
  try {
    const result = execSync('which bun', { encoding: 'utf-8' }).trim();
    if (result && fs.existsSync(result)) return result;
  } catch {
    /* no system bun */
  }
  return undefined;
}

/**
 * Get bundled uv path (for Python/MCP servers)
 */
function getBundledUvPath(): string | undefined {
  if (app.isPackaged) {
    const uvPath = path.join(process.resourcesPath, 'uv');
    if (fs.existsSync(uvPath)) return uvPath;
  }
  const devResourcePath = path.join(__dirname, '../../resources/uv');
  if (fs.existsSync(devResourcePath)) return devResourcePath;
  try {
    const result = execSync('which uv', { encoding: 'utf-8' }).trim();
    if (result && fs.existsSync(result)) return result;
  } catch {
    /* no system uv */
  }
  return undefined;
}

/**
 * Find claude CLI - the SDK bundles its own cli.js
 */
function getBundledClaudePath(): string | undefined {
  if (app.isPackaged) {
    const resourcePath = path.join(
      process.resourcesPath,
      'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk/cli.js',
    );
    if (fs.existsSync(resourcePath)) return resourcePath;
  }
  // Development
  const devPath = path.join(
    __dirname,
    '../../node_modules/@anthropic-ai/claude-agent-sdk/cli.js',
  );
  if (fs.existsSync(devPath)) return devPath;
  return undefined;
}

export function registerAgentHandlers(): void {
  // Claude Code query handler
  ipcMain.on(
    'claude-code:query',
    async (
      event,
      data:
        | string
        | { content: string; files?: { name: string; buffer: ArrayBuffer }[] },
    ) => {
      const ctx = getHandlerContext();
      const abortController = new AbortController();
      const cwd = ctx.getCurrentWorkspacePath() || ctx.workspacesDir;
      const problemsDir = path.join(cwd, 'problems');
      const outputDir = cwd;
      console.error('Querying in workspace:', cwd);

      if (!storeService.hasAnthropicApiKey()) {
        event.reply(
          'claude-code:error',
          'Please configure your Anthropic API key in Settings > Agent Providers.',
        );
        return;
      }

      const queryStartTime = Date.now();
      sendTelemetryEvent('agent_query_started', {
        hasFiles: !!(typeof data !== 'string' && data.files?.length),
        workspacePath: cwd,
      });

      // Track files in output directory before starting
      let initialOutputFiles: string[] = [];
      try {
        if (fs.existsSync(outputDir)) {
          initialOutputFiles = fs.readdirSync(outputDir).filter((file) => {
            const filePath = path.join(outputDir, file);
            const ext = path.extname(file).toLowerCase();
            return (
              fs.statSync(filePath).isFile() &&
              (ext === '.xlsx' || ext === '.csv')
            );
          });
        }
      } catch (error) {
        console.warn('Could not read initial output directory:', error);
      }

      const BASE_PROMPT = `You are working in an OkraPDF document workspace. Read CLAUDE.md first to understand the available files and structure.

Key files:
- *.pdf - The original PDF document (kept with original filename)
- tables/*.md - Extracted tables as markdown
- ocr/*.md - OCR text per page (flat)
- derived/ocr/{jobId}/*.md - OCR text per page (namespaced)
- metadata.json - Document metadata

When answering questions, cite specific page numbers. Use the xlsx and pdf skills for file operations.

---

User query: `;

      // Handle both old string format and new object format
      let prompt: string = BASE_PROMPT;
      let files: { name: string; buffer: ArrayBuffer }[] | undefined;

      if (typeof data === 'string') {
        prompt += data;
      } else {
        prompt += data.content;
        files = data.files;
      }

      try {
        // Save uploaded files to problems directory
        if (files && files.length > 0) {
          const fsPromises = fs.promises;

          try {
            await fsPromises.access(problemsDir);
          } catch {
            await fsPromises.mkdir(problemsDir, { recursive: true });
          }

          for (const file of files) {
            try {
              if (file.buffer.byteLength > 10 * 1024 * 1024) {
                console.warn(
                  `File ${file.name} is too large (${Math.round(file.buffer.byteLength / 1024 / 1024)}MB), skipping`,
                );
                event.reply(
                  'claude-code:error',
                  `File ${file.name} is too large. Maximum size is 10MB.`,
                );
                continue;
              }

              const timestamp = Date.now();
              const randomSuffix = Math.random().toString(36).substring(2, 8);
              const ext = path.extname(file.name);
              const baseName = path.basename(file.name, ext);
              const uniqueFileName = `${baseName}_${timestamp}_${randomSuffix}${ext}`;
              const filePath = path.join(problemsDir, uniqueFileName);

              const buffer = Buffer.from(file.buffer);
              await fsPromises.writeFile(filePath, buffer);

              console.error(`Saved file: ${uniqueFileName} to ${problemsDir}`);
              prompt += `\n\nUploaded file: ${uniqueFileName} (saved to ${filePath})`;
            } catch (fileError) {
              console.error(`Error processing file ${file.name}:`, fileError);
              event.reply(
                'claude-code:error',
                `Failed to save file ${file.name}: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`,
              );
            }
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const messages: any[] = [];

        const bunPath = getBundledBunPath();
        if (!bunPath) {
          event.reply(
            'claude-code:error',
            'Bundled runtime not found. This is a packaging bug - please report it.',
          );
          return;
        }

        const claudePath = getBundledClaudePath();
        if (!claudePath) {
          event.reply(
            'claude-code:error',
            'Claude Code CLI not found in SDK bundle. This is a bug - please report it.',
          );
          return;
        }

        const uvPath = getBundledUvPath();
        const runtimeDir = app.isPackaged
          ? process.resourcesPath
          : path.join(__dirname, '../../resources');
        const baseEnv = {
          ...process.env,
          PATH: `${runtimeDir}:${process.env.PATH || ''}`,
        };
        const enhancedEnv = getClaudeEnv(baseEnv, () =>
          storeService.getAnthropicApiKey(),
        );

        console.error(`[query] Using bun: ${bunPath}`);
        console.error(`[query] Using uv: ${uvPath || 'not found'}`);
        console.error(`[query] Using claude: ${claudePath}`);

        // Dynamic import for ESM-only SDK
        const { query } = await import('@anthropic-ai/claude-agent-sdk');
        const queryIterator = query({
          prompt,
          options: {
            cwd,
            pathToClaudeCodeExecutable: claudePath,
            env: enhancedEnv,
            stderr: (msg) => console.error('[SDK stderr]', msg),
            abortController,
            maxTurns: 100,
            settingSources: ['local', 'project'],
            allowedTools: [
              'Bash',
              'Create',
              'Edit',
              'Read',
              'Write',
              'MultiEdit',
              'WebSearch',
              'GrepTool',
              'Skill',
              'TodoWrite',
              'TodoEdit',
            ],
          },
        });

        for await (const message of queryIterator) {
          messages.push(message);
          console.error(JSON.stringify(message));
          event.reply('claude-code:response', message);
        }

        // Check for new output files after completion
        try {
          if (fs.existsSync(outputDir)) {
            const finalOutputFiles = fs.readdirSync(outputDir);
            const newFiles = finalOutputFiles.filter((file) => {
              if (initialOutputFiles.includes(file)) return false;
              const filePath = path.join(outputDir, file);
              const ext = path.extname(file).toLowerCase();
              return (
                fs.statSync(filePath).isFile() &&
                (ext === '.xlsx' || ext === '.csv')
              );
            });

            if (newFiles.length > 0) {
              const outputFiles = newFiles.map((fileName) => ({
                name: fileName,
                path: path.join(outputDir, fileName),
                size: fs.statSync(path.join(outputDir, fileName)).size,
                created: fs.statSync(path.join(outputDir, fileName)).mtime,
              }));

              console.error('New output files detected:', outputFiles);
              event.reply('claude-code:output-files', outputFiles);
            }
          }
        } catch (error) {
          console.warn('Error checking for output files:', error);
        }

        console.error('FINISHED CLAUDE CODE EVALUATION!');

        sendTelemetryEvent('agent_query_completed', {
          durationMs: Date.now() - queryStartTime,
          messageCount: messages.length,
          outputFilesCount: fs.existsSync(outputDir)
            ? fs
                .readdirSync(outputDir)
                .filter((f) =>
                  ['.xlsx', '.csv'].includes(path.extname(f).toLowerCase()),
                ).length
            : 0,
        });
      } catch (error) {
        console.error('Claude Code SDK error:', error);

        sendTelemetryEvent('agent_query_error', {
          durationMs: Date.now() - queryStartTime,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        event.reply(
          'claude-code:error',
          error instanceof Error ? error.message : 'Unknown error',
        );
      }
    },
  );

  // Review agent query handler
  ipcMain.on(
    'review-agent:query',
    async (
      event,
      data: {
        sessionId: string;
        message: string;
        context: {
          jobId: string;
          documentName?: string;
          currentPage?: number;
          tableMarkdown?: string;
          pageContent?: string;
        };
      },
    ) => {
      const { sessionId, message, context } = data;
      console.error(
        `[review-agent] Query received for session ${sessionId}:`,
        message.slice(0, 100),
      );

      const abortController = new AbortController();
      reviewAgentAbortControllers.set(sessionId, abortController);

      try {
        const systemContext = [
          `You are a document review assistant helping verify OCR extraction results.`,
          ``,
          `Current context:`,
          `- Job ID: ${context.jobId}`,
          context.documentName ? `- Document: ${context.documentName}` : null,
          context.currentPage ? `- Page: ${context.currentPage}` : null,
          ``,
          context.tableMarkdown
            ? `## Table Content (editable)\n\`\`\`markdown\n${context.tableMarkdown}\n\`\`\``
            : null,
          context.pageContent
            ? `## Page Content\n\`\`\`\n${context.pageContent}\n\`\`\``
            : null,
          ``,
          `Your role:`,
          `- Answer questions about the extracted content`,
          `- Help verify table data accuracy`,
          `- Suggest corrections when you spot issues`,
          `- Be concise and direct`,
        ]
          .filter(Boolean)
          .join('\n');

        const fullPrompt = `${systemContext}\n\n## User Request\n${message}`;

        const workspacePath =
          storeService.getLastWorkspacePath() ||
          path.join(app.getPath('desktop'), 'okrapdf');

        const bunPath = getBundledBunPath();
        const claudePath = getBundledClaudePath();

        if (!bunPath || !claudePath) {
          event.reply('review-agent:error', {
            sessionId,
            error: 'Runtime not found',
          });
          return;
        }

        const runtimeDir = app.isPackaged
          ? process.resourcesPath
          : path.join(__dirname, '../../resources');
        const baseEnv = {
          ...process.env,
          PATH: `${runtimeDir}:${process.env.PATH || ''}`,
        };
        const enhancedEnv = getClaudeEnv(baseEnv, () =>
          storeService.getAnthropicApiKey(),
        );

        console.error('[review-agent] About to import SDK...');
        const { query } = await import('@anthropic-ai/claude-agent-sdk');
        console.error('[review-agent] SDK imported, starting query...');

        const queryIterator = query({
          prompt: fullPrompt,
          options: {
            cwd: workspacePath,
            pathToClaudeCodeExecutable: claudePath,
            env: enhancedEnv,
            stderr: (msg) => console.error('[review-agent stderr]', msg),
            abortController,
            maxTurns: 10,
            allowedTools: ['Read', 'WebSearch'],
          },
        });

        for await (const sdkMessage of queryIterator) {
          if (abortController.signal.aborted) {
            console.error(`[review-agent] Session ${sessionId} aborted`);
            break;
          }

          if (sdkMessage.type === 'assistant') {
            const textContent = sdkMessage.message.content
              .filter((block: { type: string }) => block.type === 'text')
              .map((block: { type: string; text?: string }) => block.text || '')
              .join('');

            if (textContent) {
              event.reply('review-agent:response', {
                sessionId,
                type: 'text',
                content: textContent,
              });
            }
          } else if (sdkMessage.type === 'result') {
            // Result message indicates completion/error - subtype has the details
            event.reply('review-agent:response', {
              sessionId,
              type: 'tool_result',
              content: `Result: ${sdkMessage.subtype}`,
            });
          }
        }

        event.reply('review-agent:done', { sessionId });
      } catch (error) {
        console.error('[review-agent] Error:', error);
        event.reply('review-agent:error', {
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        reviewAgentAbortControllers.delete(sessionId);
      }
    },
  );

  // Handle abort requests
  ipcMain.on('review-agent:abort', (_event, sessionId: string) => {
    const controller = reviewAgentAbortControllers.get(sessionId);
    if (controller) {
      console.error(`[review-agent] Aborting session ${sessionId}`);
      controller.abort();
      reviewAgentAbortControllers.delete(sessionId);
    }
  });
}
