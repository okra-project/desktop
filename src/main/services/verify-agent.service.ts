import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { storeService } from './store.service';
import { getClaudeEnv } from '../utils/pdf.utils';
import { progressQueue } from '../utils/progress-queue';
import { createVerifyAgentTools } from './verify-agent-tools';

const activeAbortControllers = new Map<string, AbortController>();

function getBundledBunPath(): string | undefined {
  if (app.isPackaged) {
    const bunPath = path.join(process.resourcesPath, 'bun');
    if (fs.existsSync(bunPath)) return bunPath;
  }
  const devResourcePath = path.join(__dirname, '../../resources/bun');
  if (fs.existsSync(devResourcePath)) return devResourcePath;
  try {
    return execSync('which bun', { encoding: 'utf-8' }).trim();
  } catch {
    return undefined;
  }
}

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

function getPluginPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'claude-plugin');
  }
  return path.join(__dirname, '../../../claude-plugin');
}

export function registerVerifyAgentHandlers(): void {
  ipcMain.handle(
    'verify-agent:start',
    async (
      _event,
      data: {
        workspaceId: string;
        workspacePath: string;
        totalPages: number;
        prompt?: string;
        resumeSessionId?: string;
      },
    ) => {
      if (!storeService.hasAnthropicApiKey()) {
        return {
          success: false,
          error: 'Please configure your Anthropic API key in Settings.',
        };
      }

      const claudePath = getBundledClaudePath();
      if (!claudePath) {
        return { success: false, error: 'Claude CLI not found' };
      }

      const abortController = new AbortController();

      runAgentLoop({
        ...data,
        claudePath,
        abortController,
      }).catch((error) => {
        console.error('[verify-agent] Error:', error);
        progressQueue.send('verify-agent:error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });

      return { success: true };
    },
  );

  ipcMain.handle('verify-agent:abort', async (_event, sessionId: string) => {
    const controller = activeAbortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      activeAbortControllers.delete(sessionId);
      return { success: true };
    }
    return { success: false, error: 'Session not found' };
  });
}

interface RunAgentParams {
  workspaceId: string;
  workspacePath: string;
  totalPages: number;
  prompt?: string;
  resumeSessionId?: string;
  claudePath: string;
  abortController: AbortController;
}

async function runAgentLoop(params: RunAgentParams): Promise<void> {
  const {
    workspaceId,
    workspacePath,
    totalPages,
    prompt,
    resumeSessionId,
    claudePath,
    abortController,
  } = params;

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

  const pluginPath = getPluginPath();

  // Create direct in-process tools for the verify agent
  const verifyTools = createVerifyAgentTools({
    workspaceId,
    workspacePath,
    totalPages,
  });

  const defaultPrompt = `You are a PDF extraction verification agent. Guide the user through inbox-zero style verification of ${totalPages} pages.

## Your Role
- **Drive the review**: You navigate, analyze, explain - user just verifies or flags
- **Narrate your reasoning**: Tell user what you see, why you're confident or concerned
- **Be efficient**: Prioritize high-value pages (tables, financials) first
- **Detect patterns**: If you see same issue on multiple pages, propose batch fix

## Tools (use mcp__okrapdf-verify__ prefix)
- list_extractions() - See what extraction sources are available
- get_page_extraction({ pageNumber, source? }) - Get markdown content
- get_tables() - Find all tables with metadata (prioritize these)
- search_workspace({ query }) - Search across document
- find_similar_issues({ pattern, issueDescription }) - Find pages with same issue for batch proposals
- request_verify_approval({ pageNumber, analysis, extractions }) - BLOCKS until user responds
- get_progress() - Current verification stats
- update_progress({ pageNumber, status, notes? }) - Record result

## Analysis Guidelines
When analyzing a page, identify:

**Content Type** (be specific):
- "Balance Sheet" / "Income Statement" / "Cash Flow Statement"
- "Table: [title]" with row/column counts
- "Form" / "Contract" / "Invoice"
- "Narrative Text" / "Cover Page" / "TOC"

**Confidence Score** (0-1):
- 0.95+: Perfect extraction, all values readable, structure intact
- 0.85-0.94: Minor formatting issues, all data present
- 0.70-0.84: Some values unclear or structure issues
- <0.70: Significant problems, likely needs re-extraction

**Findings** (always include):
- Structure: "4 columns, 12 rows detected"
- Key data: "Revenue: $X, Net Income: $Y"
- Completeness: "All line items captured" or "Missing totals row"

**Issues** (if any):
- "Row 5 may have OCR error - '$1,234' looks like '$1,284'"
- "Table header merged incorrectly"
- "Currency symbols stripped"

## Workflow

### 1. Opening Summary
Start by listing extractions and tables, then say:
"Found X pages with Y tables. I'll prioritize tables and financial statements first. Starting with page Z which has [description]."

### 2. Priority Queue (process in this order):
1. Pages with tables (especially financial tables)
2. Pages with low extraction confidence or known issues
3. Remaining pages by document order

### 3. For Each Page:
a. Get the extraction content
b. Analyze and narrate your findings:
   "Page 12 has a Balance Sheet table with 4 columns and 15 rows. I'm 92% confident - all values look clean but I noticed the 'Total Assets' row formatting is slightly off."

c. Call request_verify_approval with your analysis (extractions loaded from disk automatically):
   - contentType: specific name
   - confidence: 0-1 score with reasoning built in
   - findings: what you found
   - issues: concerns (empty array if none)

d. Handle response:
   - verify: update_progress with status='verified', move to next page
   - flag: update_progress with status='flagged' and user's notes, move to next page
   - skip: update_progress with status='skipped', move to next page
   - reextract: STAY on this page. Wait 10 seconds, then call request_verify_approval again for the SAME page number. Do not move on until user verifies/flags/skips.

### 4. Pattern Detection
If you notice the same issue across pages (e.g., all tables missing headers):
- After 3+ similar issues, mention: "I've seen this issue on X other pages. Once we finish, I can help identify them all for a batch fix."

### 5. Completion
When done, summarize:
"Verification complete! X pages verified, Y flagged, Z skipped. [Any patterns noticed]"

Output <complete>DONE</complete> when finished.`;

  const { query } = await import('@anthropic-ai/claude-agent-sdk');

  const queryIterator = query({
    prompt: prompt || defaultPrompt,
    options: {
      cwd: workspacePath,
      pathToClaudeCodeExecutable: claudePath,
      env: enhancedEnv,
      abortController,
      resume: resumeSessionId,
      settingSources: ['project'],
      plugins: [{ type: 'local', path: pluginPath }],
      // Direct in-process tools instead of external MCP transport
      mcpServers: {
        'okrapdf-verify': verifyTools,
      },
      // Auto-allow our verify tools
      allowedTools: [
        'mcp__okrapdf-verify__list_extractions',
        'mcp__okrapdf-verify__get_page_extraction',
        'mcp__okrapdf-verify__get_tables',
        'mcp__okrapdf-verify__search_workspace',
        'mcp__okrapdf-verify__find_similar_issues',
        'mcp__okrapdf-verify__request_verify_approval',
        'mcp__okrapdf-verify__get_progress',
        'mcp__okrapdf-verify__update_progress',
      ],
      includePartialMessages: true,
      stderr: (msg) => console.error('[verify-agent]', msg),
    },
  });

  for await (const message of queryIterator) {
    if (abortController.signal.aborted) break;

    if (message.type === 'system' && message.subtype === 'init') {
      activeAbortControllers.set(message.session_id, abortController);
    }

    progressQueue.send('verify-agent:event', message);
  }
}
