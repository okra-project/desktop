import type {
  AgentSession,
  AgentSessionConfig,
  AgentState,
  AgentSnapshot,
} from '../../shared/types/agent-session';
import {
  createInitialSession,
  transitionState,
  createSnapshot,
} from '../../shared/types/agent-session';
import type { AgentEvent } from '../../shared/types/agent-events';
import { createAgentEvent } from '../../shared/types/agent-events';
import type {
  AgentOutput,
  TodoItem,
  AskQuestionPayload,
  RequestReviewPayload,
  AwaitingApprovalPayload,
} from '../../shared/types/agent-output';

export class VerifyModeSession {
  private session: AgentSession;
  private events: AgentEvent[] = [];
  private listeners: Set<(event: AgentEvent) => void> = new Set();

  constructor(config: AgentSessionConfig) {
    this.session = createInitialSession(config);
  }

  get id(): string {
    return this.session.id;
  }

  get state(): AgentState {
    return this.session.state;
  }

  get data(): AgentSession {
    return { ...this.session };
  }

  start(): void {
    this.session = transitionState(this.session, 'running');
    this.pushEvent('session_started', {
      workspaceId: this.session.workspaceId,
      objective: this.session.objective,
      totalPages: this.session.metrics.totalPages,
      permissionLevel: this.session.config.permissionLevel,
    });
  }

  pause(): void {
    this.session = transitionState(this.session, 'paused');
    this.pushEvent('session_paused', {});
  }

  resume(): void {
    this.session = transitionState(this.session, 'running');
    this.pushEvent('session_resumed', {});
  }

  complete(): void {
    this.session = transitionState(this.session, 'completed');
    this.session.metrics.completedAt = new Date();
    this.pushEvent('session_completed', {
      stats: this.session.metrics,
    });
  }

  setError(message: string, recoverable: boolean): void {
    this.session = transitionState(this.session, 'error');
    this.session.errorMessage = message;
    this.session.errorRecoverable = recoverable;
    this.pushEvent('session_error', { message, recoverable });
  }

  handleAgentOutput(output: AgentOutput): void {
    this.pushEvent('agent_output', output);

    switch (output.type) {
      case 'ask_question':
        this.session = transitionState(this.session, 'awaiting_human_input');
        this.session.pendingHumanInput = {
          type: 'question',
          requestId: `req_${Date.now()}`,
          payload: output.payload as AskQuestionPayload,
          requestedAt: new Date(),
        };
        break;

      case 'request_review':
        this.session = transitionState(this.session, 'awaiting_page_review');
        const reviewPayload = output.payload as RequestReviewPayload;
        this.session.pendingHumanInput = {
          type: 'review',
          requestId: `req_${Date.now()}`,
          payload: reviewPayload,
          requestedAt: new Date(),
        };
        if (
          !this.session.pagesNeedingReview.includes(reviewPayload.pageNumber)
        ) {
          this.session.pagesNeedingReview.push(reviewPayload.pageNumber);
        }
        break;

      case 'awaiting_approval':
        this.session = transitionState(this.session, 'awaiting_approval');
        this.session.pendingHumanInput = {
          type: 'approval',
          requestId: `req_${Date.now()}`,
          payload: output.payload as AwaitingApprovalPayload,
          requestedAt: new Date(),
        };
        break;

      case 'report_progress':
        const progressPayload = output.payload as {
          pagesProcessed: number;
          tablesExtracted: number;
          issuesFound: number;
          todoList?: TodoItem[];
        };
        this.session.metrics.pagesScanned = progressPayload.pagesProcessed;
        this.session.metrics.tablesFound = progressPayload.tablesExtracted;
        this.session.metrics.issuesFound = progressPayload.issuesFound;
        if (progressPayload.todoList) {
          this.session.todoList = progressPayload.todoList;
        }
        break;

      case 'completed':
        this.complete();
        break;

      case 'error':
        const errorPayload = output.payload as {
          message: string;
          recoverable: boolean;
        };
        this.setError(errorPayload.message, errorPayload.recoverable);
        break;
    }

    this.session.metrics.lastActivityAt = new Date();
  }

  handleHumanResponse(
    responseType: 'question' | 'review' | 'approval',
    response: unknown,
  ): void {
    this.pushEvent('human_response', {
      requestId: this.session.pendingHumanInput?.requestId,
      responseType,
      content: response,
    });

    if (responseType === 'review') {
      const reviewResponse = response as {
        pageNumber: number;
        approved: boolean;
      };
      if (reviewResponse.approved) {
        if (!this.session.pagesApproved.includes(reviewResponse.pageNumber)) {
          this.session.pagesApproved.push(reviewResponse.pageNumber);
        }
        const idx = this.session.pagesNeedingReview.indexOf(
          reviewResponse.pageNumber,
        );
        if (idx > -1) {
          this.session.pagesNeedingReview.splice(idx, 1);
        }
      }
      this.session.metrics.humanInterventions++;
    }

    this.session.pendingHumanInput = undefined;
    this.session = transitionState(this.session, 'running');
  }

  navigateToPage(pageNumber: number): void {
    const previousPage = this.session.currentPageIndex;
    this.session.currentPageIndex = pageNumber;
    this.pushEvent('page_navigated', { pageNumber, previousPage });
  }

  recordToolCall(toolName: string, args: Record<string, unknown>): void {
    this.pushEvent('tool_call', { toolName, args });
  }

  recordToolResult(
    toolCallId: string,
    success: boolean,
    result?: unknown,
    error?: string,
  ): void {
    this.pushEvent('tool_result', { toolCallId, success, result, error });
  }

  takeSnapshot(): AgentSnapshot {
    const snapshot = createSnapshot(this.session);
    this.session.snapshots.push(snapshot);
    return snapshot;
  }

  getEvents(): AgentEvent[] {
    return [...this.events];
  }

  getEventsSince(index: number): AgentEvent[] {
    return this.events.slice(index);
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private pushEvent(type: AgentEvent['type'], payload: unknown): void {
    const event = createAgentEvent(this.session.id, type, payload);
    this.events.push(event);
    this.session.eventCount = this.events.length;
    this.session.lastEventId = event.id;

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[VerifyModeSession] Listener error:', err);
      }
    }
  }
}

const sessions = new Map<string, VerifyModeSession>();

export function createVerifySession(
  config: AgentSessionConfig,
): VerifyModeSession {
  const session = new VerifyModeSession(config);
  sessions.set(session.id, session);
  return session;
}

export function getVerifySession(
  sessionId: string,
): VerifyModeSession | undefined {
  return sessions.get(sessionId);
}

export function removeVerifySession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function listVerifySessions(): string[] {
  return Array.from(sessions.keys());
}
