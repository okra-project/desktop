import type { ToolSchema } from '../../shared/types/query';

function toCamelCase(str: string): string {
  return str
    .replace(/_([a-z])/g, (_, l) => l.toUpperCase())
    .replace(/^[a-z]/, (l) => l.toUpperCase());
}

function jsonTypeToTs(jsonType: string): string {
  const map: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    object: 'Record<string, unknown>',
    array: 'unknown[]',
  };
  return map[jsonType] || 'unknown';
}

export function generateToolTypes(tools: ToolSchema[]): string {
  let types = '';
  let declarations = '';

  for (const tool of tools) {
    const inputTypeName = toCamelCase(tool.name) + 'Input';
    const outputTypeName = toCamelCase(tool.name) + 'Output';

    types += `interface ${inputTypeName} {\n`;
    for (const [key, schema] of Object.entries(tool.inputSchema)) {
      const optional = schema.required === false ? '?' : '';
      types += `  ${key}${optional}: ${jsonTypeToTs(schema.type)};\n`;
    }
    types += '}\n\n';

    if (tool.outputSchema) {
      types += `interface ${outputTypeName} {\n`;
      for (const [key, schema] of Object.entries(tool.outputSchema)) {
        types += `  ${key}: ${jsonTypeToTs(schema.type)};\n`;
      }
      types += '}\n\n';
    } else {
      types += `interface ${outputTypeName} { [key: string]: unknown; }\n\n`;
    }

    declarations += `  /** ${tool.description} */\n`;
    declarations += `  ${tool.name}: (input: ${inputTypeName}) => Promise<${outputTypeName}>;\n`;
  }

  return `${types}\ndeclare const mcp: {\n${declarations}};\n`;
}

export const MCP_TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'list_workspaces',
    description: 'List all local PDF workspaces',
    inputSchema: {},
    outputSchema: {
      workspaces: { type: 'array' },
    },
  },
  {
    name: 'get_workspace',
    description: 'Get workspace content',
    inputSchema: {
      workspaceId: { type: 'string', required: true },
      page: { type: 'number', required: false },
    },
  },
  {
    name: 'search_workspace',
    description: 'Search within a workspace',
    inputSchema: {
      workspaceId: { type: 'string', required: true },
      query: { type: 'string', required: true },
    },
  },
  {
    name: 'global_search',
    description: 'Search all workspaces',
    inputSchema: {
      query: { type: 'string', required: true },
    },
  },
  {
    name: 'query',
    description:
      'Execute declarative query (SQL-like or jQuery-like selector) and display results. Examples: "SELECT tables FROM current", ".table:page(5)", "[confidence>0.9]"',
    inputSchema: {
      query: {
        type: 'string',
        required: true,
        description: 'SQL-like query or jQuery selector',
      },
      display: {
        type: 'string',
        required: false,
        description: 'grid|list|overlay|split|carousel',
      },
    },
    outputSchema: {
      totalCount: { type: 'number' },
      results: { type: 'array' },
      executionMs: { type: 'number' },
    },
  },
];
