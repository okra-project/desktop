/**
 * Verification Redux Slice
 *
 * Manages the state of the document verification system.
 * Based on OpenHands action-observation pattern with
 * full event replay capabilities.
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  VerificationSession,
  VerificationEvent,
  PageDraft,
  GhostOverlay,
  PermissionRequest,
  PermissionResponse,
  PageVerificationState,
  Extraction,
  ReplayState,
  SessionConfig,
  Action,
  Observation,
  PageStatus,
  ExtractionEdit,
} from '../../../shared/types/verification';
import { generateId } from '../../../shared/types/verification';

// ============================================
// State Interface
// ============================================

export interface VerificationState {
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

  // Loading states
  isStartingSession: boolean;
  isProcessing: boolean;

  // Error state
  error: string | null;
}

// ============================================
// Initial State
// ============================================

const initialState: VerificationState = {
  session: null,
  events: [],
  drafts: {},
  pendingPermission: null,
  ghostOverlay: null,
  replayMode: null,
  isStartingSession: false,
  isProcessing: false,
  error: null,
};

// ============================================
// Helper Functions
// ============================================

function createInitialPageState(pageNumber: number): PageVerificationState {
  return {
    pageNumber,
    status: 'pending',
    extractions: [],
    reviewHistory: [],
    mergedToSource: false,
  };
}

function mergeDraft(
  pageState: PageVerificationState,
  draft: PageDraft
): PageVerificationState {
  const updatedExtractions = pageState.extractions.map((extraction) => {
    const edit = draft.extractionEdits[extraction.id];
    if (edit) {
      return {
        ...extraction,
        currentValue: edit.draftValue,
        status: 'corrected' as const,
      };
    }
    return extraction;
  });

  return {
    ...pageState,
    extractions: updatedExtractions,
    status: draft.proposedStatus || pageState.status,
    reviewHistory: [
      ...pageState.reviewHistory,
      {
        id: generateId(),
        timestamp: new Date(),
        action: 'edited',
        actor: 'user',
        details: `Merged ${Object.keys(draft.extractionEdits).length} edits`,
      },
    ],
  };
}

// ============================================
// Slice Definition
// ============================================

const verificationSlice = createSlice({
  name: 'verification',
  initialState,
  reducers: {
    // ==========================================
    // Session Lifecycle
    // ==========================================

    startSession: (state, action: PayloadAction<SessionConfig>) => {
      const config = action.payload;
      const now = new Date();

      // Initialize page states
      const pageStates: Record<number, PageVerificationState> = {};
      for (let i = 1; i <= config.totalPages; i++) {
        pageStates[i] = createInitialPageState(i);
      }

      state.session = {
        id: generateId(),
        documentId: config.documentId,
        documentName: config.documentName,
        startedAt: now,
        status: 'active',
        permissionLevel: config.permissionLevel,
        agentType: config.agentType,
        currentPageIndex: 1,
        totalPages: config.totalPages,
        events: [],
        pageStates,
      };

      state.events = [];
      state.drafts = {};
      state.error = null;
      state.isStartingSession = false;
    },

    setStartingSession: (state, action: PayloadAction<boolean>) => {
      state.isStartingSession = action.payload;
    },

    pauseSession: (state) => {
      if (state.session) {
        state.session.status = 'paused';
      }
    },

    resumeSession: (state) => {
      if (state.session && state.session.status === 'paused') {
        state.session.status = 'active';
      }
    },

    endSession: (state) => {
      if (state.session) {
        state.session.status = 'completed';
        state.session.completedAt = new Date();
      }
      state.ghostOverlay = null;
      state.pendingPermission = null;
    },

    cancelSession: (state) => {
      if (state.session) {
        state.session.status = 'cancelled';
        state.session.completedAt = new Date();
      }
      state.ghostOverlay = null;
      state.pendingPermission = null;
    },

    // ==========================================
    // Event Stream (append-only log)
    // ==========================================

    appendEvent: (state, action: PayloadAction<VerificationEvent>) => {
      const event = action.payload;
      state.events.push(event);

      // Also add to session events if active
      if (state.session) {
        state.session.events.push(event);
      }
    },

    appendAction: (state, action: PayloadAction<Action>) => {
      const actionEvent = action.payload;
      state.events.push(actionEvent);

      if (state.session) {
        state.session.events.push(actionEvent);
      }

      state.isProcessing = true;
    },

    appendObservation: (state, action: PayloadAction<Observation>) => {
      const observation = action.payload;
      state.events.push(observation);

      if (state.session) {
        state.session.events.push(observation);
      }

      state.isProcessing = false;
    },

    // ==========================================
    // Page Navigation
    // ==========================================

    navigateToPage: (state, action: PayloadAction<number>) => {
      if (state.session) {
        state.session.currentPageIndex = action.payload;
      }
    },

    // ==========================================
    // Page State Updates
    // ==========================================

    updatePageStatus: (
      state,
      action: PayloadAction<{ pageNumber: number; status: PageStatus }>
    ) => {
      const { pageNumber, status } = action.payload;
      if (state.session?.pageStates[pageNumber]) {
        state.session.pageStates[pageNumber].status = status;
        state.session.pageStates[pageNumber].reviewHistory.push({
          id: generateId(),
          timestamp: new Date(),
          action: status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'viewed',
          actor: 'agent',
        });
      }
    },

    setPageExtractions: (
      state,
      action: PayloadAction<{ pageNumber: number; extractions: Extraction[] }>
    ) => {
      const { pageNumber, extractions } = action.payload;
      if (state.session?.pageStates[pageNumber]) {
        state.session.pageStates[pageNumber].extractions = extractions;
      }
    },

    updateExtraction: (
      state,
      action: PayloadAction<{
        pageNumber: number;
        extractionId: string;
        updates: Partial<Extraction>;
      }>
    ) => {
      const { pageNumber, extractionId, updates } = action.payload;
      if (state.session?.pageStates[pageNumber]) {
        const extractions = state.session.pageStates[pageNumber].extractions;
        const index = extractions.findIndex((e) => e.id === extractionId);
        if (index !== -1) {
          extractions[index] = { ...extractions[index], ...updates };
        }
      }
    },

    // ==========================================
    // Draft Layer
    // ==========================================

    applyDraft: (
      state,
      action: PayloadAction<{
        pageNumber: number;
        extractionEdit?: ExtractionEdit;
        proposedStatus?: PageStatus;
      }>
    ) => {
      const { pageNumber, extractionEdit, proposedStatus } = action.payload;

      if (!state.drafts[pageNumber]) {
        state.drafts[pageNumber] = {
          pageNumber,
          extractionEdits: {},
          annotations: [],
          modifiedAt: new Date(),
        };
      }

      if (extractionEdit) {
        state.drafts[pageNumber].extractionEdits[extractionEdit.extractionId] =
          extractionEdit;
      }

      if (proposedStatus) {
        state.drafts[pageNumber].proposedStatus = proposedStatus;
      }

      state.drafts[pageNumber].modifiedAt = new Date();
    },

    commitDraft: (state, action: PayloadAction<number>) => {
      const pageNumber = action.payload;
      const draft = state.drafts[pageNumber];

      if (draft && state.session?.pageStates[pageNumber]) {
        // Merge draft to committed state
        state.session.pageStates[pageNumber] = mergeDraft(
          state.session.pageStates[pageNumber],
          draft
        );

        // Mark as committed
        state.session.pageStates[pageNumber].committedAt = new Date();

        // Remove draft
        delete state.drafts[pageNumber];
      }
    },

    discardDraft: (state, action: PayloadAction<number>) => {
      delete state.drafts[action.payload];
    },

    clearAllDrafts: (state) => {
      state.drafts = {};
    },

    // ==========================================
    // Ghost Overlay
    // ==========================================

    showGhost: (state, action: PayloadAction<GhostOverlay>) => {
      state.ghostOverlay = action.payload;
    },

    hideGhost: (state) => {
      state.ghostOverlay = null;
    },

    updateGhost: (state, action: PayloadAction<Partial<GhostOverlay>>) => {
      if (state.ghostOverlay) {
        state.ghostOverlay = { ...state.ghostOverlay, ...action.payload };
      }
    },

    // ==========================================
    // Permission Flow
    // ==========================================

    requestPermission: (state, action: PayloadAction<PermissionRequest>) => {
      state.pendingPermission = action.payload;
      state.isProcessing = false; // Pause processing while waiting for permission
    },

    resolvePermission: (state, action: PayloadAction<PermissionResponse>) => {
      const response = action.payload;

      // Append permission response to event log
      state.events.push({
        id: generateId(),
        timestamp: new Date(),
        sessionId: state.session?.id || '',
        kind: 'observation',
        type: response.approved ? 'human_response' : 'permission_denied',
        actionId: state.pendingPermission?.id || '',
        success: response.approved,
        payload: {
          response: response.userComment || (response.approved ? 'approved' : 'denied'),
          action: response.approved ? 'approved' : 'rejected',
        },
      } as Observation);

      state.pendingPermission = null;
    },

    clearPendingPermission: (state) => {
      state.pendingPermission = null;
    },

    // ==========================================
    // Replay Mode
    // ==========================================

    enterReplayMode: (state, action: PayloadAction<{ eventIndex?: number }>) => {
      state.replayMode = {
        currentIndex: action.payload.eventIndex || 0,
        isPlaying: false,
        playbackSpeed: 1,
      };
    },

    exitReplayMode: (state) => {
      state.replayMode = null;
    },

    seekToEvent: (state, action: PayloadAction<number>) => {
      if (state.replayMode) {
        state.replayMode.currentIndex = action.payload;
      }
    },

    setReplayPlaying: (state, action: PayloadAction<boolean>) => {
      if (state.replayMode) {
        state.replayMode.isPlaying = action.payload;
      }
    },

    setReplaySpeed: (state, action: PayloadAction<number>) => {
      if (state.replayMode) {
        state.replayMode.playbackSpeed = action.payload;
      }
    },

    stepReplayForward: (state) => {
      if (state.replayMode && state.replayMode.currentIndex < state.events.length - 1) {
        state.replayMode.currentIndex += 1;
      }
    },

    stepReplayBackward: (state) => {
      if (state.replayMode && state.replayMode.currentIndex > 0) {
        state.replayMode.currentIndex -= 1;
      }
    },

    // ==========================================
    // Loading & Error States
    // ==========================================

    setProcessing: (state, action: PayloadAction<boolean>) => {
      state.isProcessing = action.payload;
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },

    // ==========================================
    // Session Restoration (for persistence)
    // ==========================================

    restoreSession: (
      state,
      action: PayloadAction<{
        session: VerificationSession;
        events: VerificationEvent[];
        drafts: Record<number, PageDraft>;
      }>
    ) => {
      state.session = action.payload.session;
      state.events = action.payload.events;
      state.drafts = action.payload.drafts;
      state.error = null;
    },

    // ==========================================
    // Reset
    // ==========================================

    resetVerification: () => initialState,
  },
});

// ============================================
// Export Actions and Reducer
// ============================================

export const {
  // Session lifecycle
  startSession,
  setStartingSession,
  pauseSession,
  resumeSession,
  endSession,
  cancelSession,

  // Events
  appendEvent,
  appendAction,
  appendObservation,

  // Navigation
  navigateToPage,

  // Page state
  updatePageStatus,
  setPageExtractions,
  updateExtraction,

  // Drafts
  applyDraft,
  commitDraft,
  discardDraft,
  clearAllDrafts,

  // Ghost overlay
  showGhost,
  hideGhost,
  updateGhost,

  // Permissions
  requestPermission,
  resolvePermission,
  clearPendingPermission,

  // Replay
  enterReplayMode,
  exitReplayMode,
  seekToEvent,
  setReplayPlaying,
  setReplaySpeed,
  stepReplayForward,
  stepReplayBackward,

  // Loading/Error
  setProcessing,
  setError,

  // Restoration
  restoreSession,

  // Reset
  resetVerification,
} = verificationSlice.actions;

export default verificationSlice.reducer;
