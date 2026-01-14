/**
 * Agent Event Types for Replay - UI-TARS / OpenHands pattern
 */

export type AgentEventType =
  | 'session_started'
  | 'session_paused'
  | 'session_resumed'
  | 'session_completed'
  | 'session_error'
  | 'agent_thinking'
  | 'agent_output'
  | 'tool_call'
  | 'tool_result'
  | 'human_input_requested'
  | 'human_response'
  | 'state_transition'
  | 'page_navigated'
  | 'extraction_updated'
  | 'progress_updated';

export interface AgentEvent {
  id: string;
  sessionId: string;
  timestamp: Date;
  type: AgentEventType;
  payload: unknown;
  replayable: boolean;
}

export interface SessionStartedEvent extends AgentEvent {
  type: 'session_started';
  payload: {
    workspaceId: string;
    objective: string;
    totalPages: number;
    permissionLevel: string;
  };
}

export interface AgentThinkingEvent extends AgentEvent {
  type: 'agent_thinking';
  payload: {
    thought: string;
    step?: string;
  };
}

export interface ToolCallEvent extends AgentEvent {
  type: 'tool_call';
  payload: {
    toolName: string;
    args: Record<string, unknown>;
    reasoning?: string;
  };
}

export interface ToolResultEvent extends AgentEvent {
  type: 'tool_result';
  payload: {
    toolCallId: string;
    success: boolean;
    result?: unknown;
    error?: string;
  };
}

export interface HumanInputRequestedEvent extends AgentEvent {
  type: 'human_input_requested';
  payload: {
    requestType: 'question' | 'review' | 'approval';
    requestId: string;
    content: unknown;
  };
}

export interface HumanResponseEvent extends AgentEvent {
  type: 'human_response';
  payload: {
    requestId: string;
    responseType: 'question' | 'review' | 'approval';
    content: unknown;
  };
}

export interface StateTransitionEvent extends AgentEvent {
  type: 'state_transition';
  payload: {
    from: string;
    to: string;
    reason?: string;
  };
}

export interface PageNavigatedEvent extends AgentEvent {
  type: 'page_navigated';
  payload: {
    pageNumber: number;
    previousPage?: number;
  };
}

export interface ProgressUpdatedEvent extends AgentEvent {
  type: 'progress_updated';
  payload: {
    pagesProcessed: number;
    totalPages: number;
    tablesFound: number;
    issuesFound: number;
    pendingReview: number[];
  };
}

export function createAgentEvent(
  sessionId: string,
  type: AgentEventType,
  payload: unknown,
  replayable = true,
): AgentEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sessionId,
    timestamp: new Date(),
    type,
    payload,
    replayable,
  };
}

export function serializeEvent(event: AgentEvent): string {
  return JSON.stringify({
    ...event,
    timestamp: event.timestamp.toISOString(),
  });
}

export function deserializeEvent(json: string): AgentEvent {
  const data = JSON.parse(json);
  return {
    ...data,
    timestamp: new Date(data.timestamp),
  };
}
