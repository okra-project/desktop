/**
 * EventStream - Action-Observation Runtime
 *
 * Following OpenHands' event-sourced architecture pattern.
 * Provides an append-only log of agent actions and observations
 * with full replay capabilities.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  VerificationEvent,
  Action,
  Observation,
  ActionType,
  ObservationType,
  ActionPayload,
  ObservationPayload,
} from '../../shared/types/verification';

// ============================================
// EventStream Class
// ============================================

export class EventStream {
  private events: VerificationEvent[] = [];
  private sessionId: string;
  private listeners: Set<(event: VerificationEvent) => void> = new Set();

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  // ==========================================
  // Core Operations
  // ==========================================

  /**
   * Append a new event to the stream
   */
  push(event: VerificationEvent): void {
    this.events.push(event);

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[EventStream] Listener error:', error);
      }
    }
  }

  /**
   * Create and append an action
   */
  pushAction(
    type: ActionType,
    payload: ActionPayload,
    agentState?: string
  ): Action {
    const action: Action = {
      id: uuidv4(),
      timestamp: new Date(),
      sessionId: this.sessionId,
      kind: 'action',
      type,
      payload,
      agentState,
    };

    this.push(action);
    return action;
  }

  /**
   * Create and append an observation
   */
  pushObservation(
    type: ObservationType,
    payload: ObservationPayload,
    actionId: string,
    success: boolean,
    error?: string
  ): Observation {
    const observation: Observation = {
      id: uuidv4(),
      timestamp: new Date(),
      sessionId: this.sessionId,
      kind: 'observation',
      type,
      payload,
      actionId,
      success,
      error,
    };

    this.push(observation);
    return observation;
  }

  // ==========================================
  // Query Operations
  // ==========================================

  /**
   * Get all events
   */
  getAll(): VerificationEvent[] {
    return [...this.events];
  }

  /**
   * Get event by ID
   */
  getById(id: string): VerificationEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  /**
   * Get events since a specific index
   */
  getSince(index: number): VerificationEvent[] {
    return this.events.slice(index);
  }

  /**
   * Get events after a specific event ID
   */
  getAfter(eventId: string): VerificationEvent[] {
    const index = this.events.findIndex((e) => e.id === eventId);
    if (index === -1) return [];
    return this.events.slice(index + 1);
  }

  /**
   * Get unprocessed events (actions without observations)
   */
  getUnprocessed(): Action[] {
    const observedActionIds = new Set(
      this.events
        .filter((e): e is Observation => e.kind === 'observation')
        .map((o) => o.actionId)
    );

    return this.events
      .filter((e): e is Action => e.kind === 'action')
      .filter((a) => !observedActionIds.has(a.id));
  }

  /**
   * Get the last N events
   */
  getLast(count: number): VerificationEvent[] {
    return this.events.slice(-count);
  }

  /**
   * Get only actions
   */
  getActions(): Action[] {
    return this.events.filter((e): e is Action => e.kind === 'action');
  }

  /**
   * Get only observations
   */
  getObservations(): Observation[] {
    return this.events.filter((e): e is Observation => e.kind === 'observation');
  }

  /**
   * Get the observation for a specific action
   */
  getObservationForAction(actionId: string): Observation | undefined {
    return this.events.find(
      (e): e is Observation => e.kind === 'observation' && e.actionId === actionId
    );
  }

  /**
   * Get action-observation pairs for replay
   */
  getPairs(): Array<{ action: Action; observation: Observation | undefined }> {
    const actions = this.getActions();
    return actions.map((action) => ({
      action,
      observation: this.getObservationForAction(action.id),
    }));
  }

  // ==========================================
  // Replay Operations
  // ==========================================

  /**
   * Replay events from a specific point
   */
  replayFrom(eventId: string): VerificationEvent[] {
    const index = this.events.findIndex((e) => e.id === eventId);
    if (index === -1) return [];
    return this.events.slice(index);
  }

  /**
   * Get actions for deterministic replay
   * (same actions should produce same observations given same document)
   */
  getActionsForReplay(): Action[] {
    return this.getActions();
  }

  /**
   * Create a new EventStream from a subset of events (for testing/debugging)
   */
  fork(fromIndex: number = 0): EventStream {
    const forked = new EventStream(this.sessionId);
    forked.events = this.events.slice(0, fromIndex);
    return forked;
  }

  // ==========================================
  // Listener Management
  // ==========================================

  /**
   * Subscribe to new events
   */
  subscribe(listener: (event: VerificationEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clear all listeners
   */
  clearListeners(): void {
    this.listeners.clear();
  }

  // ==========================================
  // Serialization
  // ==========================================

  /**
   * Serialize to JSON for persistence
   */
  toJSON(): string {
    return JSON.stringify({
      sessionId: this.sessionId,
      events: this.events.map((e) => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })),
    });
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(json: string): EventStream {
    const data = JSON.parse(json);
    const stream = new EventStream(data.sessionId);
    stream.events = data.events.map((e: any) => ({
      ...e,
      timestamp: new Date(e.timestamp),
    }));
    return stream;
  }

  /**
   * Get event count
   */
  get length(): number {
    return this.events.length;
  }

  /**
   * Clear all events (use with caution!)
   */
  clear(): void {
    this.events = [];
  }
}

// ============================================
// Event Stream Manager
// ============================================

/**
 * Manages multiple event streams (one per session)
 */
export class EventStreamManager {
  private streams: Map<string, EventStream> = new Map();

  /**
   * Get or create an event stream for a session
   */
  getStream(sessionId: string): EventStream {
    let stream = this.streams.get(sessionId);
    if (!stream) {
      stream = new EventStream(sessionId);
      this.streams.set(sessionId, stream);
    }
    return stream;
  }

  /**
   * Check if a stream exists
   */
  hasStream(sessionId: string): boolean {
    return this.streams.has(sessionId);
  }

  /**
   * Remove a stream
   */
  removeStream(sessionId: string): boolean {
    const stream = this.streams.get(sessionId);
    if (stream) {
      stream.clearListeners();
      stream.clear();
    }
    return this.streams.delete(sessionId);
  }

  /**
   * Get all session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.streams.keys());
  }

  /**
   * Clear all streams
   */
  clearAll(): void {
    for (const stream of this.streams.values()) {
      stream.clearListeners();
      stream.clear();
    }
    this.streams.clear();
  }
}

// Global event stream manager
export const eventStreamManager = new EventStreamManager();
