/**
 * Agent Tool Definitions - Extended tool set for extraction review agent
 */

export type ToolPermissionLevel = 'none' | 'page' | 'edit' | 'explicit';

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  category:
    | 'query'
    | 'navigation'
    | 'interaction'
    | 'extraction'
    | 'edit'
    | 'export';
  parameters: Record<string, ToolParameter>;
  permissionLevel: ToolPermissionLevel;
  blocking?: boolean;
}

export const AGENT_TOOLS: Record<string, ToolDefinition> = {
  get_document_overview: {
    name: 'get_document_overview',
    description:
      'Get summary of document: page count, extraction status, tables found',
    category: 'query',
    parameters: {},
    permissionLevel: 'none',
  },

  get_page_content: {
    name: 'get_page_content',
    description:
      'Get all extractions for a specific page including tables, figures, text',
    category: 'query',
    parameters: {
      pageNumber: {
        type: 'number',
        description: 'Page number (1-indexed)',
        required: true,
      },
    },
    permissionLevel: 'none',
  },

  get_tables: {
    name: 'get_tables',
    description: 'Get all tables across document or specific page',
    category: 'query',
    parameters: {
      pageNumber: {
        type: 'number',
        description: 'Optional page filter',
        required: false,
      },
    },
    permissionLevel: 'none',
  },

  query_selector: {
    name: 'query_selector',
    description:
      'Query entities using CSS-like selectors (.table, .figure, [text*="search"])',
    category: 'query',
    parameters: {
      selector: {
        type: 'string',
        description: 'CSS-like selector',
        required: true,
      },
    },
    permissionLevel: 'none',
  },

  search_document: {
    name: 'search_document',
    description: 'Full-text search across document',
    category: 'query',
    parameters: {
      query: { type: 'string', description: 'Search query', required: true },
    },
    permissionLevel: 'none',
  },

  navigate_to_page: {
    name: 'navigate_to_page',
    description: 'Navigate the PDF viewer to a specific page',
    category: 'navigation',
    parameters: {
      pageNumber: {
        type: 'number',
        description: 'Target page number',
        required: true,
      },
    },
    permissionLevel: 'none',
  },

  highlight_region: {
    name: 'highlight_region',
    description: 'Highlight a bounding box region on the current page',
    category: 'navigation',
    parameters: {
      bbox: {
        type: 'object',
        description: 'Bounding box {x, y, width, height}',
        required: true,
      },
      color: {
        type: 'string',
        description: 'Highlight color',
        required: false,
        default: 'yellow',
      },
      label: {
        type: 'string',
        description: 'Optional label for the highlight',
        required: false,
      },
    },
    permissionLevel: 'none',
  },

  ask_human: {
    name: 'ask_human',
    description: 'Ask the user a question and wait for their response',
    category: 'interaction',
    parameters: {
      question: {
        type: 'string',
        description: 'Question to ask',
        required: true,
      },
      context: {
        type: 'string',
        description: 'Additional context',
        required: false,
      },
      options: {
        type: 'array',
        description: 'Predefined answer options',
        required: false,
      },
      inputType: {
        type: 'string',
        description: 'text | choice | confirmation',
        required: false,
        default: 'text',
      },
      pageRef: {
        type: 'number',
        description: 'Related page number',
        required: false,
      },
    },
    permissionLevel: 'none',
    blocking: true,
  },

  request_page_review: {
    name: 'request_page_review',
    description: 'Flag a page for human review before proceeding',
    category: 'interaction',
    parameters: {
      pageNumber: {
        type: 'number',
        description: 'Page to review',
        required: true,
      },
      items: {
        type: 'array',
        description: 'Items needing review',
        required: true,
      },
      urgency: {
        type: 'string',
        description: 'low | medium | high',
        required: false,
        default: 'medium',
      },
      reasoning: {
        type: 'string',
        description: 'Why review is needed',
        required: true,
      },
    },
    permissionLevel: 'none',
    blocking: true,
  },

  report_progress: {
    name: 'report_progress',
    description: 'Send a progress update to the user (non-blocking)',
    category: 'interaction',
    parameters: {
      phase: { type: 'string', description: 'Current phase', required: true },
      message: {
        type: 'string',
        description: 'Progress message',
        required: false,
      },
    },
    permissionLevel: 'none',
    blocking: false,
  },

  extract_table: {
    name: 'extract_table',
    description: 'Extract a table from a page region using VLM',
    category: 'extraction',
    parameters: {
      pageNumber: {
        type: 'number',
        description: 'Page containing the table',
        required: true,
      },
      bbox: {
        type: 'object',
        description: 'Bounding box of the table',
        required: false,
      },
      prompt: {
        type: 'string',
        description: 'Custom extraction prompt',
        required: false,
      },
    },
    permissionLevel: 'page',
  },

  reextract_table: {
    name: 'reextract_table',
    description: 'Re-extract a table with different parameters',
    category: 'extraction',
    parameters: {
      tableId: {
        type: 'string',
        description: 'ID of table to re-extract',
        required: true,
      },
      prompt: {
        type: 'string',
        description: 'Custom extraction prompt',
        required: false,
      },
    },
    permissionLevel: 'page',
  },

  correct_extraction: {
    name: 'correct_extraction',
    description: 'Correct a value in an extraction',
    category: 'edit',
    parameters: {
      extractionId: {
        type: 'string',
        description: 'ID of extraction',
        required: true,
      },
      field: {
        type: 'string',
        description: 'Field to correct',
        required: true,
      },
      newValue: {
        type: 'string',
        description: 'Corrected value',
        required: true,
      },
      reasoning: {
        type: 'string',
        description: 'Reason for correction',
        required: true,
      },
    },
    permissionLevel: 'edit',
  },

  approve_page: {
    name: 'approve_page',
    description: 'Mark a page as verified and approved',
    category: 'edit',
    parameters: {
      pageNumber: {
        type: 'number',
        description: 'Page to approve',
        required: true,
      },
      confidence: {
        type: 'number',
        description: 'Confidence score 0-1',
        required: true,
      },
      notes: { type: 'string', description: 'Optional notes', required: false },
    },
    permissionLevel: 'page',
  },

  reject_page: {
    name: 'reject_page',
    description: 'Mark a page as rejected with reason',
    category: 'edit',
    parameters: {
      pageNumber: {
        type: 'number',
        description: 'Page to reject',
        required: true,
      },
      reason: {
        type: 'string',
        description: 'Rejection reason',
        required: true,
      },
    },
    permissionLevel: 'page',
  },

  flag_for_later: {
    name: 'flag_for_later',
    description: 'Flag a page or item for later review without blocking',
    category: 'edit',
    parameters: {
      pageNumber: {
        type: 'number',
        description: 'Page to flag',
        required: true,
      },
      reason: {
        type: 'string',
        description: 'Reason for flagging',
        required: true,
      },
      priority: {
        type: 'string',
        description: 'low | medium | high',
        required: false,
        default: 'medium',
      },
    },
    permissionLevel: 'none',
  },

  export_to_excel: {
    name: 'export_to_excel',
    description: 'Export all verified extractions to Excel file',
    category: 'export',
    parameters: {
      outputPath: {
        type: 'string',
        description: 'Output file path',
        required: false,
      },
      includePages: {
        type: 'array',
        description: 'Pages to include (default: all approved)',
        required: false,
      },
      format: {
        type: 'string',
        description: 'xlsx | csv',
        required: false,
        default: 'xlsx',
      },
    },
    permissionLevel: 'explicit',
  },

  export_to_json: {
    name: 'export_to_json',
    description: 'Export extractions as structured JSON',
    category: 'export',
    parameters: {
      outputPath: {
        type: 'string',
        description: 'Output file path',
        required: false,
      },
      includeMetadata: {
        type: 'boolean',
        description: 'Include extraction metadata',
        required: false,
        default: true,
      },
    },
    permissionLevel: 'explicit',
  },

  complete_task: {
    name: 'complete_task',
    description: 'Signal that the task is complete with summary',
    category: 'interaction',
    parameters: {
      summary: {
        type: 'string',
        description: 'Task completion summary',
        required: true,
      },
      outputPath: {
        type: 'string',
        description: 'Path to output file',
        required: false,
      },
    },
    permissionLevel: 'none',
  },
};

export function getToolsByCategory(
  category: ToolDefinition['category'],
): ToolDefinition[] {
  return Object.values(AGENT_TOOLS).filter((t) => t.category === category);
}

export function getToolsByPermission(
  level: ToolPermissionLevel,
): ToolDefinition[] {
  return Object.values(AGENT_TOOLS).filter((t) => t.permissionLevel === level);
}

export function requiresPermission(
  toolName: string,
  sessionLevel: 'yolo' | 'page' | 'edit',
): boolean {
  const tool = AGENT_TOOLS[toolName];
  if (!tool) return false;

  if (sessionLevel === 'yolo') return false;
  if (tool.permissionLevel === 'none') return false;
  if (tool.permissionLevel === 'explicit') return true;

  if (sessionLevel === 'page') {
    return tool.permissionLevel === 'page' || tool.permissionLevel === 'edit';
  }

  if (sessionLevel === 'edit') {
    return tool.permissionLevel === 'edit';
  }

  return false;
}

export function isBlockingTool(toolName: string): boolean {
  return AGENT_TOOLS[toolName]?.blocking === true;
}

export function generateToolsDocumentation(): string {
  const sections = [
    'query',
    'navigation',
    'interaction',
    'extraction',
    'edit',
    'export',
  ] as const;

  let doc = '## Available Tools\n\n';

  for (const category of sections) {
    const tools = getToolsByCategory(category);
    if (tools.length === 0) continue;

    doc += `### ${category.charAt(0).toUpperCase() + category.slice(1)} Tools\n\n`;

    for (const tool of tools) {
      doc += `**${tool.name}**\n`;
      doc += `${tool.description}\n`;

      const params = Object.entries(tool.parameters);
      if (params.length > 0) {
        doc += `Parameters:\n`;
        for (const [name, param] of params) {
          const required = param.required ? '(required)' : '(optional)';
          doc += `  - ${name}: ${param.type} ${required} - ${param.description}\n`;
        }
      }

      if (tool.permissionLevel !== 'none') {
        doc += `Permission: ${tool.permissionLevel}\n`;
      }
      if (tool.blocking) {
        doc += `Blocking: yes (waits for human response)\n`;
      }
      doc += '\n';
    }
  }

  return doc;
}
