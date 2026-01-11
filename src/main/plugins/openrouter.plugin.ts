import type { OcrProviderConfig, OcrPageResult } from '../providers/ocr-types';
import type { OcrPlugin, OcrPluginModule } from './plugin-types';
import { getManifest } from './registry';

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

    const prompt = `Analyze this PDF page image. Extract ALL content as clean markdown.

Instructions:
1. Extract all text, preserving structure and hierarchy
2. Convert tables to markdown table format
3. Describe figures/charts briefly in [brackets]
4. Preserve headings with proper markdown levels (#, ##, etc.)
5. Keep lists as markdown lists

Output clean markdown only. Do not include explanations.`;

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
                { type: 'text', text: prompt },
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
    const markdown = data.choices?.[0]?.message?.content || '';

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
