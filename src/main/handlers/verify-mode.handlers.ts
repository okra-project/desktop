/**
 * Verify Mode Handlers - State Machine Agent Integration
 *
 * Wraps claude-agent-sdk with structured output parsing.
 * Every agent response must be valid JSON matching AgentOutput types.
 */

import { ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { storeService } from '../services/store.service';
import { getHandlerContext } from './index';
import { getClaudeEnv } from '../utils/pdf.utils';
import {
  createVerifySession,
  getVerifySession,
  removeVerifySession,
  listVerifySessions,
  type VerifyModeSession,
} from '../verify-mode/session';
import { getEventStream, removeEventStream } from '../verify-mode/event-stream';
import { buildVerifyModePrompt } from '../verify-mode/prompt';
import type { AgentSessionConfig } from '../../shared/types/agent-session';
import {
  parseAgentOutput,
  extractJsonFromResponse,
  isBlockingOutput,
  type AgentOutput,
} from '../../shared/types/agent-output';

// Store active verify mode abort controllers
const verifyModeAbortControllers = new Map<string, AbortController>();

/**
 * Get bundled bun path (works on fresh install without Node.js)
 */
function getBundledBunPath(): string | undefined {
  if (app.isPackaged) {
    const bunPath = path.join(process.resourcesPath, 'bun');
    if (fs.existsSync(bunPath)) return bunPath;
  }
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
  const devPath = path.join(
    __dirname,
    '../../node_modules/@anthropic-ai/claude-agent-sdk/cli.js',
  );
  if (fs.existsSync(devPath)) return devPath;
  return undefined;
}

/**
 * Parse agent SDK message for structured JSON output
 */
function tryParseStructuredOutput(message: any): AgentOutput | null {
  if (message.type !== 'assistant') return null;

  const textContent = message.message?.content
    ?.filter((block: { type: string }) => block.type === 'text')
    ?.map((block: { type: string; text?: string }) => block.text || '')
    ?.join('');

  if (!textContent) return null;

  try {
    const json = extractJsonFromResponse(textContent);
    return parseAgentOutput(json);
  } catch {
    // Not structured output - may be internal reasoning
    return null;
  }
}

export function registerVerifyModeHandlers(): void {
  // Start a new verify mode session
  ipcMain.handle(
    'verify-mode:start',
    async (
      event,
      config: Omit<AgentSessionConfig, 'provider'> & { workspacePath: string },
    ) => {
      const ctx = getHandlerContext();

      if (!storeService.hasAnthropicApiKey()) {
        return {
          success: false,
          error: 'Please configure your Anthropic API key in Settings.',
        };
      }

      const sessionConfig: AgentSessionConfig = {
        ...config,
        provider: 'claude-code',
      };

      const session = createVerifySession(sessionConfig);
      const eventStream = getEventStream(session.id);

      const abortController = new AbortController();
      verifyModeAbortControllers.set(session.id, abortController);

      session.start();

      // Send initial state to renderer
      event.sender.send('verify-mode:session-update', {
        sessionId: session.id,
        session: session.data,
      });

      // Run the agent loop in background
      runVerifyModeLoop(
        session,
        config.workspacePath,
        abortController,
        event.sender,
      );

      return {
        success: true,
        sessionId: session.id,
      };
    },
  );

  // Get session state
  ipcMain.handle(
    'verify-mode:get-session',
    async (_event, sessionId: string) => {
      const session = getVerifySession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }
      return { success: true, session: session.data };
    },
  );

  // List all sessions
  ipcMain.handle('verify-mode:list-sessions', async () => {
    return { success: true, sessions: listVerifySessions() };
  });

  // Pause session
  ipcMain.handle('verify-mode:pause', async (event, sessionId: string) => {
    const session = getVerifySession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    session.pause();
    event.sender.send('verify-mode:session-update', {
      sessionId,
      session: session.data,
    });
    return { success: true };
  });

  // Resume session
  ipcMain.handle('verify-mode:resume', async (event, sessionId: string) => {
    const session = getVerifySession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    session.resume();
    event.sender.send('verify-mode:session-update', {
      sessionId,
      session: session.data,
    });
    return { success: true };
  });

  // Stop/abort session
  ipcMain.handle('verify-mode:stop', async (event, sessionId: string) => {
    const controller = verifyModeAbortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      verifyModeAbortControllers.delete(sessionId);
    }

    const session = getVerifySession(sessionId);
    if (session) {
      session.complete();
      event.sender.send('verify-mode:session-update', {
        sessionId,
        session: session.data,
      });
    }

    return { success: true };
  });

  // Submit human response (for blocking states)
  ipcMain.handle(
    'verify-mode:submit-response',
    async (
      event,
      data: {
        sessionId: string;
        responseType: 'question' | 'review' | 'approval';
        response: unknown;
      },
    ) => {
      const session = getVerifySession(data.sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      session.handleHumanResponse(data.responseType, data.response);
      event.sender.send('verify-mode:session-update', {
        sessionId: data.sessionId,
        session: session.data,
      });

      return { success: true };
    },
  );

  // Get event stream
  ipcMain.handle(
    'verify-mode:get-events',
    async (_event, sessionId: string, sinceIndex?: number) => {
      const session = getVerifySession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      const events =
        sinceIndex !== undefined
          ? session.getEventsSince(sinceIndex)
          : session.getEvents();

      return { success: true, events };
    },
  );

  // Cleanup session
  ipcMain.handle('verify-mode:cleanup', async (_event, sessionId: string) => {
    verifyModeAbortControllers.delete(sessionId);
    removeVerifySession(sessionId);
    removeEventStream(sessionId);
    return { success: true };
  });
}

/**
 * Main verify mode agent loop
 */
async function runVerifyModeLoop(
  session: VerifyModeSession,
  workspacePath: string,
  abortController: AbortController,
  sender: Electron.WebContents,
): Promise<void> {
  const bunPath = getBundledBunPath();
  const claudePath = getBundledClaudePath();

  if (!bunPath || !claudePath) {
    session.setError('Runtime not found', false);
    sender.send('verify-mode:session-update', {
      sessionId: session.id,
      session: session.data,
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

  const prompt = buildVerifyModePrompt({
    workspaceId: session.data.workspaceId,
    workspaceName: session.data.workspaceName,
    totalPages: session.data.config.totalPages,
    objective: session.data.objective,
  });

  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    const queryIterator = query({
      prompt,
      options: {
        cwd: workspacePath,
        pathToClaudeCodeExecutable: claudePath,
        env: enhancedEnv,
        stderr: (msg) => console.error('[verify-mode stderr]', msg),
        abortController,
        maxTurns: 200,
        settingSources: ['local', 'project'],
        allowedTools: ['Read', 'Write', 'Bash', 'GrepTool', 'Skill'],
      },
    });

    for await (const sdkMessage of queryIterator) {
      if (abortController.signal.aborted) {
        console.error(`[verify-mode] Session ${session.id} aborted`);
        break;
      }

      // Try to parse structured output
      const structuredOutput = tryParseStructuredOutput(sdkMessage);

      if (structuredOutput) {
        // Handle structured output through session state machine
        session.handleAgentOutput(structuredOutput);

        // Send to renderer
        sender.send('verify-mode:agent-output', {
          sessionId: session.id,
          output: structuredOutput,
        });

        sender.send('verify-mode:session-update', {
          sessionId: session.id,
          session: session.data,
        });

        // If blocking state, wait for human response
        if (isBlockingOutput(structuredOutput)) {
          console.error(
            `[verify-mode] Blocking state: ${structuredOutput.type}`,
          );
          // The agent loop will continue after human submits response
          // For now, we'll rely on the session state to track this
        }
      } else if (sdkMessage.type === 'assistant') {
        // Non-structured assistant message (internal reasoning)
        sender.send('verify-mode:thinking', {
          sessionId: session.id,
          content: sdkMessage.message?.content
            ?.filter((b: any) => b.type === 'text')
            ?.map((b: any) => b.text || '')
            ?.join(''),
        });
      } else if (sdkMessage.type === 'result') {
        // SDK result message
        console.error(`[verify-mode] SDK result: ${sdkMessage.subtype}`);
      }
    }

    // Mark completed if not already
    if (session.state !== 'completed' && session.state !== 'error') {
      session.complete();
      sender.send('verify-mode:session-update', {
        sessionId: session.id,
        session: session.data,
      });
    }
  } catch (error) {
    console.error('[verify-mode] Error:', error);
    session.setError(
      error instanceof Error ? error.message : 'Unknown error',
      true,
    );
    sender.send('verify-mode:session-update', {
      sessionId: session.id,
      session: session.data,
    });
  } finally {
    verifyModeAbortControllers.delete(session.id);
  }
}
