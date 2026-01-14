/**
 * Agent Session Types - State Machine for Extraction Review
 *
 * Manages the lifecycle of an agent session including:
 * - State transitions (running, awaiting input, paused, completed)
 * - Todo list tracking (Manus pattern)
 * - Event stream for replay (UI-TARS/OpenHands pattern)
 */

import type {
  TodoItem,
  AskQuestionPayload,
  RequestReviewPayload,
  AwaitingApprovalPayload,
  ExtractionStats,
} from './agent-output';

export type AgentState =
  | 'idle'
  | 'running'
  | 'awaiting_human_input'
  | 'awaiting_page_review'
  | 'awaiting_approval'
  | 'paused'
  | 'completed'
  | 'error';

export type PermissionLevel = 'yolo' | 'page' | 'edit';

export type AgentProvider =
  | 'claude-code'
  | 'anthropic'
  | 'openrouter'
  | 'custom';

export interface AgentSessionConfig {
  workspaceId: string;
  workspaceName: string;
  totalPages: number;
  objective: string;
  permissionLevel: PermissionLevel;
  provider: AgentProvider;
  confidenceThreshold?: number;
  autoAdvanceDelayMs?: number;
}

export interface PendingHumanInput {
  type: 'question' | 'review' | 'approval';
  requestId: string;
  payload: AskQuestionPayload | RequestReviewPayload | AwaitingApprovalPayload;
  requestedAt: Date;
  timeoutAt?: Date;
}

export interface SessionMetrics {
  pagesScanned: number;
  totalPages: number;
  tablesFound: number;
  figuresFound: number;
  issuesFound: number;
  humanInterventions: number;
  correctionsApplied: number;
  startedAt: Date;
  completedAt?: Date;
  lastActivityAt: Date;
}

export interface AgentSnapshot {
  id: string;
  eventIndex: number;
  state: AgentState;
  todoList: TodoItem[];
  metrics: SessionMetrics;
  currentPageIndex: number;
  timestamp: Date;
}

export interface ReplayState {
  isActive: boolean;
  currentEventIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  startTimestamp?: Date;
  endTimestamp?: Date;
}

export interface AgentSession {
  id: string;
  workspaceId: string;
  workspaceName: string;

  state: AgentState;
  previousState?: AgentState;

  objective: string;
  todoList: TodoItem[];
  currentStepIndex: number;

  config: AgentSessionConfig;

  currentPageIndex: number;
  pagesNeedingReview: number[];
  pagesApproved: number[];
  pagesRejected: number[];

  pendingHumanInput?: PendingHumanInput;

  metrics: SessionMetrics;

  lastEventId: string | null;
  eventCount: number;

  snapshots: AgentSnapshot[];
  replayState?: ReplayState;

  errorMessage?: string;
  errorRecoverable?: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export function createInitialSession(config: AgentSessionConfig): AgentSession {
  const now = new Date();
  return {
    id: generateSessionId(),
    workspaceId: config.workspaceId,
    workspaceName: config.workspaceName,
    state: 'idle',
    objective: config.objective,
    todoList: [],
    currentStepIndex: 0,
    config,
    currentPageIndex: 1,
    pagesNeedingReview: [],
    pagesApproved: [],
    pagesRejected: [],
    metrics: {
      pagesScanned: 0,
      totalPages: config.totalPages,
      tablesFound: 0,
      figuresFound: 0,
      issuesFound: 0,
      humanInterventions: 0,
      correctionsApplied: 0,
      startedAt: now,
      lastActivityAt: now,
    },
    lastEventId: null,
    eventCount: 0,
    snapshots: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function transitionState(
  session: AgentSession,
  newState: AgentState,
): AgentSession {
  if (!isValidTransition(session.state, newState)) {
    throw new Error(
      `Invalid state transition: ${session.state} -> ${newState}`,
    );
  }

  return {
    ...session,
    previousState: session.state,
    state: newState,
    updatedAt: new Date(),
    metrics: {
      ...session.metrics,
      lastActivityAt: new Date(),
    },
  };
}

export function isValidTransition(from: AgentState, to: AgentState): boolean {
  const validTransitions: Record<AgentState, AgentState[]> = {
    idle: ['running'],
    running: [
      'awaiting_human_input',
      'awaiting_page_review',
      'awaiting_approval',
      'paused',
      'completed',
      'error',
    ],
    awaiting_human_input: ['running', 'paused', 'error'],
    awaiting_page_review: ['running', 'paused', 'error'],
    awaiting_approval: ['running', 'paused', 'error'],
    paused: ['running', 'error'],
    completed: ['idle'],
    error: ['idle', 'running'],
  };

  return validTransitions[from]?.includes(to) ?? false;
}

export function isBlockingState(state: AgentState): boolean {
  return [
    'awaiting_human_input',
    'awaiting_page_review',
    'awaiting_approval',
    'paused',
  ].includes(state);
}

export function isTerminalState(state: AgentState): boolean {
  return ['completed', 'error'].includes(state);
}

export function canResume(session: AgentSession): boolean {
  return session.state === 'paused' || session.state === 'error';
}

export function getSessionProgress(session: AgentSession): number {
  if (session.metrics.totalPages === 0) return 0;
  return Math.round(
    (session.metrics.pagesScanned / session.metrics.totalPages) * 100,
  );
}

export function getSessionDuration(session: AgentSession): number {
  const end = session.metrics.completedAt || new Date();
  return end.getTime() - session.metrics.startedAt.getTime();
}

export function createSnapshot(session: AgentSession): AgentSnapshot {
  return {
    id: generateSnapshotId(),
    eventIndex: session.eventCount,
    state: session.state,
    todoList: [...session.todoList],
    metrics: { ...session.metrics },
    currentPageIndex: session.currentPageIndex,
    timestamp: new Date(),
  };
}

function generateSessionId(): string {
  return `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateSnapshotId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export interface SessionSummary {
  id: string;
  workspaceName: string;
  state: AgentState;
  progress: number;
  tablesFound: number;
  issuesFound: number;
  humanInterventions: number;
  duration: number;
  startedAt: Date;
  completedAt?: Date;
}

export function getSessionSummary(session: AgentSession): SessionSummary {
  return {
    id: session.id,
    workspaceName: session.workspaceName,
    state: session.state,
    progress: getSessionProgress(session),
    tablesFound: session.metrics.tablesFound,
    issuesFound: session.metrics.issuesFound,
    humanInterventions: session.metrics.humanInterventions,
    duration: getSessionDuration(session),
    startedAt: session.metrics.startedAt,
    completedAt: session.metrics.completedAt,
  };
}
