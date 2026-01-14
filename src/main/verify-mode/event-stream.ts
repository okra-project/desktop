/**
 * VerifyEventStreamProcessor - Adapted from UI-TARS/Tarko AgentEventStreamProcessor
 * Handles events, subscribers, filtering for verify mode
 */

import type {
  AgentEvent,
  AgentEventType,
} from '../../shared/types/agent-events';
import { createAgentEvent } from '../../shared/types/agent-events';

export interface EventStreamOptions {
  maxEvents?: number;
  autoTrim?: boolean;
  initialEvents?: AgentEvent[];
}

const DEFAULT_OPTIONS: EventStreamOptions = {
  maxEvents: 1000,
  autoTrim: true,
};

export class VerifyEventStreamProcessor {
  private events: AgentEvent[] = [];
  private options: EventStreamOptions;
  private subscribers: ((event: AgentEvent) => void)[] = [];

  constructor(options: EventStreamOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    if (options.initialEvents?.length) {
      this.events = [...options.initialEvents];
      console.error(
        `[VerifyEventStream] Initialized with ${options.initialEvents.length} events`,
      );
    }
  }

  createEvent(
    sessionId: string,
    type: AgentEventType,
    payload: unknown,
    replayable = true,
  ): AgentEvent {
    return createAgentEvent(sessionId, type, payload, replayable);
  }

  sendEvent(event: AgentEvent): void {
    this.events.push(event);

    for (const callback of this.subscribers) {
      try {
        callback(event);
      } catch (error) {
        console.error('[VerifyEventStream] Subscriber error:', error);
      }
    }

    if (
      this.options.autoTrim &&
      this.options.maxEvents &&
      this.events.length > this.options.maxEvents
    ) {
      const overflow = this.events.length - this.options.maxEvents;
      this.events = this.events.slice(overflow);
    }
  }

  getEvents(filter?: AgentEventType[], limit?: number): AgentEvent[] {
    let events = this.events;

    if (filter?.length) {
      events = events.filter((event) => filter.includes(event.type));
    }

    if (limit && limit > 0 && events.length > limit) {
      events = events.slice(events.length - limit);
    }

    return [...events];
  }

  getEventsByType(types: AgentEventType[], limit?: number): AgentEvent[] {
    return this.getEvents(types, limit);
  }

  getEventsSince(index: number): AgentEvent[] {
    return this.events.slice(index);
  }

  getEventById(id: string): AgentEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  subscribe(callback: (event: AgentEvent) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }

  subscribeToTypes(
    types: AgentEventType[],
    callback: (event: AgentEvent) => void,
  ): () => void {
    const wrappedCallback = (event: AgentEvent) => {
      if (types.includes(event.type)) {
        callback(event);
      }
    };

    this.subscribers.push(wrappedCallback);
    return () => {
      this.subscribers = this.subscribers.filter(
        (cb) => cb !== wrappedCallback,
      );
    };
  }

  get length(): number {
    return this.events.length;
  }

  toJSON(): string {
    return JSON.stringify({
      events: this.events.map((e) => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      })),
    });
  }

  static fromJSON(json: string): VerifyEventStreamProcessor {
    const data = JSON.parse(json);
    const processor = new VerifyEventStreamProcessor({
      initialEvents: data.events.map((e: any) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      })),
    });
    return processor;
  }

  dispose(): void {
    this.events = [];
    this.subscribers = [];
  }
}

const sessionStreams = new Map<string, VerifyEventStreamProcessor>();

export function getEventStream(sessionId: string): VerifyEventStreamProcessor {
  let stream = sessionStreams.get(sessionId);
  if (!stream) {
    stream = new VerifyEventStreamProcessor();
    sessionStreams.set(sessionId, stream);
  }
  return stream;
}

export function removeEventStream(sessionId: string): void {
  const stream = sessionStreams.get(sessionId);
  if (stream) {
    stream.dispose();
    sessionStreams.delete(sessionId);
  }
}

export function clearAllStreams(): void {
  for (const stream of sessionStreams.values()) {
    stream.dispose();
  }
  sessionStreams.clear();
}
