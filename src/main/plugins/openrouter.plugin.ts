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
    const imageBase64 = imageBuffer.toString('base64');
    const model = config.modelId ?? 'qwen/qwen2.5-vl-72b-instruct';

    const response = await fetch(
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
          max_tokens: 4096,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter API error: ${response.status} - ${errorText}`,
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    const entities = parseJsonResponse(content);
    const bboxes = entities ? entitiesToBboxes(entities) : [];

    console.log(
      `[openrouter] Page ${pageNumber}: extracted ${bboxes.length} entities`,
    );

    return {
      pageNumber,
      markdown: content,
      bboxes,
      durationMs: Date.now() - startTime,
    };
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
