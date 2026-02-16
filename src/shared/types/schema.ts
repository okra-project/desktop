/**
 * Schema extraction types - ported from cloud lib/schema/types.ts
 * Used for structured data extraction from OCR content via VLM.
 */

export type SchemaFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'array'
  | 'object';

export type CitationMode = 'best' | 'all';

export interface SchemaFieldDefinition {
  key: string;
  label?: string;
  description?: string;
  type: SchemaFieldType;
  required?: boolean;
}

export interface SchemaDefinition {
  name?: string;
  fields: SchemaFieldDefinition[];
}

export interface SchemaCitation {
  page: number;
  quote: string;
  bbox?: { x: number; y: number; width: number; height: number };
  source: 'ocr_page' | 'table';
}

export interface SchemaFieldResult {
  path: string;
  type: SchemaFieldType;
  value: unknown;
  confidence: number | null;
  citations: SchemaCitation[];
}

export interface SchemaRunResponse {
  run_id: string;
  status: 'completed';
  extracted_at: string;
  values: Record<string, unknown>;
  fields: SchemaFieldResult[];
}

export interface SchemaAssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SchemaTemplate {
  id: string;
  name: string;
  description: string;
  schema: SchemaDefinition;
}
