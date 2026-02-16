/**
 * Schema Extraction - Local-first structured data extraction from OCR content.
 *
 * Reads workspace OCR markdown files + extracted tables, builds a prompt,
 * sends to OpenRouter VLM, and returns typed/cited field results.
 *
 * Port of cloud lib/schema/extractor.ts adapted for local filesystem.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  SchemaFieldDefinition,
  SchemaFieldType,
  SchemaFieldResult,
  SchemaRunResponse,
  SchemaCitation,
  CitationMode,
  SchemaDefinition,
  SchemaAssistantMessage,
} from '../shared/types/schema';

const MAX_PAGE_CONTEXT = 40;
const MAX_TABLE_CONTEXT = 80;
const MAX_PAGE_CHARS = 3000;
const MAX_TABLE_CHARS = 2500;

interface PageContext {
  page: number;
  content: string;
}

interface TableContext {
  page: number;
  table_index: number;
  markdown: string;
}

interface BuildContextResult {
  pages: PageContext[];
  tables: TableContext[];
}

// ---------------------------------------------------------------------------
// Type coercion helpers (from cloud extractor.ts)
// ---------------------------------------------------------------------------

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[, ]+/g, '').replace(/[%$]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
  if (typeof value !== 'string') return null;
  const n = value.trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(n)) return true;
  if (['false', 'no', 'n', '0'].includes(n)) return false;
  return null;
}

function coerceDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function coerceArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [trimmed];
  } catch {
    return trimmed.split(',').map((t) => t.trim()).filter(Boolean);
  }
}

function coerceObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function coerceValue(value: unknown, type: SchemaFieldType): unknown {
  if (value === undefined) return null;
  switch (type) {
    case 'string': return value === null ? null : String(value);
    case 'number': return coerceNumber(value);
    case 'boolean': return coerceBoolean(value);
    case 'date': return coerceDate(value);
    case 'array': return coerceArray(value);
    case 'object': return coerceObject(value);
    default: return value ?? null;
  }
}

function clampConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}...`;
}

function parseJson<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { /* continue */ }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)) as T; } catch { /* ignore */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Page range parsing
// ---------------------------------------------------------------------------

export function parsePageRange(range: string): number[] | null {
  if (!range) return null;
  const pages: number[] = [];

  if (range.includes(',')) {
    for (const part of range.split(',')) {
      const p = parseInt(part.trim(), 10);
      if (!Number.isNaN(p)) pages.push(p);
    }
    return pages.length > 0 ? pages : null;
  }

  if (range.includes('-')) {
    const [s, e] = range.split('-').map((x) => parseInt(x.trim(), 10));
    if (!Number.isNaN(s) && !Number.isNaN(e) && e >= s) {
      for (let p = s; p <= e; p++) pages.push(p);
    }
    return pages.length > 0 ? pages : null;
  }

  const single = parseInt(range, 10);
  return !Number.isNaN(single) ? [single] : null;
}

// ---------------------------------------------------------------------------
// Build context from local workspace files
// ---------------------------------------------------------------------------

function buildLocalContext(
  workspacePath: string,
  pageFilter: number[] | null,
): BuildContextResult {
  const pages: PageContext[] = [];
  const tables: TableContext[] = [];

  // Gather OCR page content from plugins directories
  const pluginDirs = ['qwen-markdown', 'openrouter', 'text-extractor'];
  const pluginsRoot = path.join(workspacePath, 'plugins');
  const ocrRoot = path.join(workspacePath, 'ocr');

  // Find all page markdown files
  const pageFiles = new Map<number, string>();

  for (const dir of pluginDirs) {
    const dirPath = path.join(pluginsRoot, dir);
    if (!fs.existsSync(dirPath)) continue;
    const files = fs.readdirSync(dirPath).filter((f) => /^page-\d+\.md$/.test(f));
    for (const file of files) {
      const pageNum = parseInt(file.replace('page-', '').replace('.md', ''), 10);
      if (Number.isNaN(pageNum)) continue;
      if (pageFilter && !pageFilter.includes(pageNum)) continue;
      if (!pageFiles.has(pageNum)) {
        pageFiles.set(pageNum, path.join(dirPath, file));
      }
    }
  }

  // Fallback to ocr/ directory
  if (fs.existsSync(ocrRoot)) {
    const files = fs.readdirSync(ocrRoot).filter((f) => /^page-\d+\.md$/.test(f));
    for (const file of files) {
      const pageNum = parseInt(file.replace('page-', '').replace('.md', ''), 10);
      if (Number.isNaN(pageNum)) continue;
      if (pageFilter && !pageFilter.includes(pageNum)) continue;
      if (!pageFiles.has(pageNum)) {
        pageFiles.set(pageNum, path.join(ocrRoot, file));
      }
    }
  }

  // Sort by page number and read content
  const sortedPages = Array.from(pageFiles.entries()).sort((a, b) => a[0] - b[0]);
  for (const [pageNum, filePath] of sortedPages.slice(0, MAX_PAGE_CONTEXT)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    pages.push({ page: pageNum, content: truncate(content, MAX_PAGE_CHARS) });
  }

  // Gather extracted tables
  const tablesDir = path.join(workspacePath, 'tables');
  const manifestPath = path.join(tablesDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const tablesByPage = new Map<number, number>();

      for (const table of manifest.tables || []) {
        if (tables.length >= MAX_TABLE_CONTEXT) break;
        const page = table.page;
        if (pageFilter && !pageFilter.includes(page)) continue;

        const idx = tablesByPage.get(page) ?? 0;
        tablesByPage.set(page, idx + 1);

        const tablePath = path.join(tablesDir, `${table.id}.md`);
        const markdown = fs.existsSync(tablePath)
          ? fs.readFileSync(tablePath, 'utf-8')
          : table.markdown || '';

        tables.push({
          page,
          table_index: idx,
          markdown: truncate(markdown, MAX_TABLE_CHARS),
        });
      }
    } catch {
      // ignore manifest parse errors
    }
  }

  return { pages, tables };
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function buildExtractionPrompt(
  fields: SchemaFieldDefinition[],
  context: BuildContextResult,
): string {
  return [
    'You extract structured values from OCR pages and extracted table markdown.',
    'Return strictly valid JSON.',
    '',
    'Output shape:',
    '{"fields":[{"path":"field.key","value":any|null,"confidence":0..1,"citations":[{"page":1,"quote":"...","source":"ocr_page|table"}]}]}',
    '',
    'Rules:',
    '- Include every requested path exactly once.',
    '- If unknown, set value to null, confidence to 0, citations to [].',
    '- Citations must reference evidence text from context.',
    '- Keep quotes short and exact.',
    '',
    `Requested fields: ${JSON.stringify(fields)}`,
    '',
    `Context pages: ${JSON.stringify(context.pages)}`,
    '',
    `Context tables: ${JSON.stringify(context.tables)}`,
  ].join('\n');
}

function buildAssistantPrompt(params: {
  messages: SchemaAssistantMessage[];
  currentSchema?: SchemaDefinition;
  templateHint?: string;
}): string {
  const recentMessages = params.messages.slice(-10);
  return [
    'You are a schema design assistant for OCR extraction.',
    'Produce a concise assistant reply and an updated JSON schema for extraction.',
    'The schema must stay domain-agnostic and editable.',
    '',
    'Return strictly valid JSON:',
    '{"assistant_reply":"string","schema":{"name":"string","fields":[{"key":"x","label":"X","description":"...","type":"string|number|boolean|date|array|object","required":true}]}}',
    '',
    'Rules:',
    '- Keep keys machine-friendly (dot paths allowed).',
    '- Prefer 3-15 fields unless user asks otherwise.',
    '- Do not include markdown fences.',
    '',
    `Current schema: ${JSON.stringify(params.currentSchema ?? null)}`,
    '',
    `Conversation: ${JSON.stringify(recentMessages)}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Citation normalization
// ---------------------------------------------------------------------------

function normalizeCitations(
  raw: unknown,
  mode: CitationMode,
): SchemaCitation[] {
  if (!Array.isArray(raw)) return [];
  const out: SchemaCitation[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const page = Number(c.page);
    const quote = typeof c.quote === 'string' ? c.quote.trim() : '';
    const source = c.source === 'table' ? 'table' : 'ocr_page';
    if (!Number.isInteger(page) || page < 1 || !quote) continue;
    out.push({ page, quote: truncate(quote, 300), source });
  }

  return mode === 'best' ? out.slice(0, 1) : out.slice(0, 6);
}

// ---------------------------------------------------------------------------
// OpenRouter API call
// ---------------------------------------------------------------------------

async function callOpenRouter(
  apiKey: string,
  prompt: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/nicepkg/okrapdf-desktop',
      'X-Title': 'OkraPDF Desktop (OSS)',
    },
    body: JSON.stringify({
      model: 'qwen/qwen2.5-vl-72b-instruct',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: opts.maxTokens ?? 6000,
      temperature: opts.temperature ?? 0.1,
      response_format: { type: 'json_object' },
      provider: { zdr: true, data_collection: 'deny', sort: 'throughput' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '{}';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function setPathValue(target: Record<string, unknown>, dotPath: string, value: unknown) {
  const tokens = dotPath.split('.').filter(Boolean);
  if (tokens.length === 0) return;
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    const current = cursor[token];
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      const next: Record<string, unknown> = {};
      cursor[token] = next;
      cursor = next;
    } else {
      cursor = current as Record<string, unknown>;
    }
  }
  cursor[tokens[tokens.length - 1]] = value;
}

export async function runSchemaExtraction(params: {
  apiKey: string;
  workspacePath: string;
  schema: SchemaDefinition;
  pages?: string;
  citationMode?: CitationMode;
}): Promise<SchemaRunResponse> {
  const { apiKey, workspacePath, schema, pages, citationMode = 'best' } = params;

  // Validate schema has fields
  if (!schema.fields || schema.fields.length === 0) {
    throw new Error('Schema must have at least one field');
  }

  const pageFilter = pages ? parsePageRange(pages) : null;
  const context = buildLocalContext(workspacePath, pageFilter);

  if (context.pages.length === 0 && context.tables.length === 0) {
    throw new Error('No OCR content found. Run text extraction first.');
  }

  const prompt = buildExtractionPrompt(schema.fields, context);
  const raw = await callOpenRouter(apiKey, prompt, { temperature: 0.1, maxTokens: 6000 });

  const parsed = parseJson<{ fields?: Array<Record<string, unknown>> }>(raw) ?? {};
  const extractedFields = Array.isArray(parsed.fields) ? parsed.fields : [];

  const runFields: SchemaFieldResult[] = schema.fields.map((def) => {
    const match =
      extractedFields.find((f) => f.path === def.key) ||
      extractedFields.find((f) => f.path === def.key?.toLowerCase());

    const value = coerceValue(match?.value, def.type);
    const confidence = clampConfidence(match?.confidence);
    const citations = normalizeCitations(match?.citations, citationMode);

    return { path: def.key, type: def.type, value, confidence, citations };
  });

  const values: Record<string, unknown> = {};
  for (const field of runFields) {
    setPathValue(values, field.path, field.value);
  }

  return {
    run_id: `schema-${crypto.randomUUID().slice(0, 12)}`,
    status: 'completed',
    extracted_at: new Date().toISOString(),
    values,
    fields: runFields,
  };
}

export async function runSchemaAssistant(params: {
  apiKey: string;
  messages: SchemaAssistantMessage[];
  currentSchema?: SchemaDefinition;
  templateHint?: string;
}): Promise<{ assistant_reply: string; schema: SchemaDefinition }> {
  const { apiKey, messages, currentSchema, templateHint } = params;

  const prompt = buildAssistantPrompt({ messages, currentSchema, templateHint });
  const raw = await callOpenRouter(apiKey, prompt, { temperature: 0.2, maxTokens: 3000 });

  const decoded = parseJson<{ assistant_reply?: string; schema?: SchemaDefinition }>(raw);

  if (decoded?.assistant_reply && decoded?.schema?.fields?.length) {
    return {
      assistant_reply: decoded.assistant_reply,
      schema: decoded.schema,
    };
  }

  // Fallback: keep current schema
  return {
    assistant_reply:
      'I could not fully parse the model response, so I kept your current schema. Try a more specific request.',
    schema: currentSchema ?? { name: 'Custom Schema', fields: [{ key: 'field_1', label: 'Field 1', type: 'string' }] },
  };
}
