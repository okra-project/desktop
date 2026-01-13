import type {
  OcrProviderConfig,
  OcrPageResult,
  OcrProviderMetadata,
} from '../providers/ocr-types';
import type { OcrPlugin, OcrPluginModule } from './plugin-types';

const METADATA: OcrProviderMetadata = {
  id: 'anthropic',
  name: 'Anthropic Claude',
  version: '1.0.0',
  description: 'Claude AI for document chat and vision analysis',
  author: 'OkraPDF',
  license: 'FSL-1.1-ALv2',
  keywords: ['claude', 'anthropic', 'vision', 'chat'],

  runtime: 'api',
  category: 'agent',
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
    maxPagesPerRequest: 100,
  },

  inputConstraints: {
    mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
    maxFileSizeMB: 20,
    maxPagesPerRequest: 100,
  },

  layers: [],

  configSchema: {
    type: 'object',
    properties: {
      apiKey: {
        type: 'string',
        title: 'Anthropic API Key',
        description: 'Get from console.anthropic.com',
        format: 'password',
      },
      modelId: {
        type: 'options',
        title: 'Model',
        description: 'Claude model for chat',
        options: [
          { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
          { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
          { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
        ],
        default: 'claude-sonnet-4-20250514',
      },
    },
    required: ['apiKey'],
  },

  authenticate: { type: 'header', headerName: 'x-api-key' },
  documentationUrl: 'https://console.anthropic.com/settings/keys',
  pricing: { model: 'per-page', costPerPage: 0.003 },
};

class AnthropicPlugin implements OcrPlugin {
  id = 'anthropic';
  metadata = METADATA;

  async extract(
    imageBuffer: Buffer,
    pageNumber: number,
    config: OcrProviderConfig,
  ): Promise<OcrPageResult> {
    const startTime = Date.now();
    const imageBase64 = imageBuffer.toString('base64');
    const model = config.modelId ?? 'claude-sonnet-4-20250514';

    const prompt = `Analyze this PDF page image. Extract ALL content as clean markdown.

Instructions:
1. Extract all text, preserving structure and hierarchy
2. Convert tables to markdown table format
3. Describe figures/charts briefly in [brackets]
4. Preserve headings with proper markdown levels (#, ##, etc.)
5. Keep lists as markdown lists

Output clean markdown only. Do not include explanations.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey!,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: imageBase64,
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const markdown =
      data.content?.find((c: { type: string }) => c.type === 'text')?.text ||
      '';

    return {
      pageNumber,
      markdown,
      bboxes: [],
      durationMs: Date.now() - startTime,
    };
  }

  async checkHealth(
    config: OcrProviderConfig,
  ): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    const startTime = Date.now();
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey!,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      if (!response.ok) {
        const err = await response.text();
        return {
          ok: false,
          error: `API returned ${response.status}: ${err}`,
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
  return new AnthropicPlugin();
}

const pluginModule: OcrPluginModule = {
  checkDependencies,
  createPlugin,
};

export default pluginModule;
