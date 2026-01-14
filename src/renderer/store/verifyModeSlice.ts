/**
 * Verify Mode Redux Slice - Adapted from UI-TARS/Tarko replay patterns
 * Manages verify mode session, event stream, and replay state
 */

import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import type { RootState } from './index';
import type { AgentEvent } from '../../shared/types/agent-events';
import type { TodoItem } from '../../shared/types/agent-output';

export type VerifyModeState =
  | 'idle'
  | 'running'
  | 'awaiting_human_input'
  | 'awaiting_page_review'
  | 'awaiting_approval'
  | 'paused'
  | 'completed'
  | 'error';

export interface PendingHumanRequest {
  type: 'question' | 'review' | 'approval';
  requestId: string;
  payload: unknown;
  requestedAt: number;
}

export interface ReplayState {
  isActive: boolean;
  currentEventIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  startTimestamp: number | null;
  endTimestamp: number | null;
}

export interface VerifyModeMetrics {
  pagesScanned: number;
  totalPages: number;
  tablesFound: number;
  issuesFound: number;
  humanInterventions: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface VerifyModeSliceState {
  sessionId: string | null;
  workspaceId: string | null;
  state: VerifyModeState;
  objective: string;

  events: AgentEvent[];
  todoList: TodoItem[];
  currentStepIndex: number;

  currentPageIndex: number;
  pagesNeedingReview: number[];
  pagesApproved: number[];

  pendingRequest: PendingHumanRequest | null;

  metrics: VerifyModeMetrics;

  replay: ReplayState;

  error: string | null;
}

const initialState: VerifyModeSliceState = {
  sessionId: null,
  workspaceId: null,
  state: 'idle',
  objective: '',

  events: [],
  todoList: [],
  currentStepIndex: 0,

  currentPageIndex: 1,
  pagesNeedingReview: [],
  pagesApproved: [],

  pendingRequest: null,

  metrics: {
    pagesScanned: 0,
    totalPages: 0,
    tablesFound: 0,
    issuesFound: 0,
    humanInterventions: 0,
    startedAt: null,
    completedAt: null,
  },

  replay: {
    isActive: false,
    currentEventIndex: -1,
    isPlaying: false,
    playbackSpeed: 1,
    startTimestamp: null,
    endTimestamp: null,
  },

  error: null,
};

const verifyModeSlice = createSlice({
  name: 'verifyMode',
  initialState,
  reducers: {
    startSession: (
      state,
      action: PayloadAction<{
        sessionId: string;
        workspaceId: string;
        objective: string;
        totalPages: number;
      }>,
    ) => {
      const { sessionId, workspaceId, objective, totalPages } = action.payload;
      state.sessionId = sessionId;
      state.workspaceId = workspaceId;
      state.state = 'running';
      state.objective = objective;
      state.events = [];
      state.todoList = [];
      state.currentStepIndex = 0;
      state.currentPageIndex = 1;
      state.pagesNeedingReview = [];
      state.pagesApproved = [];
      state.pendingRequest = null;
      state.metrics = {
        pagesScanned: 0,
        totalPages,
        tablesFound: 0,
        issuesFound: 0,
        humanInterventions: 0,
        startedAt: Date.now(),
        completedAt: null,
      };
      state.error = null;
    },

    pushEvent: (state, action: PayloadAction<AgentEvent>) => {
      state.events.push(action.payload);
    },

    setState: (state, action: PayloadAction<VerifyModeState>) => {
      state.state = action.payload;
    },

    setTodoList: (state, action: PayloadAction<TodoItem[]>) => {
      state.todoList = action.payload;
    },

    updateTodoStep: (
      state,
      action: PayloadAction<{ step: number; status: TodoItem['status'] }>,
    ) => {
      const item = state.todoList.find((t) => t.step === action.payload.step);
      if (item) {
        item.status = action.payload.status;
      }
    },

    navigateToPage: (state, action: PayloadAction<number>) => {
      state.currentPageIndex = action.payload;
    },

    setPendingRequest: (
      state,
      action: PayloadAction<PendingHumanRequest | null>,
    ) => {
      state.pendingRequest = action.payload;
    },

    addPageNeedingReview: (state, action: PayloadAction<number>) => {
      if (!state.pagesNeedingReview.includes(action.payload)) {
        state.pagesNeedingReview.push(action.payload);
      }
    },

    approvePage: (state, action: PayloadAction<number>) => {
      const pageNum = action.payload;
      if (!state.pagesApproved.includes(pageNum)) {
        state.pagesApproved.push(pageNum);
      }
      state.pagesNeedingReview = state.pagesNeedingReview.filter(
        (p) => p !== pageNum,
      );
    },

    updateMetrics: (
      state,
      action: PayloadAction<Partial<VerifyModeMetrics>>,
    ) => {
      state.metrics = { ...state.metrics, ...action.payload };
    },

    completeSession: (state) => {
      state.state = 'completed';
      state.metrics.completedAt = Date.now();
      state.pendingRequest = null;
    },

    setError: (state, action: PayloadAction<string>) => {
      state.state = 'error';
      state.error = action.payload;
    },

    pauseSession: (state) => {
      state.state = 'paused';
    },

    resumeSession: (state) => {
      state.state = 'running';
    },

    resetSession: () => initialState,

    // Replay controls (UI-TARS pattern)
    startReplay: (state) => {
      state.replay.isActive = true;
      state.replay.isPlaying = true;
      state.replay.currentEventIndex = -1;
      if (state.events.length > 0) {
        state.replay.startTimestamp = state.events[0].timestamp.getTime();
        state.replay.endTimestamp =
          state.events[state.events.length - 1].timestamp.getTime();
      }
    },

    pauseReplay: (state) => {
      state.replay.isPlaying = false;
    },

    resumeReplay: (state) => {
      state.replay.isPlaying = true;
    },

    setReplayEventIndex: (state, action: PayloadAction<number>) => {
      state.replay.currentEventIndex = action.payload;
    },

    setPlaybackSpeed: (state, action: PayloadAction<number>) => {
      state.replay.playbackSpeed = action.payload;
    },

    exitReplay: (state) => {
      state.replay = {
        isActive: false,
        currentEventIndex: -1,
        isPlaying: false,
        playbackSpeed: 1,
        startTimestamp: null,
        endTimestamp: null,
      };
    },
  },
});

export const {
  startSession,
  pushEvent,
  setState,
  setTodoList,
  updateTodoStep,
  navigateToPage,
  setPendingRequest,
  addPageNeedingReview,
  approvePage,
  updateMetrics,
  completeSession,
  setError,
  pauseSession,
  resumeSession,
  resetSession,
  startReplay,
  pauseReplay,
  resumeReplay,
  setReplayEventIndex,
  setPlaybackSpeed,
  exitReplay,
} = verifyModeSlice.actions;

// Selectors
export const selectVerifyMode = (state: RootState) => state.verifyMode;
export const selectVerifyState = (state: RootState) => state.verifyMode.state;
export const selectVerifySessionId = (state: RootState) =>
  state.verifyMode.sessionId;
export const selectVerifyEvents = (state: RootState) => state.verifyMode.events;
export const selectVerifyTodoList = (state: RootState) =>
  state.verifyMode.todoList;
export const selectVerifyMetrics = (state: RootState) =>
  state.verifyMode.metrics;
export const selectVerifyReplay = (state: RootState) => state.verifyMode.replay;
export const selectPendingRequest = (state: RootState) =>
  state.verifyMode.pendingRequest;

export const selectVerifyProgress = createSelector(
  [selectVerifyMetrics],
  (metrics) => ({
    percent:
      metrics.totalPages > 0
        ? Math.round((metrics.pagesScanned / metrics.totalPages) * 100)
        : 0,
    ...metrics,
  }),
);

export const selectIsVerifyActive = createSelector(
  [selectVerifyState],
  (state) => !['idle', 'completed', 'error'].includes(state),
);

export const selectIsAwaitingHuman = createSelector(
  [selectVerifyState],
  (state) =>
    [
      'awaiting_human_input',
      'awaiting_page_review',
      'awaiting_approval',
    ].includes(state),
);

export const selectReplayProgress = createSelector(
  [selectVerifyReplay, selectVerifyEvents],
  (replay, events) => {
    if (!replay.isActive || events.length <= 1) return 0;
    return Math.round((replay.currentEventIndex / (events.length - 1)) * 100);
  },
);

export default verifyModeSlice.reducer;
