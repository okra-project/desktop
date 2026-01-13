import { bboxToVertices } from '@okrapdf/plugin-types';
import type {
  OcrProviderConfig,
  OcrPageResult,
  OcrBoundingBox,
  LayerDefinition,
  OcrProviderMetadata,
} from '../providers/ocr-types';
import type { OcrPlugin, OcrPluginModule } from './plugin-types';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

const METADATA: OcrProviderMetadata = {
  id: 'openrouter',
  name: 'OpenRouter VLM',
  description: 'Vision LLMs via OpenRouter (Qwen, Claude, Gemini)',
  runtime: 'api',
  category: 'vlm',
  capabilities: {
    supportsText: false,
    supportsTables: true,
    supportsBboxes: true,
    supportsFigures: true,
    supportsHandwriting: false,
    supportsMultiLanguage: true,
    outputFormats: ['markdown'],
    maxPagesPerRequest: 1,
  },
  layers: [
    {
      id: 'table',
      displayName: 'Tables',
      icon: '▤',
      color: {
        hex: '#3b82f6',
        border: 'rgba(59,130,246,0.9)',
        fill: 'rgba(59,130,246,0.15)',
      },
      category: 'entity',
    },
    {
      id: 'figure',
      displayName: 'Figures',
      icon: '□',
      color: {
        hex: '#22c55e',
        border: 'rgba(34,197,94,0.9)',
        fill: 'rgba(34,197,94,0.15)',
      },
      category: 'entity',
    },
    {
      id: 'footnote',
      displayName: 'Footnotes',
      icon: '†',
      color: {
        hex: '#6b7280',
        border: 'rgba(107,114,128,0.9)',
        fill: 'rgba(107,114,128,0.15)',
      },
      category: 'entity',
    },
    {
      id: 'signature',
      displayName: 'Signatures',
      icon: '✎',
      color: {
        hex: '#d97706',
        border: 'rgba(217,119,6,0.9)',
        fill: 'rgba(217,119,6,0.15)',
      },
      category: 'entity',
    },
  ],
  authenticate: { type: 'bearer' },
  documentationUrl: 'https://openrouter.ai/docs',
  costPerPage: 0.005,
  isCloud: true,
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
        type: 'string',
        title: 'Model',
        description: 'VLM model for extraction',
        enum: [
          'qwen/qwen3-vl-235b-a22b-instruct',
          'qwen/qwen2.5-vl-72b-instruct',
          'anthropic/claude-3.5-sonnet',
          'google/gemini-pro-vision',
        ],
        default: 'qwen/qwen3-vl-235b-a22b-instruct',
      },
    },
    required: ['apiKey'],
  },
};

interface EntityItem {
  title: string | null;
  bbox_2d?: [number, number, number, number];
  schema?: string[];
  is_complete?: boolean;
}

type ErrorCode =
  | 'rate_limit'
  | 'timeout'
  | 'api_error'
  | 'parse_error'
  | 'unknown';

interface ClassifiedError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  status?: number;
}

function classifyError(error: unknown, status?: number): ClassifiedError {
  const message = error instanceof Error ? error.message : String(error);

  if (status === 429) {
    return {
      code: 'rate_limit',
      message: 'Rate limited by OpenRouter',
      retryable: true,
      status,
    };
  }
  if (
    status === 408 ||
    message.includes('timeout') ||
    message.includes('ETIMEDOUT')
  ) {
    return {
      code: 'timeout',
      message: 'Request timed out',
      retryable: true,
      status,
    };
  }
  if (status && status >= 500) {
    return {
      code: 'api_error',
      message: `Server error: ${status}`,
      retryable: true,
      status,
    };
  }
  if (status && status >= 400) {
    return {
      code: 'api_error',
      message: `Client error: ${status} - ${message}`,
      retryable: false,
      status,
    };
  }
  if (message.includes('JSON') || message.includes('parse')) {
    return {
      code: 'parse_error',
      message: 'Failed to parse response',
      retryable: false,
    };
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
      lastError = classifyError(new Error(errorText), response.status);

      if (!lastError.retryable) {
        throw new Error(`${lastError.code}: ${lastError.message}`);
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `[openrouter] Attempt ${attempt + 1}/${maxRetries} failed: ${lastError.message}. Retrying in ${delay}ms...`,
      );
      await sleep(delay);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('rate_limit:'))
        throw error;

      lastError = classifyError(error);
      if (!lastError.retryable || attempt === maxRetries - 1) {
        throw new Error(`${lastError.code}: ${lastError.message}`);
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `[openrouter] Attempt ${attempt + 1}/${maxRetries} failed: ${lastError.message}. Retrying in ${delay}ms...`,
      );
      await sleep(delay);
    }
  }

  throw new Error(
    `${lastError?.code || 'unknown'}: ${lastError?.message || 'Max retries exceeded'}`,
  );
}

function buildPromptFromLayers(layers: LayerDefinition[]): string {
  const entityList = layers
    .map((l) => `- ${l.displayName} (${l.id})`)
    .join('\n');
  const jsonFields = layers
    .map((l) => {
      if (l.id === 'table') {
        return `  "${l.id}s": [{"title": "...", "schema": ["col1", "col2"], "is_complete": true, "bbox_2d": [x1, y1, x2, y2]}]`;
      }
      return `  "${l.id}s": [{"title": "...", "bbox_2d": [x1, y1, x2, y2]}]`;
    })
    .join(',\n');

  return `Detect all ${layers.map((l) => l.id + 's').join(', ')} in this document page and output their bbox coordinates in JSON format.

Elements to detect:
${entityList}

Return JSON with format:
{
${jsonFields}
}

Rules:
- bbox_2d coordinates are in 0-1000 normalized scale
- title is required - use descriptive narration if no visible title
- Return valid JSON only`;
}

function parseJsonResponse(
  content: string,
): Record<string, EntityItem[]> | null {
  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || [
      null,
      content,
    ];
    const jsonStr = jsonMatch[1] || content;
    return JSON.parse(jsonStr.trim());
  } catch {
    console.warn('[openrouter] Failed to parse JSON response');
    return null;
  }
}

function entitiesToBboxes(
  entities: Record<string, EntityItem[]>,
  layers: LayerDefinition[],
): OcrBoundingBox[] {
  const bboxes: OcrBoundingBox[] = [];

  for (const layer of layers) {
    const key = `${layer.id}s`;
    const items = entities[key];
    if (!items) continue;

    for (const item of items) {
      if (item.bbox_2d && item.bbox_2d.length === 4) {
        bboxes.push({
          type: layer.id,
          vertices: bboxToVertices(item.bbox_2d),
          text: item.title || undefined,
        });
      }
    }
  }

  return bboxes;
}

class OpenRouterPlugin implements OcrPlugin {
  id = 'openrouter';
  metadata = METADATA;

  async extract(
    imageBuffer: Buffer,
    pageNumber: number,
    config: OcrProviderConfig,
  ): Promise<OcrPageResult> {
    const startTime = Date.now();
    const layers = this.metadata.layers ?? [];

    try {
      const imageBase64 = imageBuffer.toString('base64');
      const model = config.modelId ?? 'qwen/qwen3-vl-235b-a22b-instruct';
      const prompt = buildPromptFromLayers(layers);

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
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  {
                    type: 'image_url',
                    image_url: { url: `data:image/png;base64,${imageBase64}` },
                  },
                ],
              },
            ],
            max_tokens: 10000,
          }),
        },
      );

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (!content) {
        return {
          pageNumber,
          bboxes: [],
          error: 'Empty response from model',
          durationMs: Date.now() - startTime,
        };
      }

      const entities = parseJsonResponse(content);
      if (!entities) {
        return {
          pageNumber,
          markdown: content,
          bboxes: [],
          error: 'Failed to parse JSON from model response',
          durationMs: Date.now() - startTime,
        };
      }

      const bboxes = entitiesToBboxes(entities, layers);
      console.log(
        `[openrouter] Page ${pageNumber}: extracted ${bboxes.length} entities`,
      );

      return {
        pageNumber,
        markdown: content,
        bboxes,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const classified = classifyError(error);
      console.error(
        `[openrouter] Page ${pageNumber} failed: ${classified.message}`,
      );
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
}

export function checkDependencies(): string | null {
  return null;
}

export function createPlugin(): OcrPlugin {
  return new OpenRouterPlugin();
}

const pluginModule: OcrPluginModule = { checkDependencies, createPlugin };
export default pluginModule;
