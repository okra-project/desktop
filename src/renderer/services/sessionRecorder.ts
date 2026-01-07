/**
 * Session Recorder - rrweb Integration
 *
 * Records DOM mutations and user interactions for
 * session replay and debugging.
 */

import { record, EventType } from 'rrweb';
import type { eventWithTime, recordOptions } from 'rrweb/typings/types';

// ============================================
// Types
// ============================================

interface RecorderState {
  sessionId: string;
  events: eventWithTime[];
  stopFn: (() => void) | null;
  isRecording: boolean;
  startTime: number;
}

interface AgentEventPayload {
  type: string;
  [key: string]: unknown;
}

// ============================================
// Recorder State
// ============================================

let recorder: RecorderState | null = null;

// ============================================
// Recording Functions
// ============================================

/**
 * Start recording a session
 */
export function startRecording(sessionId: string): RecorderState {
  // Stop any existing recording
  if (recorder?.isRecording) {
    stopRecording();
  }

  recorder = {
    sessionId,
    events: [],
    stopFn: null,
    isRecording: false,
    startTime: Date.now(),
  };

  const recordOptions: Partial<recordOptions<eventWithTime>> = {
    emit(event) {
      if (!recorder) return;

      recorder.events.push(event);

      // Stream to main process for persistence
      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.sendMessage('verification:rrweb-event', {
          sessionId: recorder.sessionId,
          event,
        });
      }
    },
    // Performance optimizations
    recordCanvas: false,
    collectFonts: false,
    inlineStylesheet: true,
    // Privacy settings
    maskAllInputs: false,
    maskInputOptions: {
      password: true,
    },
    // Sampling for performance
    sampling: {
      mousemove: true,
      mouseInteraction: true,
      scroll: 150, // Sample every 150ms
      media: 800,
      input: 'last',
    },
    // Only record verification-related elements if possible
    // (This would need custom implementation for scoped recording)
  };

  try {
    recorder.stopFn = record(recordOptions);
    recorder.isRecording = true;

    console.log('[SessionRecorder] Recording started for session:', sessionId);

    return recorder;
  } catch (error) {
    console.error('[SessionRecorder] Failed to start recording:', error);
    recorder = null;
    throw error;
  }
}

/**
 * Stop recording and return events
 */
export function stopRecording(): eventWithTime[] {
  if (!recorder) {
    console.warn('[SessionRecorder] No active recording');
    return [];
  }

  if (recorder.stopFn) {
    recorder.stopFn();
  }

  const events = recorder.events;
  const sessionId = recorder.sessionId;

  recorder.isRecording = false;
  recorder = null;

  console.log(
    `[SessionRecorder] Recording stopped for session: ${sessionId}, ` +
    `captured ${events.length} events`
  );

  return events;
}

/**
 * Check if recording is active
 */
export function isRecording(): boolean {
  return recorder?.isRecording || false;
}

/**
 * Get current recording session ID
 */
export function getCurrentSessionId(): string | null {
  return recorder?.sessionId || null;
}

/**
 * Get current event count
 */
export function getEventCount(): number {
  return recorder?.events.length || 0;
}

/**
 * Get recording duration in ms
 */
export function getRecordingDuration(): number {
  if (!recorder) return 0;
  return Date.now() - recorder.startTime;
}

// ============================================
// Agent Event Injection
// ============================================

/**
 * Inject a custom agent event into the rrweb stream
 * These events appear as markers in the replay timeline
 */
export function injectAgentEvent(type: string, payload: Omit<AgentEventPayload, 'type'>): void {
  if (!recorder || !recorder.isRecording) {
    console.warn('[SessionRecorder] Cannot inject event: not recording');
    return;
  }

  const customEvent: eventWithTime = {
    type: EventType.Custom,
    timestamp: Date.now(),
    data: {
      tag: 'agent',
      payload: { type, ...payload },
    },
  };

  recorder.events.push(customEvent);

  // Stream to main process
  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.sendMessage('verification:rrweb-event', {
      sessionId: recorder.sessionId,
      event: customEvent,
    });
  }
}

// ============================================
// Convenience Event Injectors
// ============================================

/**
 * Mark agent thinking in the stream
 */
export function markAgentThinking(text: string): void {
  injectAgentEvent('AGENT_THINKING', { text });
}

/**
 * Mark a tool call in the stream
 */
export function markToolCall(tool: string, params: Record<string, unknown>): void {
  injectAgentEvent('TOOL_CALL', { tool, params });
}

/**
 * Mark a tool result in the stream
 */
export function markToolResult(tool: string, success: boolean, result?: unknown): void {
  injectAgentEvent('TOOL_RESULT', { tool, success, result });
}

/**
 * Mark ghost overlay shown
 */
export function markGhostShown(
  field: string,
  proposedValue: unknown,
  confidence?: number
): void {
  injectAgentEvent('GHOST_SHOWN', { field, proposedValue, confidence });
}

/**
 * Mark ghost overlay hidden
 */
export function markGhostHidden(): void {
  injectAgentEvent('GHOST_HIDDEN', {});
}

/**
 * Mark permission request
 */
export function markPermissionRequested(action: string, details?: Record<string, unknown>): void {
  injectAgentEvent('PERMISSION_REQUESTED', { action, ...details });
}

/**
 * Mark user approval
 */
export function markUserApproved(permissionId: string): void {
  injectAgentEvent('USER_APPROVED', { permissionId });
}

/**
 * Mark user rejection
 */
export function markUserRejected(permissionId: string, reason?: string): void {
  injectAgentEvent('USER_REJECTED', { permissionId, reason });
}

/**
 * Mark page navigation
 */
export function markPageNavigation(fromPage: number, toPage: number): void {
  injectAgentEvent('PAGE_NAVIGATION', { fromPage, toPage });
}

/**
 * Mark extraction edit
 */
export function markExtractionEdit(
  extractionId: string,
  field: string,
  oldValue: unknown,
  newValue: unknown
): void {
  injectAgentEvent('EXTRACTION_EDIT', { extractionId, field, oldValue, newValue });
}

/**
 * Mark page status change
 */
export function markPageStatusChange(pageNumber: number, status: string): void {
  injectAgentEvent('PAGE_STATUS_CHANGE', { pageNumber, status });
}

/**
 * Mark session milestone
 */
export function markMilestone(name: string, details?: Record<string, unknown>): void {
  injectAgentEvent('MILESTONE', { name, ...details });
}

// ============================================
// Event Extraction
// ============================================

/**
 * Extract agent events from the event stream
 */
export function extractAgentEvents(events: eventWithTime[]): Array<{
  time: number;
  type: string;
  payload: AgentEventPayload;
}> {
  const firstTimestamp = events[0]?.timestamp || 0;

  return events
    .filter(
      (e): e is eventWithTime & { data: { tag: 'agent'; payload: AgentEventPayload } } =>
        e.type === EventType.Custom && e.data?.tag === 'agent'
    )
    .map((e) => ({
      time: e.timestamp - firstTimestamp,
      type: e.data.payload.type,
      payload: e.data.payload,
    }));
}

/**
 * Get recording stats
 */
export function getRecordingStats(): {
  isRecording: boolean;
  sessionId: string | null;
  eventCount: number;
  durationMs: number;
  agentEventCount: number;
} {
  if (!recorder) {
    return {
      isRecording: false,
      sessionId: null,
      eventCount: 0,
      durationMs: 0,
      agentEventCount: 0,
    };
  }

  const agentEvents = extractAgentEvents(recorder.events);

  return {
    isRecording: recorder.isRecording,
    sessionId: recorder.sessionId,
    eventCount: recorder.events.length,
    durationMs: Date.now() - recorder.startTime,
    agentEventCount: agentEvents.length,
  };
}
