import * as fs from 'fs';
import * as path from 'path';
import { getDocument, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';

export interface ExtractionProgress {
  currentPage: number;
  totalPages: number;
  phase: 'text' | 'tables';
}

export interface ExtractionResult {
  success: boolean;
  totalPages: number;
  extractedPages: number;
  error?: string;
}

type ProgressCallback = (progress: ExtractionProgress) => void;

async function extractPageText(page: PDFPageProxy): Promise<string> {
  const textContent: TextContent = await page.getTextContent();
  const lines: string[] = [];
  let currentLine = '';
  let lastY: number | null = null;

  for (const item of textContent.items) {
    if (!('str' in item)) continue;
    const textItem = item as TextItem;
    const y = textItem.transform[5];

    if (lastY !== null && Math.abs(y - lastY) > 5) {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = textItem.str;
    } else {
      currentLine += textItem.str;
    }
    lastY = y;
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines.join('\n');
}

export async function extractTextFromPDF(
  pdfPath: string,
  outputDir: string,
  onProgress?: ProgressCallback
): Promise<ExtractionResult> {
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const pdf: PDFDocumentProxy = await getDocument({ data }).promise;
    const totalPages = pdf.numPages;

    fs.mkdirSync(outputDir, { recursive: true });

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.({ currentPage: pageNum, totalPages, phase: 'text' });

      const page = await pdf.getPage(pageNum);
      const text = await extractPageText(page);

      const outputPath = path.join(outputDir, `page-${String(pageNum).padStart(3, '0')}.md`);
      fs.writeFileSync(outputPath, `# Page ${pageNum}\n\n${text}\n`);
    }

    return { success: true, totalPages, extractedPages: totalPages };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, totalPages: 0, extractedPages: 0, error: message };
  }
}

export async function getPDFPageCount(pdfPath: string): Promise<number> {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf: PDFDocumentProxy = await getDocument({ data }).promise;
  return pdf.numPages;
}
