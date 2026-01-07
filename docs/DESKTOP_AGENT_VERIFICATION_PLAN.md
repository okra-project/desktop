# Desktop Agent Verification System - Technical Plan

## Vision

A local desktop agent for document verification that runs alongside the user (not in cloud sandbox), with observable and auditable actions (like Manus), integrating with the user's existing AI tools (Claude, ChatGPT, Copilot).

**Why Desktop over Cloud:**
- No sandbox complexity (E2B, etc.)
- No cloud infrastructure needed
- Easy interruptibility (same machine)
- Folder-scoped security (like DYAD)
- Local screenshots for state capture
- Users bring their own AI subscription
- Build trust before offering cloud background agents

---

## Core Architecture

### 0. State Management: Redux Event Store

**Critical for playback** - Redux provides time-travel debugging and event replay:

```typescript
// store/verification/slice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface VerificationState {
  // Active session
  session: VerificationSession | null;

  // Event stream (immutable log for replay)
  events: VerificationEvent[];

  // Draft layer (uncommitted changes)
  drafts: Record<number, PageDraft>;  // pageNumber -> draft

  // Permission state
  pendingPermission: PermissionRequest | null;

  // UI state
  ghostOverlay: GhostOverlay | null;
  replayMode: ReplayState | null;
}

// All agent actions go through Redux actions
// This gives us:
// 1. Full event log for replay
// 2. Time-travel debugging
// 3. Easy serialization to disk
// 4. Undo/redo for free

const verificationSlice = createSlice({
  name: 'verification',
  initialState,
  reducers: {
    // Session lifecycle
    startSession: (state, action: PayloadAction<SessionConfig>) => { ... },
    pauseSession: (state) => { ... },
    resumeSession: (state) => { ... },
    endSession: (state) => { ... },

    // Events (append-only log)
    appendEvent: (state, action: PayloadAction<VerificationEvent>) => {
      state.events.push(action.payload);
    },

    // Draft layer
    applyDraft: (state, action: PayloadAction<DraftAction>) => {
      const { pageNumber, changes } = action.payload;
      state.drafts[pageNumber] = {
        ...state.drafts[pageNumber],
        ...changes
      };
    },
    commitDraft: (state, action: PayloadAction<number>) => {
      const pageNumber = action.payload;
      // Merge draft to committed state
      state.session.pageStates[pageNumber] = mergeDraft(
        state.session.pageStates[pageNumber],
        state.drafts[pageNumber]
      );
      delete state.drafts[pageNumber];
    },
    discardDraft: (state, action: PayloadAction<number>) => {
      delete state.drafts[action.payload];
    },

    // Ghost overlay
    showGhost: (state, action: PayloadAction<GhostOverlay>) => {
      state.ghostOverlay = action.payload;
    },
    hideGhost: (state) => {
      state.ghostOverlay = null;
    },

    // Permission flow
    requestPermission: (state, action: PayloadAction<PermissionRequest>) => {
      state.pendingPermission = action.payload;
    },
    resolvePermission: (state, action: PayloadAction<PermissionResponse>) => {
      // Append to event log
      state.events.push({
        type: 'permission_response',
        timestamp: new Date(),
        payload: action.payload
      });
      state.pendingPermission = null;
    },

    // Replay
    enterReplayMode: (state, action: PayloadAction<{ eventIndex: number }>) => {
      state.replayMode = { currentIndex: action.payload.eventIndex, isPlaying: false };
    },
    exitReplayMode: (state) => {
      state.replayMode = null;
    },
    seekToEvent: (state, action: PayloadAction<number>) => {
      if (state.replayMode) {
        state.replayMode.currentIndex = action.payload;
      }
    }
  }
});

// Middleware to persist events to disk
const persistMiddleware = (store) => (next) => (action) => {
  const result = next(action);

  // Persist on significant events
  if (action.type.startsWith('verification/')) {
    const state = store.getState().verification;
    saveSessionToDisk(state.session?.id, state);
  }

  return result;
};
```

### 0.5. Action-Observation Runtime (OpenHands Pattern)

Following [OpenHands' event-sourced architecture](https://arxiv.org/html/2511.03690v1), we model the agent-environment interface as an **action-observation loop**:

```typescript
// Inspired by OpenHands SDK architecture
// https://github.com/OpenHands/OpenHands

// Base event types for the event stream
interface BaseEvent {
  id: string;
  timestamp: Date;
  sessionId: string;
}

// Actions: What the agent wants to do
interface Action extends BaseEvent {
  kind: 'action';
  type: ActionType;
  payload: ActionPayload;

  // For deterministic replay
  agentState?: string;  // Hash of agent's internal state
}

type ActionType =
  | 'navigate'           // Go to page
  | 'query_extractions'  // Read extraction data
  | 'edit_extraction'    // Modify a field
  | 'approve_page'       // Mark page verified
  | 'reject_page'        // Mark page rejected
  | 'add_annotation'     // Add visual annotation
  | 'request_human'      // Escalate to human
  | 'think';             // Internal reasoning (logged)

// Observations: What the agent sees after action
interface Observation extends BaseEvent {
  kind: 'observation';
  type: ObservationType;
  payload: ObservationPayload;

  // Link to triggering action
  actionId: string;

  // Execution result
  success: boolean;
  error?: string;
}

type ObservationType =
  | 'page_content'       // Result of navigate
  | 'extraction_data'    // Result of query
  | 'edit_result'        // Confirm edit applied
  | 'status_result'      // Confirm status change
  | 'human_response'     // User input received
  | 'permission_denied'; // Action blocked by permission

// The Event Stream - append-only log
type Event = Action | Observation;

interface EventStream {
  events: Event[];

  // Append new event
  push(event: Event): void;

  // Get events since last observation
  getUnprocessed(): Event[];

  // Replay from specific point (for debugging)
  replayFrom(eventId: string): Event[];

  // Serialize for persistence
  toJSON(): string;

  // Deterministic replay - same actions should produce same observations
  // (assuming same document state)
  replay(actions: Action[]): Observation[];
}
```

### Agent Step Function (OpenHands Pattern)

```typescript
// The agent's core loop - takes state, produces action
interface VerificationAgent {
  // Current state: all events so far
  state: EventStream;

  // The step function - heart of the agent
  async step(): Promise<Action>;

  // Process observation and update internal state
  observe(obs: Observation): void;

  // Check if task is complete
  isComplete(): boolean;
}

// Implementation
class DocumentVerificationAgent implements VerificationAgent {
  state: EventStream;
  private currentPage: number = 1;
  private totalPages: number;
  private pagesVerified: Set<number> = new Set();

  async step(): Promise<Action> {
    // Get current context from event stream
    const recentEvents = this.state.events.slice(-10);

    // Build prompt with context
    const prompt = this.buildPrompt(recentEvents);

    // Call LLM to decide next action
    const response = await this.llm.chat(prompt);

    // Parse LLM response into structured action
    const action = this.parseAction(response);

    // Log the action
    this.state.push(action);

    return action;
  }

  observe(obs: Observation): void {
    // Append observation to stream
    this.state.push(obs);

    // Update internal state based on observation
    if (obs.type === 'status_result' && obs.success) {
      this.pagesVerified.add(obs.payload.pageNumber);
    }
  }

  isComplete(): boolean {
    return this.pagesVerified.size === this.totalPages;
  }
}
```

### Runtime Executor (Electron Main Process)

```typescript
// main/verification/runtime.ts

class VerificationRuntime {
  private session: VerificationSession;
  private eventStream: EventStream;
  private webContents: WebContents;  // For UI updates

  // Execute action and produce observation
  async executeAction(action: Action): Promise<Observation> {
    // Check permissions first
    const permissionResult = await this.checkPermission(action);
    if (!permissionResult.allowed) {
      return this.createObservation(action, {
        type: 'permission_denied',
        success: false,
        error: permissionResult.reason
      });
    }

    // Show ghost overlay in UI
    await this.showGhostOverlay(action);

    // Wait for approval if needed
    if (permissionResult.needsApproval) {
      const approved = await this.waitForApproval(action);
      if (!approved) {
        return this.createObservation(action, {
          type: 'permission_denied',
          success: false,
          error: 'User rejected action'
        });
      }
    }

    // Execute the action
    switch (action.type) {
      case 'navigate':
        return this.executeNavigate(action);
      case 'query_extractions':
        return this.executeQuery(action);
      case 'edit_extraction':
        return this.executeEdit(action);
      case 'approve_page':
        return this.executeApprove(action);
      // ... etc
    }
  }

  // The main agent loop
  async runAgent(agent: VerificationAgent): Promise<void> {
    while (!agent.isComplete()) {
      // Agent decides next action
      const action = await agent.step();

      // Runtime executes action
      const observation = await this.executeAction(action);

      // Agent observes result
      agent.observe(observation);

      // Update UI with latest state
      this.webContents.send('verification:event', observation);

      // Persist to disk
      await this.persistEventStream();
    }
  }

  // For deterministic replay / debugging
  async replaySession(eventStream: EventStream): Promise<void> {
    for (const event of eventStream.events) {
      if (event.kind === 'action') {
        // Re-execute action
        const observation = await this.executeAction(event);
        // Verify observation matches recorded one
        // (useful for debugging non-determinism)
      }
    }
  }
}
```

### Benefits of Action-Observation Pattern

1. **Deterministic Replay**: Same actions → same observations (given same document)
2. **Debuggability**: Inspect exactly what agent saw and did at each step
3. **Testability**: Unit test actions in isolation
4. **Portability**: Same agent logic can run locally or in cloud sandbox
5. **Observability**: Full audit trail of agent reasoning
6. **Interruptibility**: Can pause/resume at any event boundary
7. **Composability**: Chain multiple agents, each producing events

### 1. Session Model

```typescript
interface VerificationSession {
  id: string;
  documentId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  permissionLevel: PermissionLevel;

  // Agent configuration
  agentType: 'claude-code' | 'openai' | 'custom';

  // Session state
  currentPageIndex: number;
  totalPages: number;

  // Event stream (like Manus)
  events: VerificationEvent[];

  // Results
  pageStates: Record<number, PageVerificationState>;
}

type PermissionLevel =
  | 'yolo'        // Auto-approve everything
  | 'page'        // Ask when updating page status
  | 'edit';       // Ask when correcting extractions

interface VerificationEvent {
  id: string;
  timestamp: Date;
  type: EventType;
  payload: EventPayload;

  // For replay
  screenshot?: string;  // Base64 or file path
  uiState?: UISnapshot;
}

type EventType =
  | 'agent_thinking'
  | 'tool_call'
  | 'tool_result'
  | 'permission_request'
  | 'permission_response'
  | 'page_navigation'
  | 'extraction_edit'
  | 'status_change'
  | 'user_interrupt'
  | 'query_executed';
```

### 2. Page Verification State

```typescript
interface PageVerificationState {
  pageNumber: number;
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'needs_correction';

  // Extractions on this page
  extractions: Extraction[];

  // Agent's assessment
  agentAssessment?: {
    confidence: number;  // 0-1
    reasoning: string;
    suggestedCorrections: Correction[];
    references: Reference[];
  };

  // Audit trail
  reviewHistory: ReviewAction[];

  // Merge status
  committedAt?: Date;
  mergedToSource: boolean;
}

interface Extraction {
  id: string;
  type: 'table' | 'text' | 'entity' | 'metadata';
  boundingBox: BoundingBox;
  originalValue: any;
  currentValue: any;
  linkedEntities: string[];  // IDs of related extractions
  status: 'unverified' | 'verified' | 'corrected' | 'rejected';
}

interface Correction {
  extractionId: string;
  field: string;
  originalValue: any;
  suggestedValue: any;
  reasoning: string;
  source?: Reference;
}

interface Reference {
  type: 'page_content' | 'cross_reference' | 'external' | 'calculation';
  location: string;
  content: string;
}
```

### 3. Permission System

```typescript
interface PermissionRequest {
  id: string;
  sessionId: string;
  timestamp: Date;

  action: AgentAction;
  context: {
    pageNumber: number;
    extraction?: Extraction;
    reasoning: string;
  };

  status: 'pending' | 'approved' | 'denied';
  respondedAt?: Date;
  respondedBy: 'user' | 'auto';  // 'auto' for YOLO mode
}

type AgentAction =
  // Level 3: Edit-level (most restrictive)
  | { type: 'edit_extraction'; extractionId: string; field: string; newValue: any }
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

// Permission check function
function requiresPermission(
  action: AgentAction,
  level: PermissionLevel
): boolean {
  if (level === 'yolo') return false;

  if (level === 'page') {
    return ['edit_extraction', 'link_entities', 'add_annotation',
            'approve_page', 'reject_page', 'mark_needs_review'].includes(action.type);
  }

  if (level === 'edit') {
    return ['edit_extraction', 'link_entities', 'add_annotation'].includes(action.type);
  }

  return false;
}
```

---

## Agent Tools Design

The agent needs custom tools to interact with the verification UI:

```typescript
// Tools exposed to the agent via IPC
const VERIFICATION_TOOLS = {
  // Navigation & Query (always allowed)
  'navigate_to_page': {
    description: 'Navigate the PDF viewer to a specific page',
    parameters: { pageNumber: 'number' },
    permissionLevel: 'none'
  },

  'get_page_extractions': {
    description: 'Get all extractions for a specific page',
    parameters: { pageNumber: 'number' },
    permissionLevel: 'none'
  },

  'search_document': {
    description: 'Search for text or entities across the document',
    parameters: { query: 'string', filters?: 'ExtractionFilter' },
    permissionLevel: 'none'
  },

  'get_extraction_details': {
    description: 'Get detailed information about a specific extraction',
    parameters: { extractionId: 'string' },
    permissionLevel: 'none'
  },

  // Page Status (page-level permission)
  'approve_page': {
    description: 'Mark a page as verified/approved',
    parameters: { pageNumber: 'number', confidence: 'number', notes?: 'string' },
    permissionLevel: 'page'
  },

  'reject_page': {
    description: 'Mark a page as rejected with reason',
    parameters: { pageNumber: 'number', reason: 'string' },
    permissionLevel: 'page'
  },

  'flag_for_review': {
    description: 'Flag a page for human review',
    parameters: { pageNumber: 'number', issues: 'string[]' },
    permissionLevel: 'page'
  },

  // Extraction Editing (edit-level permission)
  'correct_extraction': {
    description: 'Correct a value in an extraction',
    parameters: {
      extractionId: 'string',
      field: 'string',
      newValue: 'any',
      reasoning: 'string',
      reference?: 'Reference'
    },
    permissionLevel: 'edit'
  },

  'link_extractions': {
    description: 'Link two related extractions (e.g., table to entity)',
    parameters: { sourceId: 'string', targetId: 'string', relationship: 'string' },
    permissionLevel: 'edit'
  },

  'add_annotation': {
    description: 'Add an annotation to a page region',
    parameters: {
      pageNumber: 'number',
      boundingBox: 'BoundingBox',
      content: 'string',
      type: 'correction' | 'note' | 'highlight'
    },
    permissionLevel: 'edit'
  },

  // Commit (always requires explicit approval)
  'commit_page': {
    description: 'Commit approved page changes to the database',
    parameters: { pageNumber: 'number' },
    permissionLevel: 'explicit'  // Always asks
  }
};
```

---

## IPC Channel Design

```typescript
// New channels for verification system
type VerificationChannels =
  // Session management
  | 'verification:start-session'
  | 'verification:pause-session'
  | 'verification:resume-session'
  | 'verification:end-session'

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
  | 'verification:replay-event';

// Example IPC handlers in main.ts
ipcMain.handle('verification:start-session', async (event, config: SessionConfig) => {
  const session = await startVerificationSession(config);
  return session;
});

ipcMain.on('verification:tool-call', async (event, { sessionId, tool, params }) => {
  const session = getSession(sessionId);

  // Check permissions
  const needsPermission = requiresPermission(tool, session.permissionLevel);

  if (needsPermission) {
    // Send permission request to renderer
    event.sender.send('verification:permission-request', {
      id: generateId(),
      sessionId,
      action: { type: tool, ...params },
      context: { /* current state */ }
    });
    // Wait for response via verification:permission-response
  } else {
    // Execute immediately
    const result = await executeVerificationTool(session, tool, params);
    event.sender.send('verification:tool-result', { sessionId, tool, result });
  }
});
```

---

## Session Capture & Replay (rrweb-based)

### Why rrweb over Screenshots

- **Lightweight**: JSON stream vs heavy image files
- **Interactive**: Users can hover, inspect elements in replay
- **Searchable**: Find specific DOM states
- **Precise**: Captures exact DOM mutations, not just snapshots

### rrweb Integration

```typescript
// renderer/services/sessionRecorder.ts
import { record, EventType } from 'rrweb';
import type { eventWithTime } from '@rrweb/types';

interface SessionRecorder {
  sessionId: string;
  events: eventWithTime[];
  stopFn: (() => void) | null;
}

let recorder: SessionRecorder | null = null;

export function startRecording(sessionId: string) {
  recorder = {
    sessionId,
    events: [],
    stopFn: null
  };

  recorder.stopFn = record({
    emit(event) {
      recorder.events.push(event);

      // Stream to main process for persistence
      window.electron.ipcRenderer.sendMessage('verification:rrweb-event', {
        sessionId,
        event
      });
    },
    // Only record the PDF viewer + verification panel
    // (not the entire window for privacy)
    recordCanvas: false,
    collectFonts: false,
    inlineStylesheet: true,
    // Mask sensitive data
    maskAllInputs: false,
    maskInputOptions: {
      password: true
    }
  });

  return recorder;
}

// Inject custom agent events into the rrweb stream
export function injectAgentEvent(type: string, payload: any) {
  if (!recorder) return;

  const customEvent: eventWithTime = {
    type: EventType.Custom,
    timestamp: Date.now(),
    data: {
      tag: 'agent',
      payload: { type, ...payload }
    }
  };

  recorder.events.push(customEvent);
  window.electron.ipcRenderer.sendMessage('verification:rrweb-event', {
    sessionId: recorder.sessionId,
    event: customEvent
  });
}

// Usage: Mark agent actions in the replay stream
injectAgentEvent('AGENT_THINKING', { text: 'Analyzing invoice total...' });
injectAgentEvent('TOOL_CALL', { tool: 'get_page_extractions', params: { page: 12 } });
injectAgentEvent('GHOST_SHOWN', { field: 'invoice_total', proposedValue: '$4,000.00' });
injectAgentEvent('PERMISSION_REQUESTED', { action: 'correct_extraction' });
injectAgentEvent('USER_APPROVED', { permissionId: 'perm_123' });

export function stopRecording(): eventWithTime[] {
  if (recorder?.stopFn) {
    recorder.stopFn();
  }
  const events = recorder?.events || [];
  recorder = null;
  return events;
}
```

### Replay Player

```typescript
// renderer/components/verification/SessionReplayView.tsx
import { Replayer } from 'rrweb';
import 'rrweb/dist/rrweb.min.css';

interface SessionReplayViewProps {
  sessionId: string;
  events: eventWithTime[];
}

export function SessionReplayView({ sessionId, events }: SessionReplayViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Extract agent events for timeline markers
  const agentEvents = useMemo(() =>
    events
      .filter(e => e.type === EventType.Custom && e.data.tag === 'agent')
      .map(e => ({
        time: e.timestamp - events[0].timestamp,
        type: e.data.payload.type,
        payload: e.data.payload
      })),
    [events]
  );

  useEffect(() => {
    if (!containerRef.current || events.length === 0) return;

    replayerRef.current = new Replayer(events, {
      root: containerRef.current,
      skipInactive: true,
      showWarning: false,
      speed: 1,
      // Highlight agent events
      plugins: [
        {
          handler(event, isSync, context) {
            if (event.type === EventType.Custom && event.data.tag === 'agent') {
              // Show overlay for agent events
              showAgentEventOverlay(event.data.payload);
            }
          }
        }
      ]
    });

    return () => {
      replayerRef.current?.destroy();
    };
  }, [events]);

  return (
    <div className="flex flex-col h-full">
      {/* Replay viewport */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />

      {/* Agent event sidebar */}
      <div className="w-80 border-l overflow-y-auto">
        <h3 className="p-3 font-semibold border-b">Agent Events</h3>
        {agentEvents.map((event, i) => (
          <button
            key={i}
            onClick={() => replayerRef.current?.play(event.time)}
            className="w-full p-3 text-left hover:bg-gray-50 border-b"
          >
            <div className="text-sm font-medium">{event.type}</div>
            <div className="text-xs text-gray-500">
              {formatTime(event.time)}
            </div>
          </button>
        ))}
      </div>

      {/* Timeline controls */}
      <div className="h-16 border-t flex items-center px-4 gap-4">
        <button onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        {/* Timeline with event markers */}
        <div className="flex-1 relative h-2 bg-gray-200 rounded">
          {agentEvents.map((event, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-purple-500 rounded-full -top-0.5"
              style={{ left: `${(event.time / totalDuration) * 100}%` }}
              title={event.type}
            />
          ))}
          <input
            type="range"
            min={0}
            max={totalDuration}
            value={currentTime}
            onChange={(e) => replayerRef.current?.play(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />
        </div>

        <span className="text-sm tabular-nums">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
      </div>
    </div>
  );
}
```

---

## Ghost Overlay System

The "Ghost Overlay" shows the agent's intended action before it's committed - giving users the "Manus" feel of watching the agent work.

### Ghost Overlay Types

```typescript
interface GhostOverlay {
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

type GhostType =
  | 'field_correction'   // Agent wants to change a value
  | 'status_change'      // Agent wants to approve/reject page
  | 'annotation'         // Agent wants to add a note
  | 'navigation'         // Agent is moving to a page
  | 'thinking';          // Agent is analyzing

interface GhostContent {
  // For field_correction
  fieldName?: string;
  currentValue?: any;
  proposedValue?: any;

  // For status_change
  proposedStatus?: PageStatus;

  // Common
  reasoning: string;
  confidence?: number;
}
```

### Ghost Overlay Component

```tsx
// renderer/components/verification/GhostOverlay.tsx

interface GhostOverlayProps {
  ghost: GhostOverlay;
  permissionLevel: PermissionLevel;
  onApprove: () => void;
  onReject: () => void;
  onAskMore: () => void;
}

export function GhostOverlay({
  ghost,
  permissionLevel,
  onApprove,
  onReject,
  onAskMore
}: GhostOverlayProps) {
  const [countdown, setCountdown] = useState(ghost.autoCommitDelay);

  // Auto-commit countdown for YOLO mode
  useEffect(() => {
    if (permissionLevel !== 'yolo' || !ghost.autoCommitDelay) return;

    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 100) {
          onApprove();
          return 0;
        }
        return c - 100;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [permissionLevel, ghost.autoCommitDelay]);

  return (
    <div
      className="ghost-overlay absolute pointer-events-auto z-50"
      style={{
        left: ghost.boundingBox?.x,
        top: ghost.boundingBox?.y,
        width: ghost.boundingBox?.width,
        height: ghost.boundingBox?.height
      }}
    >
      {/* Purple bounding box */}
      <div className="absolute inset-0 border-2 border-purple-500 bg-purple-500/10 animate-pulse" />

      {/* Ghost value (for field corrections) */}
      {ghost.type === 'field_correction' && (
        <div className="absolute -top-8 left-0 bg-purple-600 text-white px-2 py-1 rounded text-sm">
          <span className="line-through opacity-60">{ghost.content.currentValue}</span>
          {' → '}
          <span className="font-semibold">{ghost.content.proposedValue}</span>
        </div>
      )}

      {/* Reasoning tooltip */}
      <div className="absolute left-full ml-2 top-0 w-64 bg-white rounded-lg shadow-xl border p-3">
        <div className="flex items-center gap-2 mb-2">
          <RobotIcon className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-medium">Agent Assessment</span>
        </div>

        <p className="text-sm text-gray-600 mb-3">
          {ghost.content.reasoning}
        </p>

        {ghost.content.confidence && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500">Confidence:</span>
            <div className="flex-1 h-1.5 bg-gray-200 rounded">
              <div
                className="h-full bg-green-500 rounded"
                style={{ width: `${ghost.content.confidence * 100}%` }}
              />
            </div>
            <span className="text-xs">{Math.round(ghost.content.confidence * 100)}%</span>
          </div>
        )}

        {/* Action buttons (hidden in YOLO mode with auto-commit) */}
        {permissionLevel !== 'yolo' && (
          <div className="flex gap-2">
            <button
              onClick={onApprove}
              className="flex-1 px-3 py-1.5 bg-green-500 text-white rounded text-sm hover:bg-green-600"
            >
              Approve
            </button>
            <button
              onClick={onReject}
              className="flex-1 px-3 py-1.5 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              Reject
            </button>
            <button
              onClick={onAskMore}
              className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
            >
              ?
            </button>
          </div>
        )}

        {/* YOLO mode countdown */}
        {permissionLevel === 'yolo' && countdown > 0 && (
          <div className="text-center text-sm text-gray-500">
            Auto-approving in {Math.ceil(countdown / 1000)}s...
            <button
              onClick={onReject}
              className="ml-2 text-red-500 underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

### Visual Integration with PDF Viewer

```tsx
// renderer/components/PDFViewer.tsx (modified)

export function PDFViewer({ document, ghostOverlay, onGhostAction }) {
  return (
    <div className="relative">
      {/* PDF pages */}
      <Document file={document.url}>
        {Array.from({ length: numPages }, (_, i) => (
          <div key={i} className="relative">
            <Page pageNumber={i + 1} />

            {/* Extraction bounding boxes */}
            <ExtractionOverlays pageNumber={i + 1} />

            {/* Ghost overlay for this page */}
            {ghostOverlay?.pageNumber === i + 1 && (
              <GhostOverlay
                ghost={ghostOverlay}
                onApprove={() => onGhostAction('approve')}
                onReject={() => onGhostAction('reject')}
                onAskMore={() => onGhostAction('ask')}
              />
            )}
          </div>
        ))}
      </Document>
    </div>
  );
}
```

### Replay System

```typescript
interface ReplayController {
  session: VerificationSession;
  currentEventIndex: number;
  playbackSpeed: number;  // 1x, 2x, 0.5x
  isPlaying: boolean;

  // Methods
  play(): void;
  pause(): void;
  seekToEvent(eventId: string): void;
  seekToTime(timestamp: Date): void;
  stepForward(): void;
  stepBackward(): void;
}

// Replay component renders:
// 1. Screenshot at that point in time
// 2. Event details (tool call, reasoning, etc.)
// 3. Timeline scrubber
// 4. Step-through controls
```

---

## UI Components

### 1. VerificationPanel (right sidebar)

```
┌─────────────────────────────────────────┐
│ Verification Session                    │
│ ══════════════════════                  │
│ Status: ● Active                        │
│ Progress: 12/45 pages                   │
│ Permission: [Page-level ▼]              │
├─────────────────────────────────────────┤
│ [Chat] [Extractions] [Audit Trail]      │
├─────────────────────────────────────────┤
│                                         │
│  Current Page: 12                       │
│  ┌─────────────────────────────────┐   │
│  │ Extraction: Invoice Total        │   │
│  │ Value: $1,234.56                 │   │
│  │ Status: ✓ Verified               │   │
│  │ Confidence: 98%                  │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Agent Assessment:                      │
│  "Cross-referenced with line items,    │
│   total matches sum of $1,234.56"      │
│                                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 🤖 Agent wants to approve page 12   │ │
│ │                                     │ │
│ │ Reasoning: All 3 extractions        │ │
│ │ verified with 95%+ confidence       │ │
│ │                                     │ │
│ │  [Approve]  [Deny]  [Ask More]     │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### 2. PermissionDialog

```
┌─────────────────────────────────────────┐
│ 🔐 Permission Request                   │
├─────────────────────────────────────────┤
│                                         │
│ Action: Edit Extraction                 │
│                                         │
│ Field: Invoice Date                     │
│ Current: "2024-01-15"                   │
│ Proposed: "2024-01-14"                  │
│                                         │
│ Reasoning:                              │
│ "OCR misread '4' as '5'. Cross-         │
│  referenced with email timestamp        │
│  shows document dated Jan 14th."        │
│                                         │
│ Reference: Page 1, header               │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ [Preview screenshot of reference]   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│  [✓ Approve]  [✗ Deny]  [? Ask Agent]  │
│                                         │
│  □ Remember for similar actions         │
└─────────────────────────────────────────┘
```

### 3. AuditTrailView

```
┌─────────────────────────────────────────┐
│ Audit Trail                   [Export]  │
├─────────────────────────────────────────┤
│ ▼ 10:23:45 - Tool: navigate_to_page    │
│   Page: 12                              │
│                                         │
│ ▼ 10:23:47 - Tool: get_page_extractions│
│   Found: 3 extractions                  │
│                                         │
│ ▼ 10:23:52 - Tool: correct_extraction  │
│   Status: ⏳ Awaiting approval          │
│   Field: Invoice Date                   │
│   Change: "2024-01-15" → "2024-01-14"   │
│   [View Screenshot]                     │
│                                         │
│ ● 10:23:58 - User approved correction  │
│                                         │
│ ▼ 10:24:01 - Tool: approve_page        │
│   Status: ✓ Approved                    │
│   Confidence: 0.95                      │
└─────────────────────────────────────────┘
```

### 4. SessionReplayView

```
┌─────────────────────────────────────────────────────────┐
│ Session Replay: Invoice Verification - Jan 6, 2026     │
├───────────────────────────┬─────────────────────────────┤
│                           │                             │
│  [Screenshot of app       │  Event Details              │
│   state at this moment]   │                             │
│                           │  Type: tool_call            │
│                           │  Tool: correct_extraction   │
│                           │                             │
│                           │  Input:                     │
│                           │  - extractionId: "ext_123"  │
│                           │  - field: "Invoice Date"    │
│                           │  - newValue: "2024-01-14"   │
│                           │                             │
│                           │  Reasoning:                 │
│                           │  "OCR misread '4' as '5'    │
│                           │   based on cross-reference" │
│                           │                             │
├───────────────────────────┴─────────────────────────────┤
│ ◀◀  ◀  [▶ Play]  ▶  ▶▶    [1x ▼]    ────●──────── 24/89 │
│                                                         │
│ Timeline: [▪▪▪▪▪▪▪●▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪] │
│           ^tool  ^perm  ^edit          ^approve         │
└─────────────────────────────────────────────────────────┘
```

---

## Merge Back Strategy

Per-page commits (when approved → write to DB):

```typescript
interface MergeStrategy {
  // When to merge
  trigger: 'on_page_approve' | 'on_session_complete' | 'manual';

  // What to merge
  includeCorrections: boolean;
  includeAnnotations: boolean;
  includeMetadata: boolean;
}

async function commitPage(
  session: VerificationSession,
  pageNumber: number
): Promise<void> {
  const pageState = session.pageStates[pageNumber];

  if (pageState.status !== 'approved') {
    throw new Error('Can only commit approved pages');
  }

  // 1. Write corrections to extraction database
  for (const extraction of pageState.extractions) {
    if (extraction.status === 'corrected') {
      await updateExtraction(extraction.id, extraction.currentValue);
    }
  }

  // 2. Write audit trail
  await writeAuditTrail({
    documentId: session.documentId,
    pageNumber,
    verifiedAt: new Date(),
    verifiedBy: 'agent',
    sessionId: session.id,
    corrections: pageState.extractions.filter(e => e.status === 'corrected'),
    assessment: pageState.agentAssessment
  });

  // 3. Update page status
  pageState.committedAt = new Date();
  pageState.mergedToSource = true;

  // 4. Notify UI
  sendToRenderer('verification:page-committed', { pageNumber });
}
```

---

## Integration with AI Providers

### BYOA (Bring Your Own Agent) Design

```typescript
interface AgentProvider {
  type: 'claude-code' | 'openai' | 'anthropic-direct' | 'custom';

  // For Claude Code CLI integration
  claudeCodeConfig?: {
    useCLI: boolean;  // Use installed CLI
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

// The verification system exposes tools via MCP or custom protocol
// that any agent can use, regardless of provider
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Install dependencies (Redux Toolkit, rrweb, better-sqlite3)
- [ ] Set up Redux store with verification slice
- [ ] Define TypeScript types (Action, Observation, Event, Session)
- [ ] Create shared types package (`src/shared/types/verification.ts`)

### Phase 2: Action-Observation Runtime (Week 2)
- [ ] Implement EventStream class with append/replay
- [ ] Create VerificationRuntime in main process
- [ ] Define verification tools schema (8 core tools)
- [ ] Implement permission checking middleware
- [ ] Set up IPC channels for agent ↔ UI communication

### Phase 3: Agent Integration (Week 3)
- [ ] Create DocumentVerificationAgent class
- [ ] Integrate with Claude Agent SDK for LLM calls
- [ ] Implement step() function with prompt building
- [ ] Add agent state persistence
- [ ] Create "Start Verification" flow in UI

### Phase 4: Ghost Overlay System (Week 4)
- [ ] Create GhostOverlay component
- [ ] Integrate with PDFViewer for bounding box positioning
- [ ] Implement permission dialog flow
- [ ] Add YOLO mode with auto-commit countdown
- [ ] Style ghost overlays (purple theme)

### Phase 5: Session Recording (Week 5)
- [ ] Integrate rrweb for DOM recording
- [ ] Inject custom agent events into rrweb stream
- [ ] Persist event stream to SQLite/files
- [ ] Create session management UI (list, load, delete)

### Phase 6: Replay System (Week 6)
- [ ] Create SessionReplayView with rrweb-player
- [ ] Add timeline with agent event markers
- [ ] Implement step-through controls
- [ ] Add agent event sidebar with seek-to-event

### Phase 7: Merge & Commit (Week 7)
- [ ] Implement draft layer in Redux
- [ ] Create per-page commit logic
- [ ] Write audit trail to database
- [ ] Add "Submit All" button for batch commit
- [ ] Conflict detection for concurrent edits

### Phase 8: Polish & Testing (Week 8)
- [ ] End-to-end testing of full flow
- [ ] Performance optimization (large documents)
- [ ] Error handling and recovery
- [ ] User documentation
- [ ] Demo recording

---

## New Dependencies

```json
{
  "dependencies": {
    // State management
    "@reduxjs/toolkit": "^2.0.0",
    "react-redux": "^9.0.0",
    "redux-persist": "^6.0.0",

    // Session replay
    "rrweb": "^2.0.0-alpha.17",
    "rrweb-player": "^1.0.0-alpha.17",
    "@rrweb/types": "^2.0.0-alpha.17",

    // Local database
    "better-sqlite3": "^11.0.0",

    // Existing (already in package.json)
    "@anthropic-ai/claude-agent-sdk": "^0.1.25",
    "react-pdf": "^10.3.0",
    "electron-store": "^11.0.2"
  },
  "devDependencies": {
    // Types for better-sqlite3
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

---

## File Structure

```
src/
├── renderer/
│   ├── components/
│   │   ├── verification/
│   │   │   ├── VerificationPanel.tsx        # Main sidebar panel
│   │   │   ├── PermissionDialog.tsx         # Approve/deny modal
│   │   │   ├── GhostOverlay.tsx             # Visual intent indicator
│   │   │   ├── AuditTrailView.tsx           # Event history list
│   │   │   ├── ExtractionCard.tsx           # Single extraction display
│   │   │   ├── PageStatusIndicator.tsx      # Thumbnail status dots
│   │   │   ├── SessionReplayView.tsx        # Full replay player
│   │   │   ├── TimelineControl.tsx          # Playback scrubber
│   │   │   └── AgentEventMarker.tsx         # Timeline markers
│   │   └── ...
│   │
│   ├── store/
│   │   ├── index.ts                          # Redux store setup
│   │   ├── verification/
│   │   │   ├── slice.ts                      # Verification state slice
│   │   │   ├── selectors.ts                  # Memoized selectors
│   │   │   ├── thunks.ts                     # Async actions
│   │   │   └── middleware.ts                 # Persist middleware
│   │   └── hooks.ts                          # Typed useSelector/Dispatch
│   │
│   ├── services/
│   │   ├── sessionRecorder.ts                # rrweb integration
│   │   └── eventInjector.ts                  # Custom event helpers
│   │
│   └── hooks/
│       ├── useVerificationSession.ts
│       ├── usePermissions.ts
│       ├── useGhostOverlay.ts
│       └── useSessionReplay.ts
│
├── main/
│   ├── verification/
│   │   ├── runtime.ts                        # Action-Observation executor
│   │   ├── agent.ts                          # VerificationAgent class
│   │   ├── eventStream.ts                    # Event stream implementation
│   │   ├── tools.ts                          # Tool definitions & handlers
│   │   ├── permissions.ts                    # Permission checking logic
│   │   ├── session.ts                        # Session lifecycle
│   │   └── merge.ts                          # Draft → committed merge
│   │
│   ├── database/
│   │   ├── index.ts                          # SQLite connection
│   │   ├── sessions.ts                       # Session CRUD
│   │   ├── events.ts                         # Event persistence
│   │   └── migrations/                       # Schema migrations
│   │
│   └── ipc/
│       └── verification-handlers.ts          # IPC channel handlers
│
└── shared/
    └── types/
        ├── verification.ts                   # Core types
        ├── actions.ts                        # Action type definitions
        ├── observations.ts                   # Observation types
        ├── events.ts                         # Event stream types
        └── permissions.ts                    # Permission types
```

---

## Database Schema (SQLite)

```sql
-- Sessions table
CREATE TABLE verification_sessions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  status TEXT CHECK(status IN ('active', 'paused', 'completed', 'cancelled')),
  permission_level TEXT CHECK(permission_level IN ('yolo', 'page', 'edit')),
  total_pages INTEGER,
  pages_verified INTEGER DEFAULT 0,

  -- rrweb recording reference
  recording_path TEXT,

  FOREIGN KEY (document_id) REFERENCES documents(uuid)
);

-- Event stream (append-only log)
CREATE TABLE verification_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  kind TEXT CHECK(kind IN ('action', 'observation')),
  type TEXT NOT NULL,
  payload JSON NOT NULL,

  -- For observations
  action_id TEXT,
  success BOOLEAN,
  error TEXT,

  -- Index for replay
  sequence INTEGER NOT NULL,

  FOREIGN KEY (session_id) REFERENCES verification_sessions(id),
  FOREIGN KEY (action_id) REFERENCES verification_events(id)
);

CREATE INDEX idx_events_session ON verification_events(session_id, sequence);

-- Page states
CREATE TABLE page_verification_states (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  status TEXT CHECK(status IN ('pending', 'in_review', 'approved', 'rejected', 'needs_correction')),
  agent_confidence REAL,
  agent_reasoning TEXT,
  committed_at DATETIME,

  UNIQUE(session_id, page_number),
  FOREIGN KEY (session_id) REFERENCES verification_sessions(id)
);

-- Extraction corrections (audit trail)
CREATE TABLE extraction_corrections (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  extraction_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  original_value TEXT,
  corrected_value TEXT,
  reasoning TEXT,
  corrected_at DATETIME NOT NULL,
  corrected_by TEXT CHECK(corrected_by IN ('agent', 'user')),

  FOREIGN KEY (session_id) REFERENCES verification_sessions(id)
);
```

---

## References

### Agent Architecture
- [OpenHands: An Open Platform for AI Software Developers](https://arxiv.org/html/2407.16741v3) - Action-observation runtime abstraction
- [OpenHands Software Agent SDK](https://arxiv.org/html/2511.03690v1) - Event-sourced state model, composable agent SDK
- [OpenHands GitHub](https://github.com/OpenHands/OpenHands) - Reference implementation

### Observability & Session Replay
- [Manus AI](https://manus.im/) - Replayable sessions, event stream model
- [Manus Technical Analysis](https://gist.github.com/renschni/4fbc70b31bad8dd57f3370239dccd58f) - Architecture deep dive
- [LangSmith Observability](https://docs.langchain.com/oss/python/langchain/observability) - Tool call tracing, audit trails
- [LangSmith Agent Observability](https://changelog.langchain.com/announcements/agent-observability-gain-insights-into-tool-calls-run-stats) - Tool visibility patterns
- [rrweb](https://github.com/rrweb-io/rrweb) - DOM recording and replay library

### Permissions & Human-in-the-Loop
- [Claude Code Permissions](https://sider.ai/blog/ai-tools/how-to-handle-permissions-and-data-scope-when-building-agents-in-claude-code) - Allow/deny/ask permission model
- [Claude Agent SDK Best Practices](https://skywork.ai/blog/claude-agent-sdk-best-practices-ai-agents-2025/) - Guardrails and human approval gates
- [Claude Code Subagents](https://code.claude.com/docs/en/sub-agents) - Permission modes for subagents

### State Management
- [Redux Toolkit](https://redux-toolkit.js.org/) - State management with time-travel debugging
- [Redux DevTools](https://github.com/reduxjs/redux-devtools) - Debugging and replay

### Desktop App Architecture
- [Electron](https://www.electronjs.org/) - Desktop app framework
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - Fast SQLite for Node.js
