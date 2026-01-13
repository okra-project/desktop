import type {
  OcrProviderConfig,
  OcrPageResult,
  OcrProviderMetadata,
  WorkflowExecutionContext,
  WorkflowNodeResult,
} from '../providers/ocr-types';
import type { OcrPlugin, OcrPluginModule } from './plugin-types';

interface DocAIVertex {
  x?: number;
  y?: number;
}

interface DocAILayout {
  textAnchor?: { textSegments?: { startIndex?: string; endIndex?: string }[] };
  confidence?: number;
  boundingPoly?: {
    vertices?: DocAIVertex[];
    normalizedVertices?: DocAIVertex[];
  };
}

interface DocAIElement {
  layout?: DocAILayout;
}

interface DocAITable {
  headerRows?: {
    cells?: { layout?: DocAILayout; rowSpan?: number; colSpan?: number }[];
  }[];
  bodyRows?: {
    cells?: { layout?: DocAILayout; rowSpan?: number; colSpan?: number }[];
  }[];
}

interface DocAIPage {
  pageNumber?: number;
  dimension?: { width?: number; height?: number; unit?: string };
  layout?: DocAILayout;
  text?: string;
  blocks?: DocAIElement[];
  paragraphs?: DocAIElement[];
  lines?: DocAIElement[];
  tables?: DocAITable[];
  bboxes?: TransformedBbox[];
}

interface DocAIResponse {
  text?: string;
  pages?: DocAIPage[];
}

interface TransformedBbox {
  type: string;
  vertices: { x: number; y: number }[];
  text?: string;
  confidence?: number;
}

function extractTextFromAnchor(
  fullText: string,
  anchor?: DocAILayout['textAnchor'],
): string | undefined {
  if (!anchor?.textSegments?.length) return undefined;
  const seg = anchor.textSegments[0];
  const start = parseInt(seg.startIndex || '0', 10);
  const end = parseInt(seg.endIndex || '0', 10);
  return fullText.slice(start, end).trim();
}

function transformElementsToBboxes(
  elements: DocAIElement[] | undefined,
  type: string,
  fullText: string,
): TransformedBbox[] {
  if (!elements?.length) {
    console.log(`[google-docai] No ${type} elements to transform`);
    return [];
  }
  console.log(
    `[google-docai] Transforming ${elements.length} ${type} elements`,
  );

  const withVertices = elements.filter(
    (el) => el.layout?.boundingPoly?.normalizedVertices?.length,
  );
  console.log(
    `[google-docai] ${withVertices.length} ${type} have normalizedVertices`,
  );

  if (elements.length > 0 && withVertices.length === 0) {
    console.log(
      `[google-docai] First ${type} element structure:`,
      JSON.stringify(elements[0], null, 2).slice(0, 500),
    );
  }

  return withVertices.map((el) => ({
    type,
    vertices: (el.layout!.boundingPoly!.normalizedVertices || []).map((v) => ({
      x: v.x ?? 0,
      y: v.y ?? 0,
    })),
    text: extractTextFromAnchor(fullText, el.layout?.textAnchor),
    confidence: el.layout?.confidence,
  }));
}

const API_BASE = 'https://okrapdf.com/api/v1';

const METADATA: OcrProviderMetadata = {
  id: 'google-docai',
  name: 'Google Document AI',
  version: '1.0.0',
  description:
    'Enterprise OCR via Google Cloud - tables, handwriting, 200+ languages',
  author: 'OkraPDF',
  license: 'FSL-1.1-ALv2',
  keywords: ['ocr', 'google', 'tables', 'handwriting'],

  runtime: 'api',
  category: 'ocr',
  isCloud: true,

  capabilities: {
    supportsText: true,
    supportsTables: true,
    supportsBboxes: true,
    supportsFigures: false,
    supportsHandwriting: true,
    supportsMultiLanguage: true,
    supportsDocumentExtraction: true,
    outputFormats: ['json', 'markdown'],
    maxPagesPerRequest: 15,
  },

  inputConstraints: {
    mimeTypes: [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/tiff',
      'image/gif',
      'image/bmp',
    ],
    maxFileSizeMB: 20,
    maxPagesPerRequest: 15,
  },

  layers: [
    {
      id: 'block',
      displayName: 'Blocks',
      icon: 'Square',
      color: {
        hex: '#f59e0b',
        border: 'rgba(245,158,11,0.9)',
        fill: 'rgba(245,158,11,0.15)',
      },
      category: 'ocr',
    },
    {
      id: 'paragraph',
      displayName: 'Paragraphs',
      icon: 'AlignLeft',
      color: {
        hex: '#eab308',
        border: 'rgba(234,179,8,0.9)',
        fill: 'rgba(234,179,8,0.15)',
      },
      category: 'ocr',
    },
    {
      id: 'line',
      displayName: 'Lines',
      icon: 'Minus',
      color: {
        hex: '#84cc16',
        border: 'rgba(132,204,22,0.9)',
        fill: 'rgba(132,204,22,0.15)',
      },
      category: 'ocr',
    },
    {
      id: 'token',
      displayName: 'Words',
      icon: 'Type',
      color: {
        hex: '#22c55e',
        border: 'rgba(34,197,94,0.9)',
        fill: 'rgba(34,197,94,0.15)',
      },
      category: 'ocr',
    },
    {
      id: 'table',
      displayName: 'Tables',
      icon: 'Table2',
      color: {
        hex: '#06b6d4',
        border: 'rgba(6,182,212,0.9)',
        fill: 'rgba(6,182,212,0.15)',
      },
      category: 'entity',
    },
    {
      id: 'form_field_name',
      displayName: 'Form Labels',
      icon: 'Tag',
      color: {
        hex: '#0ea5e9',
        border: 'rgba(14,165,233,0.9)',
        fill: 'rgba(14,165,233,0.15)',
      },
      category: 'entity',
    },
    {
      id: 'form_field_value',
      displayName: 'Form Values',
      icon: 'FileText',
      color: {
        hex: '#3b82f6',
        border: 'rgba(59,130,246,0.9)',
        fill: 'rgba(59,130,246,0.15)',
      },
      category: 'entity',
    },
  ],

  configSchema: {
    type: 'object',
    properties: {
      apiKey: {
        type: 'string',
        title: 'OkraPDF API Key',
        description: 'Get your key at okrapdf.com/settings',
        format: 'password',
        placeholder: 'okra_xxxxxxxxxxxxxxxx',
        required: true,
        validation: {
          pattern: '^okra_[a-zA-Z0-9]+$',
          patternMessage: 'Must start with okra_',
        },
      },
    },
    required: ['apiKey'],
  },

  authenticate: { type: 'bearer' },
  permissions: ['network'],

  pricing: {
    model: 'per-page',
    costPerPage: 0.01,
    currency: 'USD',
    freeQuota: { pages: 1000 },
  },

  documentationUrl: 'https://cloud.google.com/document-ai/docs',

  apiSpec: {
    baseUrl: API_BASE,
    authType: 'bearer',
    endpoints: {
      extract: {
        method: 'POST',
        path: '/ocr/google-docai',
        contentType: 'application/json',
      },
    },
    responseSchema: {
      text: 'string',
      pages: [
        {
          pageNumber: 'number',
          text: 'string',
          confidence: 'number',
          dimension: { width: 'number', height: 'number', unit: 'string' },
          blocks: [
            {
              layout: {
                textAnchor: { textSegments: [{ endIndex: 'string' }] },
                confidence: 'number',
                boundingPoly: {
                  vertices: [{ x: 'number', y: 'number' }],
                  normalizedVertices: [{ x: 'number', y: 'number' }],
                },
              },
            },
          ],
          paragraphs: [
            {
              layout: {
                textAnchor: { textSegments: [{ endIndex: 'string' }] },
                confidence: 'number',
                boundingPoly: {
                  vertices: [{ x: 'number', y: 'number' }],
                  normalizedVertices: [{ x: 'number', y: 'number' }],
                },
              },
            },
          ],
          lines: [
            {
              layout: {
                textAnchor: { textSegments: [{ endIndex: 'string' }] },
                confidence: 'number',
                boundingPoly: {
                  vertices: [{ x: 'number', y: 'number' }],
                  normalizedVertices: [{ x: 'number', y: 'number' }],
                },
              },
            },
          ],
          tables: [
            { headerRows: [{ cells: [{}] }], bodyRows: [{ cells: [{}] }] },
          ],
        },
      ],
    },
  },

  workflowNode: {
    inputs: ['pdf', 'page-images'],
    outputs: ['text', 'entities'],
    group: 'processor',
  },
};

class GoogleDocAIPlugin implements OcrPlugin {
  id = 'google-docai';
  metadata = METADATA;

  async extract(
    imageBuffer: Buffer,
    pageNumber: number,
    config: OcrProviderConfig,
  ): Promise<OcrPageResult & { rawVendorResponse?: DocAIResponse }> {
    const startTime = Date.now();
    const response = await this.callApi(
      imageBuffer.toString('base64'),
      'image/png',
      config.apiKey!,
    );
    const page = response.pages?.[0];
    const fullText = response.text || '';

    const bboxes = page?.bboxes?.length
      ? page.bboxes
      : [
          ...transformElementsToBboxes(page?.blocks, 'block', fullText),
          ...transformElementsToBboxes(page?.paragraphs, 'paragraph', fullText),
          ...transformElementsToBboxes(page?.lines, 'line', fullText),
        ];

    console.log(
      '[google-docai] Bboxes count:',
      bboxes.length,
      'source:',
      page?.bboxes?.length ? 'api' : 'transformed',
    );

    const rawVendorResponse = { ...response };
    delete (rawVendorResponse as Record<string, unknown>).rawDocument;

    return {
      pageNumber,
      markdown: fullText,
      bboxes,
      tables: this.transformTables(page?.tables),
      confidence: page?.layout?.confidence,
      durationMs: Date.now() - startTime,
      imageSize: page?.dimension
        ? {
            width: page.dimension.width || 0,
            height: page.dimension.height || 0,
          }
        : undefined,
      rawVendorResponse,
    };
  }

  async extractDocument(
    pdfBuffer: Buffer,
    config: OcrProviderConfig,
  ): Promise<(OcrPageResult & { rawVendorResponse?: DocAIPage })[]> {
    const startTime = Date.now();
    const response = await this.callApi(
      pdfBuffer.toString('base64'),
      'application/pdf',
      config.apiKey!,
    );
    const totalDuration = Date.now() - startTime;
    const fullText = response.text || '';

    return (response.pages || []).map((page, index) => {
      const bboxes = page?.bboxes?.length
        ? page.bboxes
        : [
            ...transformElementsToBboxes(page?.blocks, 'block', fullText),
            ...transformElementsToBboxes(
              page?.paragraphs,
              'paragraph',
              fullText,
            ),
            ...transformElementsToBboxes(page?.lines, 'line', fullText),
          ];

      return {
        pageNumber: page.pageNumber ?? index + 1,
        markdown:
          page.text ||
          extractTextFromAnchor(fullText, page.layout?.textAnchor) ||
          '',
        bboxes,
        tables: this.transformTables(page?.tables),
        confidence: page.layout?.confidence,
        durationMs: Math.round(totalDuration / (response.pages?.length || 1)),
        imageSize: page.dimension
          ? {
              width: page.dimension.width || 0,
              height: page.dimension.height || 0,
            }
          : undefined,
        rawVendorResponse: page,
      };
    });
  }

  private transformTables(tables?: DocAITable[]): OcrPageResult['tables'] {
    if (!tables?.length) return [];
    return tables.map((table, idx) => {
      const headers = table.headerRows?.[0]?.cells?.map(() => '') || [];
      const rowCount =
        (table.headerRows?.length || 0) + (table.bodyRows?.length || 0);
      return {
        id: `table-${idx}`,
        markdown: '',
        headers,
        rowCount,
        colCount: headers.length || table.bodyRows?.[0]?.cells?.length || 0,
      };
    });
  }

  private async callApi(
    content: string,
    mimeType: string,
    apiKey: string,
  ): Promise<DocAIResponse> {
    const response = await fetch(`${API_BASE}/ocr/google-docai`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rawDocument: { content, mimeType } }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async checkHealth(
    config: OcrProviderConfig,
  ): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    const startTime = Date.now();

    if (!config.apiKey?.startsWith('okra_')) {
      return {
        ok: false,
        error: 'API key must start with okra_',
        latencyMs: Date.now() - startTime,
      };
    }

    return { ok: true, latencyMs: Date.now() - startTime };
  }

  async executeWorkflow(
    ctx: WorkflowExecutionContext,
  ): Promise<WorkflowNodeResult> {
    const startTime = Date.now();
    ctx.reportProgress(
      `Processing page ${ctx.pageNumber} with Google Document AI`,
    );

    if (ctx.signal.aborted) {
      return { durationMs: Date.now() - startTime, error: 'Aborted' };
    }

    try {
      const result = await this.extract(
        ctx.input.pageImage!,
        ctx.pageNumber,
        ctx.config,
      );

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
  return new GoogleDocAIPlugin();
}

const pluginModule: OcrPluginModule = { checkDependencies, createPlugin };
export default pluginModule;
