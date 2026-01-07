/**
 * Desktop Agent Verification System - Core Types
 *
 * Based on OpenHands action-observation runtime pattern and
 * Manus-style session replay architecture.
 */

// ============================================
// Base Event Types (OpenHands Pattern)
// ============================================

export interface BaseEvent {
  id: string;
  timestamp: Date;
  sessionId: string;
}

// ============================================
// Action Types - What the agent wants to do
// ============================================

export type ActionType =
  | 'navigate'           // Go to page
  | 'query_extractions'  // Read extraction data
  | 'edit_extraction'    // Modify a field
  | 'approve_page'       // Mark page verified
  | 'reject_page'        // Mark page rejected
  | 'add_annotation'     // Add visual annotation
  | 'request_human'      // Escalate to human
  | 'think';             // Internal reasoning (logged)

export interface Action extends BaseEvent {
  kind: 'action';
  type: ActionType;
  payload: ActionPayload;
  agentState?: string;  // Hash of agent's internal state for replay
}

export type ActionPayload =
  | NavigatePayload
  | QueryExtractionsPayload
  | EditExtractionPayload
  | ApprovePagePayload
  | RejectPagePayload
  | AddAnnotationPayload
  | RequestHumanPayload
  | ThinkPayload;

export interface NavigatePayload {
  pageNumber: number;
}

export interface QueryExtractionsPayload {
  pageNumber?: number;
  query?: string;
  filters?: ExtractionFilter;
}

export interface EditExtractionPayload {
  extractionId: string;
  field: string;
  newValue: unknown;
  reasoning: string;
  reference?: Reference;
}

export interface ApprovePagePayload {
  pageNumber: number;
  confidence: number;
  notes?: string;
}

export interface RejectPagePayload {
  pageNumber: number;
  reason: string;
}

export interface AddAnnotationPayload {
  pageNumber: number;
  boundingBox: BoundingBox;
  content: string;
  annotationType: 'correction' | 'note' | 'highlight';
}

export interface RequestHumanPayload {
  pageNumber: number;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface ThinkPayload {
  thought: string;
}

// ============================================
// Observation Types - What the agent sees
// ============================================

export type ObservationType =
  | 'page_content'       // Result of navigate
  | 'extraction_data'    // Result of query
  | 'edit_result'        // Confirm edit applied
  | 'status_result'      // Confirm status change
  | 'human_response'     // User input received
  | 'permission_denied'; // Action blocked by permission

export interface Observation extends BaseEvent {
  kind: 'observation';
  type: ObservationType;
  payload: ObservationPayload;
  actionId: string;  // Link to triggering action
  success: boolean;
  error?: string;
}

export type ObservationPayload =
  | PageContentPayload
  | ExtractionDataPayload
  | EditResultPayload
  | StatusResultPayload
  | HumanResponsePayload
  | PermissionDeniedPayload;

export interface PageContentPayload {
  pageNumber: number;
  extractionCount: number;
  thumbnail?: string;  // Base64 or path
}

export interface ExtractionDataPayload {
  extractions: Extraction[];
  totalCount: number;
}

export interface EditResultPayload {
  extractionId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface StatusResultPayload {
  pageNumber: number;
  status: PageStatus;
}

export interface HumanResponsePayload {
  response: string;
  action: 'approved' | 'rejected' | 'modified';
  modifiedValue?: unknown;
}

export interface PermissionDeniedPayload {
  actionType: ActionType;
  reason: string;
}

// ============================================
// Event Union Type
// ============================================

export type VerificationEvent = Action | Observation;

// ============================================
// Session Types
// ============================================

export type PermissionLevel = 'yolo' | 'page' | 'edit';

export type SessionStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export type AgentType = 'claude-code' | 'openai' | 'anthropic-direct' | 'custom';

export interface VerificationSession {
  id: string;
  documentId: string;
  documentName: string;
  startedAt: Date;
  completedAt?: Date;
  status: SessionStatus;
  permissionLevel: PermissionLevel;

  // Agent configuration
  agentType: AgentType;

  // Session state
  currentPageIndex: number;
  totalPages: number;

  // Event stream (like Manus)
  events: VerificationEvent[];

  // Results
  pageStates: Record<number, PageVerificationState>;

  // rrweb recording reference
  recordingPath?: string;
}

export interface SessionConfig {
  documentId: string;
  documentName: string;
  totalPages: number;
  permissionLevel: PermissionLevel;
  agentType: AgentType;
}

// ============================================
// Page Verification State
// ============================================

export type PageStatus =
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'needs_correction';

export interface PageVerificationState {
  pageNumber: number;
  status: PageStatus;

  // Extractions on this page
  extractions: Extraction[];

  // Agent's assessment
  agentAssessment?: AgentAssessment;

  // Audit trail
  reviewHistory: ReviewAction[];

  // Merge status
  committedAt?: Date;
  mergedToSource: boolean;
}

export interface AgentAssessment {
  confidence: number;  // 0-1
  reasoning: string;
  suggestedCorrections: Correction[];
  references: Reference[];
}

export interface ReviewAction {
  id: string;
  timestamp: Date;
  action: 'viewed' | 'edited' | 'approved' | 'rejected' | 'flagged';
  actor: 'agent' | 'user';
  details?: string;
}

// ============================================
// Extraction Types
// ============================================

export type ExtractionType = 'table' | 'text' | 'entity' | 'metadata';

export type ExtractionStatus = 'unverified' | 'verified' | 'corrected' | 'rejected';

export interface Extraction {
  id: string;
  type: ExtractionType;
  boundingBox: BoundingBox;
  originalValue: unknown;
  currentValue: unknown;
  linkedEntities: string[];  // IDs of related extractions
  status: ExtractionStatus;
  pageNumber: number;
  fieldName?: string;
}

export interface ExtractionFilter {
  types?: ExtractionType[];
  statuses?: ExtractionStatus[];
  pageNumbers?: number[];
  searchQuery?: string;
}

export interface Correction {
  id: string;
  extractionId: string;
  field: string;
  originalValue: unknown;
  suggestedValue: unknown;
  reasoning: string;
  source?: Reference;
  appliedAt?: Date;
  appliedBy?: 'agent' | 'user';
}

// ============================================
// Reference Types
// ============================================

export type ReferenceType = 'page_content' | 'cross_reference' | 'external' | 'calculation';

export interface Reference {
  type: ReferenceType;
  location: string;
  content: string;
  pageNumber?: number;
}

// ============================================
// Permission Types
// ============================================

export type PermissionStatus = 'pending' | 'approved' | 'denied';

export interface PermissionRequest {
  id: string;
  sessionId: string;
  timestamp: Date;
  action: AgentAction;
  context: PermissionContext;
  status: PermissionStatus;
  respondedAt?: Date;
  respondedBy?: 'user' | 'auto';  // 'auto' for YOLO mode
}

export interface PermissionContext {
  pageNumber: number;
  extraction?: Extraction;
  reasoning: string;
}

export interface PermissionResponse {
  requestId: string;
  approved: boolean;
  modifiedAction?: AgentAction;
  userComment?: string;
}

// Agent actions that may require permission
export type AgentAction =
  // Level 3: Edit-level (most restrictive)
  | { type: 'edit_extraction'; extractionId: string; field: string; newValue: unknown }
  | { type: 'link_entities'; sourceId: string; targetId: string }
  | { type: 'add_annotation'; pageNumber: number; annotation: Annotation }

  // Level 2: Page-level
  | { type: 'approve_page'; pageNumber: number }
  | { type: 'reject_page'; pageNumber: number; reason: string }
  | { type: 'mark_needs_review'; pageNumber: number }

  // Level 1: Query-level (always allowed)
  | { type: 'navigate_to_page'; pageNumber: number }
  | { type: 'filter_extractions'; query: string }
  | { type: 'search_content'; query: string };

// ============================================
// Visual Types
// ============================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  pageNumber?: number;
}

export interface Annotation {
  id: string;
  type: 'correction' | 'note' | 'highlight';
  boundingBox: BoundingBox;
  content: string;
  createdAt: Date;
  createdBy: 'agent' | 'user';
}

// ============================================
// Ghost Overlay Types (Manus-style)
// ============================================

export type GhostType =
  | 'field_correction'   // Agent wants to change a value
  | 'status_change'      // Agent wants to approve/reject page
  | 'annotation'         // Agent wants to add a note
  | 'navigation'         // Agent is moving to a page
  | 'thinking';          // Agent is analyzing

export interface GhostOverlay {
  id: string;
  type: GhostType;
  pageNumber: number;
  timestamp: Date;
  autoCommitDelay?: number;  // ms, only in YOLO mode

  // Visual positioning
  boundingBox?: BoundingBox;
  anchorElement?: string;  // CSS selector

  // Content
  content: GhostContent;
}

export interface GhostContent {
  // For field_correction
  fieldName?: string;
  currentValue?: unknown;
  proposedValue?: unknown;

  // For status_change
  proposedStatus?: PageStatus;

  // Common
  reasoning: string;
  confidence?: number;
}

// ============================================
// Replay Types
// ============================================

export interface ReplayState {
  currentIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;  // 0.5x, 1x, 2x
}

export interface ReplayController {
  session: VerificationSession;
  currentEventIndex: number;
  playbackSpeed: number;
  isPlaying: boolean;
}

// ============================================
// Draft Layer Types (for uncommitted changes)
// ============================================

export interface PageDraft {
  pageNumber: number;
  extractionEdits: Record<string, ExtractionEdit>;
  annotations: Annotation[];
  proposedStatus?: PageStatus;
  modifiedAt: Date;
}

export interface ExtractionEdit {
  extractionId: string;
  field: string;
  originalValue: unknown;
  draftValue: unknown;
  reasoning?: string;
}

// ============================================
// Agent Provider Configuration (BYOA)
// ============================================

export interface AgentProviderConfig {
  type: AgentType;

  // For Claude Code CLI integration
  claudeCodeConfig?: {
    useCLI: boolean;
    configPath?: string;  // ~/.claude.json
  };

  // For direct API
  apiConfig?: {
    apiKey: string;
    baseUrl?: string;
    model: string;
  };

  // For custom/OpenAI
  customConfig?: {
    endpoint: string;
    headers: Record<string, string>;
    requestFormat: 'openai' | 'anthropic' | 'custom';
  };
}

// ============================================
// IPC Channel Types
// ============================================

export type VerificationChannel =
  // Session management
  | 'verification:start-session'
  | 'verification:pause-session'
  | 'verification:resume-session'
  | 'verification:end-session'
  | 'verification:get-session'

  // Agent -> UI (tool calls)
  | 'verification:tool-call'
  | 'verification:tool-result'

  // Permission flow
  | 'verification:permission-request'
  | 'verification:permission-response'

  // UI updates (for real-time observation)
  | 'verification:event'
  | 'verification:page-state-updated'
  | 'verification:extraction-updated'

  // Session capture
  | 'verification:capture-screenshot'
  | 'verification:replay-event'
  | 'verification:rrweb-event';

// ============================================
// Tool Definitions
// ============================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  permissionLevel: 'none' | 'page' | 'edit' | 'explicit';
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  default?: unknown;
}

// Verification tools exposed to the agent
export const VERIFICATION_TOOLS: Record<string, ToolDefinition> = {
  navigate_to_page: {
    name: 'navigate_to_page',
    description: 'Navigate the PDF viewer to a specific page',
    parameters: { pageNumber: { type: 'number', required: true } },
    permissionLevel: 'none',
  },
  get_page_extractions: {
    name: 'get_page_extractions',
    description: 'Get all extractions for a specific page',
    parameters: { pageNumber: { type: 'number', required: true } },
    permissionLevel: 'none',
  },
  search_document: {
    name: 'search_document',
    description: 'Search for text or entities across the document',
    parameters: {
      query: { type: 'string', required: true },
      filters: { type: 'object', required: false },
    },
    permissionLevel: 'none',
  },
  get_extraction_details: {
    name: 'get_extraction_details',
    description: 'Get detailed information about a specific extraction',
    parameters: { extractionId: { type: 'string', required: true } },
    permissionLevel: 'none',
  },
  approve_page: {
    name: 'approve_page',
    description: 'Mark a page as verified/approved',
    parameters: {
      pageNumber: { type: 'number', required: true },
      confidence: { type: 'number', required: true },
      notes: { type: 'string', required: false },
    },
    permissionLevel: 'page',
  },
  reject_page: {
    name: 'reject_page',
    description: 'Mark a page as rejected with reason',
    parameters: {
      pageNumber: { type: 'number', required: true },
      reason: { type: 'string', required: true },
    },
    permissionLevel: 'page',
  },
  flag_for_review: {
    name: 'flag_for_review',
    description: 'Flag a page for human review',
    parameters: {
      pageNumber: { type: 'number', required: true },
      issues: { type: 'array', required: true },
    },
    permissionLevel: 'page',
  },
  correct_extraction: {
    name: 'correct_extraction',
    description: 'Correct a value in an extraction',
    parameters: {
      extractionId: { type: 'string', required: true },
      field: { type: 'string', required: true },
      newValue: { type: 'string', required: true },
      reasoning: { type: 'string', required: true },
      reference: { type: 'object', required: false },
    },
    permissionLevel: 'edit',
  },
  link_extractions: {
    name: 'link_extractions',
    description: 'Link two related extractions (e.g., table to entity)',
    parameters: {
      sourceId: { type: 'string', required: true },
      targetId: { type: 'string', required: true },
      relationship: { type: 'string', required: true },
    },
    permissionLevel: 'edit',
  },
  add_annotation: {
    name: 'add_annotation',
    description: 'Add an annotation to a page region',
    parameters: {
      pageNumber: { type: 'number', required: true },
      boundingBox: { type: 'object', required: true },
      content: { type: 'string', required: true },
      type: { type: 'string', required: true },
    },
    permissionLevel: 'edit',
  },
  commit_page: {
    name: 'commit_page',
    description: 'Commit approved page changes to the database',
    parameters: { pageNumber: { type: 'number', required: true } },
    permissionLevel: 'explicit',  // Always asks
  },
};

// ============================================
// Utility Functions
// ============================================

/**
 * Check if an action requires permission based on permission level
 */
export function requiresPermission(
  actionType: AgentAction['type'],
  level: PermissionLevel
): boolean {
  if (level === 'yolo') return false;

  const pageActions = [
    'approve_page',
    'reject_page',
    'mark_needs_review',
  ];

  const editActions = [
    'edit_extraction',
    'link_entities',
    'add_annotation',
  ];

  if (level === 'page') {
    return [...pageActions, ...editActions].includes(actionType);
  }

  if (level === 'edit') {
    return editActions.includes(actionType);
  }

  return false;
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
