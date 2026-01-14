/**
 * Qwen Markdown Extraction Plugin
 *
 * Per-page markdown extraction using Qwen VLM via OpenRouter.
 * Mirrors the extraction workflow from okrapdf cloud.
 */

import type {
  OcrProviderConfig,
  OcrPageResult,
  OcrProviderMetadata,
  WorkflowExecutionContext,
  WorkflowNodeResult,
} from '../providers/ocr-types';
import type { OcrPlugin, OcrPluginModule } from './plugin-types';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// Extraction prompt matching okrapdf cloud
const EXTRACTION_PROMPT = `Extract all text and tables from this document page.

For tables:
- Use markdown table format with pipe (|) separators
- Preserve column headers
- Include all rows

For text:
- Preserve paragraph structure
- Include headers and section titles

OUTPUT FORMAT: Return ONLY the raw markdown content.
Do NOT wrap in code blocks. Just output the markdown directly.`;

const METADATA: OcrProviderMetadata = {
  id: 'qwen-markdown',
  name: 'Qwen Markdown',
  version: '1.0.0',
  description: 'Per-page markdown extraction using Qwen VLM',
  author: 'OkraPDF',
  license: 'FSL-1.1-ALv2',
  keywords: ['vlm', 'qwen', 'markdown', 'extraction'],

  runtime: 'api',
  category: 'vlm',
  isCloud: true,

  capabilities: {
    supportsText: true,
    supportsTables: true,
    supportsBboxes: false,
    supportsFigures: false,
    supportsHandwriting: false,
    supportsMultiLanguage: true,
    supportsDocumentExtraction: false,
    outputFormats: ['markdown'],
    maxPagesPerRequest: 1,
  },

  inputConstraints: {
    mimeTypes: ['image/png', 'image/jpeg'],
    maxFileSizeMB: 10,
    maxPagesPerRequest: 1,
  },

  layers: [], // No entity layers - pure markdown extraction

  configSchema: {
    type: 'object',
    properties: {
      apiKey: {
        type: 'string',
        title: 'OpenRouter API Key',
        description: 'Get from openrouter.ai/keys',
        format: 'password',
      },
      modelId: {
        type: 'options',
        title: 'Model',
        description: 'Qwen VLM model for markdown extraction',
        options: [
          { value: 'qwen/qwen3-vl-235b-a22b-instruct', label: 'Qwen3 VL 235B (Best)' },
          { value: 'qwen/qwen2.5-vl-72b-instruct', label: 'Qwen2.5 VL 72B' },
          { value: 'qwen/qwen-2-vl-7b-instruct', label: 'Qwen 2 VL 7B (Fast)' },
        ],
        default: 'qwen/qwen3-vl-235b-a22b-instruct',
      },
    },
    required: ['apiKey'],
  },

  authenticate: { type: 'bearer' },
  documentationUrl: 'https://openrouter.ai/docs',
  pricing: { model: 'per-page', costPerPage: 0.005 },

  workflowNode: {
    inputs: ['page-images'],
    outputs: ['markdown'],
    group: 'processor',
  },
};

type ErrorCode = 'rate_limit' | 'timeout' | 'api_error' | 'unknown';

interface ClassifiedError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  status?: number;
}

function classifyError(error: unknown, status?: number): ClassifiedError {
  const message = error instanceof Error ? error.message : String(error);

  if (status === 429) {
    return { code: 'rate_limit', message: 'Rate limited by OpenRouter', retryable: true, status };
  }
  if (status === 408 || message.includes('timeout') || message.includes('ETIMEDOUT')) {
    return { code: 'timeout', message: 'Request timed out', retryable: true, status };
  }
  if (status && status >= 500) {
    return { code: 'api_error', message: `Server error: ${status}`, retryable: true, status };
  }
  if (status && status >= 400) {
    return { code: 'api_error', message: `Client error: ${status} - ${message}`, retryable: false, status };
  }
  return { code: 'unknown', message, retryable: true };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = MAX_RETRIES,
): Promise<Response> {
  let lastError: ClassifiedError | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      const errorText = await response.text();
      console.warn('[qwen-markdown] Error response:', errorText);
      lastError = classifyError(new Error(errorText), response.status);

      if (!lastError.retryable) {
        throw new Error(`${lastError.code}: ${lastError.message}`);
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`[qwen-markdown] Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${delay}ms...`);
      await sleep(delay);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('rate_limit:')) throw error;

      lastError = classifyError(error);
      if (!lastError.retryable || attempt === maxRetries - 1) {
        throw new Error(`${lastError.code}: ${lastError.message}`);
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`[qwen-markdown] Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw new Error(`${lastError?.code || 'unknown'}: ${lastError?.message || 'Max retries exceeded'}`);
}

/**
 * Strip markdown code block wrappers if present
 */
function stripCodeBlocks(content: string): string {
  // Remove ```markdown ... ``` or ``` ... ```
  const codeBlockMatch = content.match(/^```(?:markdown)?\s*\n?([\s\S]*?)\n?```$/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  return content.trim();
}

class QwenMarkdownPlugin implements OcrPlugin {
  id = 'qwen-markdown' as const;
  metadata = METADATA;

  async extract(
    imageBuffer: Buffer,
    pageNumber: number,
    config: OcrProviderConfig,
  ): Promise<OcrPageResult> {
    const startTime = Date.now();

    try {
      const imageBase64 = imageBuffer.toString('base64');
      const model = config.modelId ?? 'qwen/qwen3-vl-235b-a22b-instruct';

      console.log('[qwen-markdown] Extracting page', pageNumber, 'with model', model);

      const requestBody = JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: EXTRACTION_PROMPT },
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${imageBase64}` },
              },
            ],
          },
        ],
        max_tokens: 20000,
        provider: {
          zdr: true, // Zero Data Retention
          data_collection: 'deny',
          sort: 'throughput',
        },
      });

      const response = await fetchWithRetry(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/okrapdf/okrapdf-desktop',
            'X-Title': 'OkraPDF Desktop',
          },
          body: requestBody,
        },
      );

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || '';
      const content = stripCodeBlocks(rawContent);
      const tokens = data.usage?.total_tokens || 0;

      if (!content) {
        return {
          pageNumber,
          bboxes: [],
          error: 'Empty response from model',
          durationMs: Date.now() - startTime,
        };
      }

      // Detect if content has tables
      const hasTables = content.includes('|') && content.includes('---');

      console.log(`[qwen-markdown] Page ${pageNumber}: ${content.length} chars, ${tokens} tokens, tables: ${hasTables}`);

      return {
        pageNumber,
        markdown: content,
        bboxes: [],
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const classified = classifyError(error);
      console.error(`[qwen-markdown] Page ${pageNumber} failed: ${classified.message}`);
      return {
        pageNumber,
        bboxes: [],
        error: `${classified.code}: ${classified.message}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async checkHealth(
    config: OcrProviderConfig,
  ): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    const startTime = Date.now();
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (!response.ok) {
        return {
          ok: false,
          error: `API returned ${response.status}`,
          latencyMs: Date.now() - startTime,
        };
      }
      return { ok: true, latencyMs: Date.now() - startTime };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startTime,
      };
    }
  }

  async executeWorkflow(ctx: WorkflowExecutionContext): Promise<WorkflowNodeResult> {
    const startTime = Date.now();
    ctx.reportProgress(`Extracting markdown from page ${ctx.pageNumber}`);

    try {
      if (ctx.signal.aborted) {
        return { durationMs: Date.now() - startTime, error: 'Aborted' };
      }

      const result = await this.extract(ctx.input.pageImage!, ctx.pageNumber, ctx.config);

      if (result.error) {
        return {
          durationMs: result.durationMs ?? Date.now() - startTime,
          error: result.error,
        };
      }

      return {
        entities: result,
        markdown: result.markdown,
        durationMs: result.durationMs ?? Date.now() - startTime,
      };
    } catch (error) {
      return {
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export function checkDependencies(): string | null {
  return null;
}

export function createPlugin(): OcrPlugin {
  return new QwenMarkdownPlugin();
}

const pluginModule: OcrPluginModule = { checkDependencies, createPlugin };
export default pluginModule;
