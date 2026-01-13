import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { pdfWorkerService } from './services/pdf-worker.service';

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

export async function extractTextFromPDF(
  pdfPath: string,
  outputDir: string,
  onProgress?: ProgressCallback
): Promise<ExtractionResult> {
  try {
    const totalPages = await pdfWorkerService.getPageCount(pdfPath);

    fs.mkdirSync(outputDir, { recursive: true });

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.({ currentPage: pageNum, totalPages, phase: 'text' });

      const text = await pdfWorkerService.extractText(pdfPath, pageNum);

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
  return pdfWorkerService.getPageCount(pdfPath);
}

export async function generatePDFThumbnail(
  pdfPath: string,
  outputPath: string,
  size = 400
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const outputDir = path.dirname(outputPath);
    const pdfName = path.basename(pdfPath, '.pdf');
    
    execSync(`qlmanage -t -s ${size} -o "${outputDir}" "${pdfPath}"`, { 
      stdio: 'ignore',
      timeout: 10000 
    });
    
    const qlOutput = path.join(outputDir, `${pdfName}.pdf.png`);
    if (fs.existsSync(qlOutput)) {
      fs.renameSync(qlOutput, outputPath);
      return { success: true, path: outputPath };
    }
    
    return { success: false, error: 'Thumbnail not generated' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
