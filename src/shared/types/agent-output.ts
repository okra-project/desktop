/**
 * Agent Output Types - State Machine Response Format
 *
 * Every agent response is a typed output that the runtime can parse
 * and handle deterministically. No free-form text allowed.
 *
 * Inspired by:
 * - UI-TARS: AgentEventStream with typed events
 * - OpenHands: Action/Observation pattern
 * - Manus: Structured tool calls, todo tracking
 */

import type { BoundingBox } from './verification';

// ============================================
// Output Type Enum
// ============================================

export type AgentOutputType =
  | 'processing' // Agent working, no action needed
  | 'tool_call' // Agent invoking a tool
  | 'ask_question' // Needs human input (clarification)
  | 'request_review' // Needs human to review extraction/page
  | 'awaiting_approval' // Needs human approval before action
  | 'report_progress' // Status update with metrics
  | 'completed' // Task finished successfully
  | 'error'; // Something went wrong

// ============================================
// Main Agent Output Interface
// ============================================

export interface AgentOutput<T extends AgentOutputType = AgentOutputType> {
  type: T;
  sessionId: string;
  timestamp: Date;
  payload: AgentPayloadMap[T];
}

// Type-safe payload mapping
export interface AgentPayloadMap {
  processing: ProcessingPayload;
  tool_call: ToolCallPayload;
  ask_question: AskQuestionPayload;
  request_review: RequestReviewPayload;
  awaiting_approval: AwaitingApprovalPayload;
  report_progress: ReportProgressPayload;
  completed: CompletedPayload;
  error: ErrorPayload;
}

// Union type for runtime
export type AgentPayload =
  | ProcessingPayload
  | ToolCallPayload
  | AskQuestionPayload
  | RequestReviewPayload
  | AwaitingApprovalPayload
  | ReportProgressPayload
  | CompletedPayload
  | ErrorPayload;

// ============================================
// Payload Definitions
// ============================================

export interface ProcessingPayload {
  thought: string;
  currentStep: string;
  estimatedRemaining?: number; // pages or items
}

export interface ToolCallPayload {
  tool: string;
  args: Record<string, unknown>;
  reasoning: string;
}

export interface AskQuestionPayload {
  question: string;
  context: string;
  options?: string[]; // Optional predefined choices
  inputType: 'text' | 'choice' | 'confirmation';
  pageRef?: number; // If question relates to specific page
  extractionRef?: string; // If relates to specific extraction
  defaultValue?: string; // Suggested default
}

export interface RequestReviewPayload {
  pageNumber: number;
  items: ReviewItem[];
  urgency: 'low' | 'medium' | 'high';
  reasoning: string;
  autoAdvanceAfter?: number; // ms, for YOLO mode
}

export interface ReviewItem {
  id: string;
  type: 'table' | 'text' | 'figure' | 'signature' | 'form_field';
  bbox?: BoundingBox;
  currentValue: unknown;
  suggestedValue?: unknown;
  confidence: number;
  issue?: string;
}

export interface AwaitingApprovalPayload {
  action: ProposedAction;
  reasoning: string;
  impact: 'low' | 'medium' | 'high';
  timeout?: number; // Auto-approve after N ms in YOLO mode
}

export interface ProposedAction {
  type: 'edit' | 'approve_page' | 'reject_page' | 'export' | 'delete';
  target: {
    page?: number;
    extractionId?: string;
    workspaceId?: string;
  };
  change: unknown;
}

export interface ReportProgressPayload {
  phase: 'scanning' | 'extracting' | 'reviewing' | 'exporting';
  pagesProcessed: number;
  totalPages: number;
  issuesFound: number;
  tablesExtracted: number;
  pendingReview: number[]; // Page numbers needing review
  todoList: TodoItem[]; // Manus-style checklist
  currentAction?: string;
}

export interface TodoItem {
  step: number;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'blocked' | 'skipped';
  pageRange?: [number, number]; // Optional page range for this step
}

export interface CompletedPayload {
  summary: string;
  outputPath?: string; // e.g., exported Excel file
  stats: ExtractionStats;
  reviewedPages: number[];
  flaggedPages: number[];
  skippedPages: number[];
}

export interface ExtractionStats {
  pagesReviewed: number;
  tablesExtracted: number;
  figuresExtracted: number;
  correctionsApplied: number;
  humanInterventions: number;
  totalDurationMs: number;
}

export interface ErrorPayload {
  message: string;
  code?: string;
  recoverable: boolean;
  suggestedAction?: string;
  pageRef?: number;
  extractionRef?: string;
  stack?: string; // Only in dev mode
}

// ============================================
// Human Response Types
// ============================================

export interface HumanQuestionResponse {
  requestId: string;
  answer: string;
  selectedOption?: number; // If options were provided
}

export interface HumanReviewResponse {
  requestId: string;
  pageNumber: number;
  approved: boolean;
  corrections?: ReviewCorrection[];
  notes?: string;
}

export interface ReviewCorrection {
  itemId: string;
  field: string;
  originalValue: unknown;
  correctedValue: unknown;
}

export interface HumanApprovalResponse {
  requestId: string;
  approved: boolean;
  modifiedAction?: ProposedAction;
  reason?: string;
}

export type HumanResponse =
  | HumanQuestionResponse
  | HumanReviewResponse
  | HumanApprovalResponse;

// ============================================
// Type Guards
// ============================================

export function isProcessingOutput(
  output: AgentOutput,
): output is AgentOutput<'processing'> {
  return output.type === 'processing';
}

export function isToolCallOutput(
  output: AgentOutput,
): output is AgentOutput<'tool_call'> {
  return output.type === 'tool_call';
}

export function isAskQuestionOutput(
  output: AgentOutput,
): output is AgentOutput<'ask_question'> {
  return output.type === 'ask_question';
}

export function isRequestReviewOutput(
  output: AgentOutput,
): output is AgentOutput<'request_review'> {
  return output.type === 'request_review';
}

export function isAwaitingApprovalOutput(
  output: AgentOutput,
): output is AgentOutput<'awaiting_approval'> {
  return output.type === 'awaiting_approval';
}

export function isCompletedOutput(
  output: AgentOutput,
): output is AgentOutput<'completed'> {
  return output.type === 'completed';
}

export function isErrorOutput(
  output: AgentOutput,
): output is AgentOutput<'error'> {
  return output.type === 'error';
}

export function isBlockingOutput(output: AgentOutput): boolean {
  return ['ask_question', 'request_review', 'awaiting_approval'].includes(
    output.type,
  );
}

// ============================================
// Parsing Utilities
// ============================================

/**
 * Parse raw agent response into typed AgentOutput
 * Throws if response doesn't match expected format
 */
export function parseAgentOutput(raw: unknown): AgentOutput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Agent output must be an object');
  }

  const obj = raw as Record<string, unknown>;

  if (!obj.type || typeof obj.type !== 'string') {
    throw new Error('Agent output must have a type field');
  }

  const validTypes: AgentOutputType[] = [
    'processing',
    'tool_call',
    'ask_question',
    'request_review',
    'awaiting_approval',
    'report_progress',
    'completed',
    'error',
  ];

  if (!validTypes.includes(obj.type as AgentOutputType)) {
    throw new Error(`Invalid agent output type: ${obj.type}`);
  }

  if (!obj.payload || typeof obj.payload !== 'object') {
    throw new Error('Agent output must have a payload field');
  }

  return {
    type: obj.type as AgentOutputType,
    sessionId: (obj.sessionId as string) || '',
    timestamp: obj.timestamp ? new Date(obj.timestamp as string) : new Date(),
    payload: obj.payload as AgentPayload,
  };
}

/**
 * Extract JSON from agent response that may contain markdown code blocks
 */
export function extractJsonFromResponse(text: string): unknown {
  // Try to find JSON in code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim());
  }

  // Try to parse entire response as JSON
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }

  throw new Error('No valid JSON found in agent response');
}
