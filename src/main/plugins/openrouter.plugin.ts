import { bboxToVertices } from '@okrapdf/plugin-types';
import type {
  OcrProviderConfig,
  OcrPageResult,
  OcrBoundingBox,
} from '../providers/ocr-types';
import type { OcrPlugin, OcrPluginModule } from './plugin-types';
import { getManifest } from './registry';

const ENTITY_EXTRACTION_PROMPT = `Detect all tables, figures, footnotes, signatures, and callout boxes in this document page and output their bbox coordinates in JSON format.

Elements to detect:
- Tables (data tables with rows and columns)
- Figures (pie charts, bar charts, diagrams, images)
- Footnotes (small text at bottom with asterisks or reference numbers)
- Signatures (handwritten signatures, sign-off blocks, signature lines)
- Callout/info boxes (highlighted sections with statistics or key points)

Return JSON with format:
{
  "tables": [{"title": "table name (required - use descriptive narration if no visible title)", "schema": ["col1", "col2"], "is_complete": true, "bbox_2d": [x1, y1, x2, y2]}],
  "figures": [{"title": "figure caption (required - use descriptive narration if no visible caption)", "bbox_2d": [x1, y1, x2, y2]}],
  "footnotes": [{"title": "footnote text (required)", "bbox_2d": [x1, y1, x2, y2]}],
  "signatures": [{"title": "signer name or 'Signature' (required)", "bbox_2d": [x1, y1, x2, y2]}]
}

Rules:
- bbox_2d coordinates are in 0-1000 normalized scale
- Annotate metadata and titles in the same language as the document provided
- schema = column headers if visible
- is_complete = false if table continues on next page
- Return valid JSON only`;

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

interface EntityItem {
  title: string | null;
  bbox_2d?: [number, number, number, number];
  bbox?: { x: number; y: number; width: number; height: number };
  schema?: string[];
  is_complete?: boolean;
}

interface ExtractedEntities {
  tables?: EntityItem[];
  figures?: EntityItem[];
  footnotes?: EntityItem[];
  signatures?: EntityItem[];
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

      if (response.ok) {
        return response;
      }

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
      if (error instanceof Error && error.message.startsWith('rate_limit:')) {
        throw error;
      }

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

function entitiesToBboxes(entities: ExtractedEntities): OcrBoundingBox[] {
  const bboxes: OcrBoundingBox[] = [];

  const processItems = (
    items: EntityItem[] | undefined,
    type: OcrBoundingBox['type'],
  ) => {
    if (!items) return;
    for (const item of items) {
      if (item.bbox_2d && item.bbox_2d.length === 4) {
        bboxes.push({
          type,
          vertices: bboxToVertices(item.bbox_2d),
          text: item.title || undefined,
        });
      }
    }
  };

  processItems(entities.tables, 'table');
  processItems(entities.figures, 'figure');
  processItems(entities.footnotes, 'footnote');
  processItems(entities.signatures, 'signature');

  return bboxes;
}

function parseJsonResponse(content: string): ExtractedEntities | null {
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

class OpenRouterPlugin implements OcrPlugin {
  id = 'openrouter';
  metadata = getManifest('openrouter')!.metadata;

  async extract(
    imageBuffer: Buffer,
    pageNumber: number,
    config: OcrProviderConfig,
  ): Promise<OcrPageResult> {
    const startTime = Date.now();

    try {
      const imageBase64 = imageBuffer.toString('base64');
      const model = config.modelId ?? 'qwen/qwen3-vl-235b-a22b-instruct';

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
                  { type: 'text', text: ENTITY_EXTRACTION_PROMPT },
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

      const bboxes = entitiesToBboxes(entities);

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

const pluginModule: OcrPluginModule = {
  checkDependencies,
  createPlugin,
};

export default pluginModule;
