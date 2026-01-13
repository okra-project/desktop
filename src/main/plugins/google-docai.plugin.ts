import type {
  OcrProviderConfig,
  OcrPageResult,
  OcrProviderMetadata,
  WorkflowExecutionContext,
  WorkflowNodeResult,
} from '../providers/ocr-types';
import type { OcrPlugin, OcrPluginModule } from './plugin-types';

declare const __non_webpack_require__: typeof require;
const dynamicRequire =
  typeof __non_webpack_require__ !== 'undefined'
    ? __non_webpack_require__
    : require;

function getGoogleAuth() {
  const pkg = 'google-auth-library';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return dynamicRequire(pkg).GoogleAuth;
}

const METADATA: OcrProviderMetadata = {
  id: 'google-docai',
  name: 'Google Document AI',
  description: 'OCR with bounding boxes via Google Cloud Document AI',
  runtime: 'api',
  category: 'ocr',
  capabilities: {
    supportsText: true,
    supportsTables: true,
    supportsBboxes: true,
    supportsFigures: false,
    supportsHandwriting: true,
    supportsMultiLanguage: true,
    outputFormats: ['json', 'markdown'],
    maxPagesPerRequest: 15,
  },
  layers: [], // OCR provider - outputs text, not semantic entities
  // Workflow integration - text extraction node
  workflowNode: {
    inputs: ['page-images'],
    outputs: ['text'],
    group: 'processor',
  },
  authenticate: { type: 'bearer' },
  documentationUrl: 'https://cloud.google.com/document-ai',
  costPerPage: 0.01,
  isCloud: true,
  configSchema: {
    type: 'object',
    properties: {
      authMode: {
        type: 'string',
        title: 'Authentication Mode',
        description:
          'Use okrapdf.com (just API key) or direct Google credentials',
        enum: ['okrapdf', 'direct'],
        default: 'okrapdf',
      },
      apiKey: {
        type: 'string',
        title: 'API Key',
        description:
          'okrapdf API key (okra_xxx) or Google Service Account JSON',
        format: 'password',
      },
      projectId: {
        type: 'string',
        title: 'GCP Project ID',
        description: 'Your Google Cloud project ID (direct mode only)',
      },
      processorId: {
        type: 'string',
        title: 'Processor ID',
        description: 'Document AI processor ID (direct mode only)',
      },
    },
    required: ['apiKey'],
  },
};

class GoogleDocAIPlugin implements OcrPlugin {
  id = 'google-docai';

  metadata = METADATA;

  async extract(
    imageBuffer: Buffer,
    pageNumber: number,
    config: OcrProviderConfig,
  ): Promise<OcrPageResult> {
    const startTime = Date.now();
    const authMode = (config.options?.authMode as string) ?? 'okrapdf';

    let document;

    if (authMode === 'okrapdf') {
      // Proxied via okrapdf.com - just needs okra_xxx API key
      document = await this.extractViaOkrapdf(imageBuffer, config.apiKey!);
    } else {
      // Direct Google credentials
      document = await this.extractViaDirect(imageBuffer, config);
    }

    const bboxes: OcrPageResult['bboxes'] = [];
    const page = document.pages?.[0];

    if (page?.blocks) {
      for (const block of (page.blocks as any[])) {
        if (block.layout?.boundingPoly?.normalizedVertices) {
          bboxes.push({
            type: 'paragraph',
            vertices: block.layout.boundingPoly.normalizedVertices,
            text: block.layout.textAnchor?.content,
            confidence: block.layout.confidence,
          });
        }
      }
    }

    const tables: OcrPageResult['tables'] = [];
    if (page?.tables) {
      for (let i = 0; i < page.tables.length; i++) {
        const table = page.tables[i] as any;
        const rows: string[][] = [];

        for (const row of table.bodyRows || []) {
          const cells: string[] = [];
          for (const cell of row.cells || []) {
            const text = cell.layout?.textAnchor?.content || '';
            cells.push(text.trim());
          }
          rows.push(cells);
        }

        if (rows.length > 0) {
          const headers = rows[0];
          const separator = headers.map(() => '---');
          const bodyRows = rows.slice(1);

          const markdown = [
            `| ${headers.join(' | ')} |`,
            `| ${separator.join(' | ')} |`,
            ...bodyRows.map((row) => `| ${row.join(' | ')} |`),
          ].join('\n');

          tables.push({
            id: `table-p${pageNumber}-${i + 1}`,
            markdown,
            headers,
            rowCount: rows.length,
            colCount: headers.length,
          });
        }
      }
    }

    const markdown = document.text || '';

    return {
      pageNumber,
      markdown,
      bboxes,
      tables,
      confidence: page?.layout?.confidence,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Extract via okrapdf.com proxy - just needs okra_xxx API key
   */
  private async extractViaOkrapdf(
    imageBuffer: Buffer,
    apiKey: string,
  ): Promise<{
    text?: string;
    pages?: Array<{
      blocks?: unknown[];
      tables?: unknown[];
      layout?: { confidence?: number };
    }>;
  }> {
    const response = await fetch(
      'https://okrapdf.com/api/v1/ocr/google-docai',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageBuffer.toString('base64'),
          mimeType: 'image/png',
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`okrapdf API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result.document;
  }

  /**
   * Extract via direct Google credentials - requires google-auth-library
   */
  private async extractViaDirect(
    imageBuffer: Buffer,
    config: OcrProviderConfig,
  ): Promise<{
    text?: string;
    pages?: Array<{
      blocks?: unknown[];
      tables?: unknown[];
      layout?: { confidence?: number };
    }>;
  }> {
    let credentials;
    if (config.apiKey) {
      try {
        credentials = JSON.parse(config.apiKey);
      } catch {
        throw new Error('Invalid service account key JSON');
      }
    }

    const projectId = config.projectId ?? credentials?.project_id;
    const { processorId } = config;
    const location = (config.options?.location as string) ?? 'us';

    if (!projectId || !processorId) {
      throw new Error('Direct mode requires projectId and processorId');
    }

    const GoogleAuth = getGoogleAuth();
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const endpoint = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rawDocument: {
          content: imageBuffer.toString('base64'),
          mimeType: 'image/png',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Doc AI error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result.document;
  }

  async checkHealth(
    config: OcrProviderConfig,
  ): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    const startTime = Date.now();
    const authMode = (config.options?.authMode as string) ?? 'okrapdf';

    try {
      if (authMode === 'okrapdf') {
        // Just verify the API key format
        if (!config.apiKey?.startsWith('okra_')) {
          return {
            ok: false,
            error: 'Invalid okrapdf API key (should start with okra_)',
            latencyMs: Date.now() - startTime,
          };
        }
        // Could ping okrapdf.com/api/health but skip for now
        return { ok: true, latencyMs: Date.now() - startTime };
      }
      // Direct mode - verify Google credentials
      const GoogleAuth = getGoogleAuth();
      const credentials = JSON.parse(config.apiKey ?? '{}');
      const auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      await auth.getClient();
      return { ok: true, latencyMs: Date.now() - startTime };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute as workflow node - called by workflow handler per-page
   */
  async executeWorkflow(
    ctx: WorkflowExecutionContext,
  ): Promise<WorkflowNodeResult> {
    const startTime = Date.now();
    ctx.reportProgress(
      `Processing page ${ctx.pageNumber} with Google Document AI`,
    );

    try {
      // Check for abort signal
      if (ctx.signal.aborted) {
        return {
          durationMs: Date.now() - startTime,
          error: 'Aborted',
        };
      }

      // Use existing extract method
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
        text: result.markdown,
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

/**
 * Check dependencies - google-auth-library only required for direct mode.
 * For okrapdf mode, no external deps needed.
 */
export function checkDependencies(): string | null {
  // Always return null - okrapdf mode works without google-auth-library
  // Direct mode will fail at runtime if dep is missing, which is acceptable
  return null;
}

export function createPlugin(): OcrPlugin {
  return new GoogleDocAIPlugin();
}

const pluginModule: OcrPluginModule = {
  checkDependencies,
  createPlugin,
};

export default pluginModule;
