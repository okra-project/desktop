import * as fs from 'fs';
import * as path from 'path';
import { pdfWorkerService } from './services/pdf-worker.service';

export interface TableExtractionProgress {
  currentPage: number;
  totalPages: number;
  phase: 'rendering' | 'analyzing';
  tablesFound: number;
}

export interface ExtractedTable {
  id: string;
  page: number;
  markdown: string;
  bbox?: { xmin: number; ymin: number; xmax: number; ymax: number };
  confidence?: number;
}

export interface TableExtractionResult {
  success: boolean;
  tables: ExtractedTable[];
  totalPages: number;
  error?: string;
}

type ProgressCallback = (progress: TableExtractionProgress) => void;

const TABLE_EXTRACTION_PROMPT = `Analyze this PDF page image. Extract ALL tables you find as markdown.

For each table:
1. Preserve the exact structure (rows/columns)
2. Keep headers if present
3. Maintain data alignment

Return ONLY valid markdown tables, one after another. If no tables found, return "NO_TABLES_FOUND".

Example output format:
| Header 1 | Header 2 |
|----------|----------|
| Data 1   | Data 2   |
`;

async function renderPageToBase64(
  pdfPath: string,
  pageNum: number,
  scale = 2.0,
): Promise<string> {
  const { base64 } = await pdfWorkerService.renderPage(
    pdfPath,
    pageNum,
    scale,
  );
  return base64;
}

async function extractTablesFromImage(
  imageBase64: string,
  apiKey: string,
  model = 'qwen/qwen2.5-vl-72b-instruct',
): Promise<string> {
  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/nicepkg/okrapdf-desktop',
        'X-Title': 'OkraPDF Desktop (OSS)',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: TABLE_EXTRACTION_PROMPT },
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${imageBase64}` },
              },
            ],
          },
        ],
        max_tokens: 4096,
        provider: { zdr: true, data_collection: 'deny', sort: 'throughput' },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'NO_TABLES_FOUND';
}

function parseMarkdownTables(
  markdown: string,
  pageNum: number,
): ExtractedTable[] {
  if (markdown.includes('NO_TABLES_FOUND')) {
    return [];
  }

  const tableRegex = /\|[^\n]+\|[\s\S]*?(?=\n\n|\n(?!\|)|$)/g;
  const matches = markdown.match(tableRegex) || [];

  return matches.map((tableMarkdown, idx) => ({
    id: `table-p${pageNum}-${idx + 1}`,
    page: pageNum,
    markdown: tableMarkdown.trim(),
    confidence: 0.85,
  }));
}

export async function extractTablesFromPDF(
  pdfPath: string,
  outputDir: string,
  apiKey: string,
  onProgress?: ProgressCallback,
): Promise<TableExtractionResult> {
  try {
    const totalPages = await pdfWorkerService.getPageCount(pdfPath);
    const allTables: ExtractedTable[] = [];

    fs.mkdirSync(outputDir, { recursive: true });

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.({
        currentPage: pageNum,
        totalPages,
        phase: 'rendering',
        tablesFound: allTables.length,
      });

      const imageBase64 = await renderPageToBase64(pdfPath, pageNum);

      onProgress?.({
        currentPage: pageNum,
        totalPages,
        phase: 'analyzing',
        tablesFound: allTables.length,
      });

      const markdownResult = await extractTablesFromImage(imageBase64, apiKey);
      const pageTables = parseMarkdownTables(markdownResult, pageNum);

      for (const table of pageTables) {
        allTables.push(table);
        const outputPath = path.join(outputDir, `${table.id}.md`);
        fs.writeFileSync(outputPath, table.markdown);
      }
    }

    const manifestPath = path.join(outputDir, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        { tables: allTables, extractedAt: new Date().toISOString() },
        null,
        2,
      ),
    );

    return { success: true, tables: allTables, totalPages };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, tables: [], totalPages: 0, error: message };
  }
}

export async function getExtractedTables(
  tablesDir: string,
): Promise<ExtractedTable[]> {
  const manifestPath = path.join(tablesDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return [];
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return manifest.tables || [];
}
