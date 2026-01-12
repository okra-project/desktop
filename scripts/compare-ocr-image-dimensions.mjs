import fs from 'node:fs';
import path from 'node:path';

const [workspacePath, providerId = 'openrouter', scaleArg = '2.0'] =
  process.argv.slice(2);

if (!workspacePath) {
  console.error(
    'Usage: node scripts/compare-ocr-image-dimensions.mjs <workspacePath> [providerId] [scale]',
  );
  process.exit(1);
}

const scale = Number(scaleArg);
if (Number.isNaN(scale) || scale <= 0) {
  console.error('Scale must be a positive number.');
  process.exit(1);
}

const pdfFile = fs
  .readdirSync(workspacePath)
  .find((file) => file.toLowerCase().endsWith('.pdf'));

if (!pdfFile) {
  console.error('No PDF found in workspace.');
  process.exit(1);
}

const pdfPath = path.join(workspacePath, pdfFile);
const ocrDir = path.join(workspacePath, 'ocr', providerId);

if (!fs.existsSync(ocrDir)) {
  console.error(`OCR directory not found: ${ocrDir}`);
  process.exit(1);
}

const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await getDocument({ data, disableFontFace: true, verbosity: 0 })
  .promise;

const pages = fs
  .readdirSync(ocrDir)
  .filter((file) => file.startsWith('page-') && file.endsWith('.json'))
  .sort();

const report = [];

for (const file of pages) {
  const pageNumber = Number(file.match(/page-(\d+)\.json/)?.[1] ?? 0);
  if (!pageNumber) continue;

  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const pageData = JSON.parse(
    fs.readFileSync(path.join(ocrDir, file), 'utf-8'),
  );
  const imageSize = pageData.imageSize;

  report.push({
    page: pageNumber,
    pdfWidth: Math.round(viewport.width),
    pdfHeight: Math.round(viewport.height),
    ocrWidth: imageSize?.width ?? null,
    ocrHeight: imageSize?.height ?? null,
    widthDelta: imageSize?.width
      ? Math.round(imageSize.width - viewport.width)
      : null,
    heightDelta: imageSize?.height
      ? Math.round(imageSize.height - viewport.height)
      : null,
  });
}

console.table(report);
