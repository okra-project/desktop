import type {
  OcrProviderConfig,
  OcrProviderMetadata,
  OcrPageResult,
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
  description: 'Google Cloud Document AI with bounding box extraction',
  runtime: 'api',
  category: 'ocr',
  capabilities: {
    supportsText: true,
    supportsTables: true,
    supportsBboxes: true,
    supportsFigures: true,
    supportsHandwriting: true,
    supportsMultiLanguage: true,
    outputFormats: ['json', 'markdown'],
    maxPagesPerRequest: 15,
  },
  authenticate: {
    type: 'service-account',
  },
  documentationUrl: 'https://cloud.google.com/document-ai',
  costPerPage: 0.01,
  isCloud: true,
  configSchema: {
    type: 'object' as const,
    properties: {
      apiKey: {
        type: 'string',
        title: 'Service Account Key (JSON)',
        description: 'Paste the full JSON key file contents',
        format: 'file' as const,
      },
      projectId: {
        type: 'string',
        title: 'GCP Project ID',
        description: 'Your Google Cloud project ID',
      },
      processorId: {
        type: 'string',
        title: 'Processor ID',
        description: 'Document AI processor ID',
      },
    },
    required: ['apiKey', 'projectId', 'processorId'],
  },
};

class GoogleDocAIPlugin implements OcrPlugin {
  id = METADATA.id;
  metadata = METADATA;

  async extract(
    imageBuffer: Buffer,
    pageNumber: number,
    config: OcrProviderConfig,
  ): Promise<OcrPageResult> {
    const startTime = Date.now();

    let credentials;
    if (config.apiKey) {
      try {
        credentials = JSON.parse(config.apiKey);
      } catch {
        throw new Error('Invalid service account key JSON');
      }
    }

    const projectId = config.projectId ?? credentials?.project_id;
    const processorId = config.processorId;
    const location = (config.options?.location as string) ?? 'us';

    if (!projectId || !processorId) {
      throw new Error('Google Doc AI requires projectId and processorId');
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
    const document = result.document;

    const bboxes: OcrPageResult['bboxes'] = [];
    const page = document.pages?.[0];

    if (page?.blocks) {
      for (const block of page.blocks) {
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
        const table = page.tables[i];
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

  async checkHealth(
    config: OcrProviderConfig,
  ): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    const startTime = Date.now();
    try {
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
}

export function checkDependencies(): string | null {
  try {
    require.resolve('google-auth-library');
    return null;
  } catch {
    return 'google-auth-library not installed. Run: npm install google-auth-library';
  }
}

export function createPlugin(): OcrPlugin {
  return new GoogleDocAIPlugin();
}

const pluginModule: OcrPluginModule = {
  checkDependencies,
  createPlugin,
};

export default pluginModule;
