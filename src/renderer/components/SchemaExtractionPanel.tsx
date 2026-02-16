/**
 * Schema Extraction Panel - Structured data extraction from OCR content.
 *
 * Allows users to define a schema (or use templates), run extraction via
 * OpenRouter VLM, and view results with citations that link back to PDF pages.
 *
 * Ported from cloud app/app.okrapdf.com/(dashboard)/ocr/[jobId]/schema/page.tsx
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type {
  SchemaDefinition,
  SchemaFieldDefinition,
  SchemaFieldType,
  SchemaRunResponse,
  SchemaAssistantMessage,
  SchemaTemplate,
  CitationMode,
} from '../../shared/types/schema';

// -- Templates (inline, ported from cloud lib/schema/templates.ts) --

const FIELD_TYPES: SchemaFieldType[] = ['string', 'number', 'boolean', 'date', 'array', 'object'];

const BUILTIN_TEMPLATES: SchemaTemplate[] = [
  {
    id: 'generic-key-value',
    name: 'Generic Key-Value',
    description: 'Simple starter for custom extraction',
    schema: {
      name: 'Custom Schema',
      fields: [
        { key: 'field_1', label: 'Field 1', type: 'string' },
        { key: 'field_2', label: 'Field 2', type: 'string' },
      ],
    },
  },
  {
    id: 'invoice',
    name: 'Invoice',
    description: 'Vendor, totals, dates, and line items',
    schema: {
      name: 'Invoice',
      fields: [
        { key: 'vendor.name', label: 'Vendor Name', type: 'string', required: true },
        { key: 'invoice.number', label: 'Invoice Number', type: 'string', required: true },
        { key: 'invoice.date', label: 'Invoice Date', type: 'date' },
        { key: 'invoice.due_date', label: 'Due Date', type: 'date' },
        { key: 'totals.subtotal', label: 'Subtotal', type: 'number' },
        { key: 'totals.tax', label: 'Tax', type: 'number' },
        { key: 'totals.total', label: 'Total', type: 'number', required: true },
        { key: 'line_items', label: 'Line Items', type: 'array' },
      ],
    },
  },
  {
    id: 'financial-statement',
    name: 'Financial Statement',
    description: 'Core statement metrics for reports',
    schema: {
      name: 'Financial Statement',
      fields: [
        { key: 'company.name', label: 'Company Name', type: 'string', required: true },
        { key: 'period.label', label: 'Reporting Period', type: 'string', required: true },
        { key: 'metrics.revenue', label: 'Revenue', type: 'number' },
        { key: 'metrics.net_income', label: 'Net Income', type: 'number' },
        { key: 'metrics.total_assets', label: 'Total Assets', type: 'number' },
        { key: 'metrics.total_liabilities', label: 'Total Liabilities', type: 'number' },
        { key: 'metrics.eps', label: 'EPS', type: 'number' },
        { key: 'tables', label: 'Statement Tables', type: 'array' },
      ],
    },
  },
  {
    id: 'contract',
    name: 'Contract',
    description: 'Parties, dates, obligations, and key terms',
    schema: {
      name: 'Contract',
      fields: [
        { key: 'parties', label: 'Parties', type: 'array', required: true },
        { key: 'effective_date', label: 'Effective Date', type: 'date' },
        { key: 'termination_date', label: 'Termination Date', type: 'date' },
        { key: 'contract_value', label: 'Contract Value', type: 'number' },
        { key: 'obligations', label: 'Obligations', type: 'array' },
        { key: 'key_terms', label: 'Key Terms', type: 'array' },
      ],
    },
  },
  {
    id: 'receipt',
    name: 'Receipt',
    description: 'Merchant, payment details, and purchased items',
    schema: {
      name: 'Receipt',
      fields: [
        { key: 'merchant.name', label: 'Merchant Name', type: 'string', required: true },
        { key: 'transaction.date', label: 'Transaction Date', type: 'date' },
        { key: 'transaction.total', label: 'Total', type: 'number', required: true },
        { key: 'transaction.tax', label: 'Tax', type: 'number' },
        { key: 'payment.method', label: 'Payment Method', type: 'string' },
        { key: 'items', label: 'Items', type: 'array' },
      ],
    },
  },
  {
    id: 'resume',
    name: 'Resume',
    description: 'Candidate profile and structured career history',
    schema: {
      name: 'Resume',
      fields: [
        { key: 'name', label: 'Full Name', type: 'string', required: true },
        { key: 'email', label: 'Email', type: 'string' },
        { key: 'phone', label: 'Phone', type: 'string' },
        { key: 'location', label: 'Location', type: 'string' },
        { key: 'summary', label: 'Summary', type: 'string' },
        { key: 'experience', label: 'Experience', type: 'array' },
        { key: 'education', label: 'Education', type: 'array' },
        { key: 'skills', label: 'Skills', type: 'array' },
      ],
    },
  },
];

const DEFAULT_TEMPLATE_ID = 'generic-key-value';

function cloneSchema(schema: SchemaDefinition): SchemaDefinition {
  return JSON.parse(JSON.stringify(schema)) as SchemaDefinition;
}

function defaultSchema(): SchemaDefinition {
  const fallback = BUILTIN_TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID);
  return cloneSchema(
    fallback?.schema ?? {
      name: 'Custom Schema',
      fields: [{ key: 'field_1', label: 'Field 1', type: 'string', required: false }],
    },
  );
}

// -- Component --

interface SchemaExtractionPanelProps {
  workspacePath: string;
  onNavigateToPage?: (page: number) => void;
  onClose?: () => void;
}

export function SchemaExtractionPanel({
  workspacePath,
  onNavigateToPage,
  onClose,
}: SchemaExtractionPanelProps) {
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [schema, setSchema] = useState<SchemaDefinition>(defaultSchema());
  const [pages, setPages] = useState('');
  const [citationMode, setCitationMode] = useState<CitationMode>('best');

  const [extractionBusy, setExtractionBusy] = useState(false);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [lastRun, setLastRun] = useState<SchemaRunResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Assistant chat
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<SchemaAssistantMessage[]>([
    {
      role: 'assistant',
      content:
        'Describe what you want to extract in plain language. I will generate and refine the schema fields for you.',
    },
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Schema operations
  const applyTemplate = useCallback((nextId: string) => {
    setTemplateId(nextId);
    const template = BUILTIN_TEMPLATES.find((t) => t.id === nextId);
    if (!template) return;
    setSchema(cloneSchema(template.schema));
    setLastRun(null);
    setErrorMsg(null);
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: `Loaded template: ${template.name}.` },
    ]);
  }, []);

  const updateField = (index: number, patch: Partial<SchemaFieldDefinition>) => {
    setSchema((prev) => {
      const nextFields = [...prev.fields];
      nextFields[index] = { ...nextFields[index], ...patch };
      return { ...prev, fields: nextFields };
    });
  };

  const removeField = (index: number) => {
    setSchema((prev) => {
      const nextFields = [...prev.fields];
      nextFields.splice(index, 1);
      return {
        ...prev,
        fields: nextFields.length > 0
          ? nextFields
          : [{ key: 'field_1', label: 'Field 1', type: 'string', required: false }],
      };
    });
  };

  const moveField = (index: number, direction: -1 | 1) => {
    setSchema((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.fields.length) return prev;
      const nextFields = [...prev.fields];
      const temp = nextFields[index];
      nextFields[index] = nextFields[target];
      nextFields[target] = temp;
      return { ...prev, fields: nextFields };
    });
  };

  const addField = () => {
    setSchema((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          key: `field_${prev.fields.length + 1}`,
          label: `Field ${prev.fields.length + 1}`,
          type: 'string' as SchemaFieldType,
          required: false,
        },
      ],
    }));
  };

  // Run extraction via IPC
  const onRunExtraction = async () => {
    if (extractionBusy) return;
    setExtractionBusy(true);
    setErrorMsg(null);

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'schema:run-extraction',
        workspacePath,
        schema,
        { pages: pages.trim() || undefined, citation_mode: citationMode },
      );

      if (result.success) {
        setLastRun(result.data);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Extraction complete. ${result.data.fields.length} fields returned with citations.`,
          },
        ]);
      } else {
        setErrorMsg(result.error);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Extraction failed: ${result.error}` },
        ]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setErrorMsg(msg);
    } finally {
      setExtractionBusy(false);
    }
  };

  // Assistant chat via IPC
  const onAssistantSubmit = async () => {
    const prompt = chatInput.trim();
    if (!prompt || assistantBusy) return;

    const nextMessages: SchemaAssistantMessage[] = [
      ...messages,
      { role: 'user', content: prompt },
    ];
    setMessages(nextMessages);
    setChatInput('');
    setAssistantBusy(true);

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'schema:run-assistant',
        nextMessages,
        schema,
        templateId,
      );

      if (result.success) {
        setSchema(result.data.schema);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: result.data.assistant_reply },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${result.error}` },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Failed to reach the assistant. Check your API key.' },
      ]);
    } finally {
      setAssistantBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white text-slate-700">
      {/* Header */}
      <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Schema Extraction</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onRunExtraction}
            disabled={extractionBusy}
            className={`h-7 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 ${
              extractionBusy
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {extractionBusy ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
            Run
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-200 rounded transition-colors"
              title="Close schema panel"
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-4 space-y-4">
          {/* Page filter + citation mode */}
          <div className="flex items-center gap-2">
            <input
              value={pages}
              onChange={(e) => setPages(e.target.value)}
              placeholder="Pages (1-5 or 1,3,5)"
              className="h-7 w-40 rounded-md border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <select
              value={citationMode}
              onChange={(e) => setCitationMode(e.target.value as CitationMode)}
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs"
            >
              <option value="best">Best Citation</option>
              <option value="all">All Citations</option>
            </select>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {errorMsg}
            </div>
          )}

          {/* Template + Schema Name */}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-slate-600">Template</label>
              <select
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="w-full h-7 rounded-md border border-slate-200 bg-white px-2 text-xs"
              >
                {BUILTIN_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-slate-600">Schema Name</label>
              <input
                value={schema.name || ''}
                onChange={(e) => setSchema((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Custom Schema"
                className="w-full h-7 rounded-md border border-slate-200 bg-white px-2 text-xs"
              />
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600">Fields</label>
              <button
                onClick={addField}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14m-7-7h14" />
                </svg>
                Add
              </button>
            </div>

            <div className="space-y-2 max-h-[35vh] overflow-auto pr-1">
              {schema.fields.map((field, index) => (
                <div key={`${field.key}-${index}`} className="rounded-md border border-slate-200 p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      value={field.key}
                      onChange={(e) => updateField(index, { key: e.target.value })}
                      placeholder="field.path"
                      className="flex-1 h-6 rounded border border-slate-200 px-2 text-xs"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => updateField(index, { type: e.target.value as SchemaFieldType })}
                      className="h-6 rounded border border-slate-200 px-1 text-xs"
                    >
                      {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <input
                    value={field.label || ''}
                    onChange={(e) => updateField(index, { label: e.target.value })}
                    placeholder="Label"
                    className="w-full h-6 rounded border border-slate-200 px-2 text-xs"
                  />
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-600 flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={Boolean(field.required)}
                        onChange={(e) => updateField(index, { required: e.target.checked })}
                      />
                      Required
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        className="h-5 px-1.5 text-[10px] rounded border border-slate-200 hover:bg-slate-50"
                        onClick={() => moveField(index, -1)}
                      >Up</button>
                      <button
                        className="h-5 px-1.5 text-[10px] rounded border border-slate-200 hover:bg-slate-50"
                        onClick={() => moveField(index, 1)}
                      >Down</button>
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded border border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => removeField(index)}
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Results */}
          {lastRun && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Results</h3>
              <div className="space-y-2 max-h-[40vh] overflow-auto pr-1">
                {lastRun.fields.map((field) => (
                  <div key={field.path} className="rounded-md border border-slate-200 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-800 truncate">{field.path}</div>
                        <div className="text-[10px] text-slate-500">{field.type}</div>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        conf: {field.confidence === null ? '-' : field.confidence.toFixed(2)}
                      </div>
                    </div>
                    <pre className="mt-1.5 rounded bg-slate-50 border border-slate-100 p-1.5 text-xs overflow-auto max-h-24">
                      {JSON.stringify(field.value, null, 2)}
                    </pre>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {field.citations.length === 0 && (
                        <span className="text-[10px] text-slate-400">No citations</span>
                      )}
                      {field.citations.map((citation, i) => (
                        <button
                          key={`${field.path}-${citation.page}-${i}`}
                          onClick={() => onNavigateToPage?.(citation.page)}
                          className="text-[10px] rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 border border-blue-100 hover:bg-blue-100 transition-colors cursor-pointer"
                          title={citation.quote}
                        >
                          p{citation.page}: {citation.quote.slice(0, 50)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Schema Assistant */}
        <div className="sticky bottom-0 border-t border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" />
              <path d="M10 21h4" />
            </svg>
            <h3 className="text-xs font-semibold text-slate-800">Schema Assistant</h3>
          </div>
          <div className="max-h-32 overflow-auto space-y-1.5 pr-1 mb-2">
            {messages.map((msg, i) => (
              <div
                key={`${msg.role}-${i}`}
                className={`rounded-md px-2.5 py-1.5 text-xs whitespace-pre-wrap ${
                  msg.role === 'assistant'
                    ? 'bg-slate-100 text-slate-700'
                    : 'bg-blue-600 text-white'
                }`}
              >
                {msg.content}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex items-center gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onAssistantSubmit();
                }
              }}
              placeholder='e.g. "Pull company name, revenue, net income"'
              className="flex-1 h-7 rounded-md border border-slate-200 px-2.5 text-xs"
            />
            <button
              onClick={onAssistantSubmit}
              disabled={assistantBusy}
              className={`h-7 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 ${
                assistantBusy
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {assistantBusy ? (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              )}
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
