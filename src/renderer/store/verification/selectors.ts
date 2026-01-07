/**
 * Verification Selectors
 *
 * Memoized selectors for efficient state access.
 */

import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../index';
import type {
  VerificationSession,
  VerificationEvent,
  PageVerificationState,
  Extraction,
  GhostOverlay,
  PermissionRequest,
  ReplayState,
  PageDraft,
  Action,
  Observation,
} from '../../../shared/types/verification';

// ============================================
// Basic Selectors
// ============================================

export const selectVerificationState = (state: RootState) => state.verification;

export const selectSession = (state: RootState): VerificationSession | null =>
  state.verification.session;

export const selectEvents = (state: RootState): VerificationEvent[] =>
  state.verification.events;

export const selectDrafts = (state: RootState): Record<number, PageDraft> =>
  state.verification.drafts;

export const selectGhostOverlay = (state: RootState): GhostOverlay | null =>
  state.verification.ghostOverlay;

export const selectPendingPermission = (state: RootState): PermissionRequest | null =>
  state.verification.pendingPermission;

export const selectReplayMode = (state: RootState): ReplayState | null =>
  state.verification.replayMode;

export const selectIsProcessing = (state: RootState): boolean =>
  state.verification.isProcessing;

export const selectIsStartingSession = (state: RootState): boolean =>
  state.verification.isStartingSession;

export const selectError = (state: RootState): string | null =>
  state.verification.error;

// ============================================
// Session Selectors
// ============================================

export const selectSessionStatus = createSelector(
  [selectSession],
  (session) => session?.status || null
);

export const selectSessionId = createSelector(
  [selectSession],
  (session) => session?.id || null
);

export const selectCurrentPageIndex = createSelector(
  [selectSession],
  (session) => session?.currentPageIndex || 1
);

export const selectTotalPages = createSelector(
  [selectSession],
  (session) => session?.totalPages || 0
);

export const selectPermissionLevel = createSelector(
  [selectSession],
  (session) => session?.permissionLevel || 'edit'
);

export const selectAgentType = createSelector(
  [selectSession],
  (session) => session?.agentType || 'claude-code'
);

export const selectIsSessionActive = createSelector(
  [selectSession],
  (session) => session?.status === 'active'
);

// ============================================
// Page State Selectors
// ============================================

export const selectPageStates = createSelector(
  [selectSession],
  (session) => session?.pageStates || {}
);

export const selectCurrentPageState = createSelector(
  [selectSession, selectCurrentPageIndex],
  (session, currentPage): PageVerificationState | null => {
    return session?.pageStates[currentPage] || null;
  }
);

export const selectPageStateByNumber = (pageNumber: number) =>
  createSelector([selectSession], (session): PageVerificationState | null => {
    return session?.pageStates[pageNumber] || null;
  });

export const selectPagesApproved = createSelector(
  [selectPageStates],
  (pageStates): number => {
    return Object.values(pageStates).filter((p) => p.status === 'approved').length;
  }
);

export const selectPagesRejected = createSelector(
  [selectPageStates],
  (pageStates): number => {
    return Object.values(pageStates).filter((p) => p.status === 'rejected').length;
  }
);

export const selectPagesPending = createSelector(
  [selectPageStates],
  (pageStates): number => {
    return Object.values(pageStates).filter((p) => p.status === 'pending').length;
  }
);

export const selectPagesInReview = createSelector(
  [selectPageStates],
  (pageStates): number => {
    return Object.values(pageStates).filter((p) => p.status === 'in_review').length;
  }
);

export const selectVerificationProgress = createSelector(
  [selectPagesApproved, selectPagesRejected, selectTotalPages],
  (approved, rejected, total): number => {
    if (total === 0) return 0;
    return Math.round(((approved + rejected) / total) * 100);
  }
);

// ============================================
// Extraction Selectors
// ============================================

export const selectCurrentPageExtractions = createSelector(
  [selectCurrentPageState],
  (pageState): Extraction[] => {
    return pageState?.extractions || [];
  }
);

export const selectExtractionsByPage = (pageNumber: number) =>
  createSelector([selectPageStateByNumber(pageNumber)], (pageState): Extraction[] => {
    return pageState?.extractions || [];
  });

export const selectAllExtractions = createSelector(
  [selectPageStates],
  (pageStates): Extraction[] => {
    return Object.values(pageStates).flatMap((p) => p.extractions);
  }
);

export const selectVerifiedExtractions = createSelector(
  [selectAllExtractions],
  (extractions): Extraction[] => {
    return extractions.filter((e) => e.status === 'verified' || e.status === 'corrected');
  }
);

export const selectUnverifiedExtractions = createSelector(
  [selectAllExtractions],
  (extractions): Extraction[] => {
    return extractions.filter((e) => e.status === 'unverified');
  }
);

// ============================================
// Event Selectors
// ============================================

export const selectEventCount = createSelector(
  [selectEvents],
  (events): number => events.length
);

export const selectActions = createSelector(
  [selectEvents],
  (events): Action[] => {
    return events.filter((e): e is Action => e.kind === 'action');
  }
);

export const selectObservations = createSelector(
  [selectEvents],
  (events): Observation[] => {
    return events.filter((e): e is Observation => e.kind === 'observation');
  }
);

export const selectRecentEvents = (count: number = 10) =>
  createSelector([selectEvents], (events): VerificationEvent[] => {
    return events.slice(-count);
  });

export const selectLastEvent = createSelector(
  [selectEvents],
  (events): VerificationEvent | null => {
    return events.length > 0 ? events[events.length - 1] : null;
  }
);

export const selectEventsAfterIndex = (index: number) =>
  createSelector([selectEvents], (events): VerificationEvent[] => {
    return events.slice(index);
  });

// ============================================
// Draft Selectors
// ============================================

export const selectHasDrafts = createSelector(
  [selectDrafts],
  (drafts): boolean => Object.keys(drafts).length > 0
);

export const selectDraftCount = createSelector(
  [selectDrafts],
  (drafts): number => Object.keys(drafts).length
);

export const selectDraftForPage = (pageNumber: number) =>
  createSelector([selectDrafts], (drafts): PageDraft | null => {
    return drafts[pageNumber] || null;
  });

export const selectCurrentPageDraft = createSelector(
  [selectDrafts, selectCurrentPageIndex],
  (drafts, currentPage): PageDraft | null => {
    return drafts[currentPage] || null;
  }
);

export const selectHasUnsavedChanges = createSelector(
  [selectHasDrafts],
  (hasDrafts): boolean => hasDrafts
);

// ============================================
// Replay Selectors
// ============================================

export const selectIsInReplayMode = createSelector(
  [selectReplayMode],
  (replayMode): boolean => replayMode !== null
);

export const selectReplayIndex = createSelector(
  [selectReplayMode],
  (replayMode): number => replayMode?.currentIndex || 0
);

export const selectReplayIsPlaying = createSelector(
  [selectReplayMode],
  (replayMode): boolean => replayMode?.isPlaying || false
);

export const selectReplaySpeed = createSelector(
  [selectReplayMode],
  (replayMode): number => replayMode?.playbackSpeed || 1
);

export const selectCurrentReplayEvent = createSelector(
  [selectEvents, selectReplayIndex],
  (events, index): VerificationEvent | null => {
    return events[index] || null;
  }
);

// ============================================
// Combined Selectors
// ============================================

export const selectVerificationSummary = createSelector(
  [
    selectSession,
    selectPagesApproved,
    selectPagesRejected,
    selectPagesPending,
    selectEventCount,
    selectVerificationProgress,
  ],
  (session, approved, rejected, pending, eventCount, progress) => ({
    sessionId: session?.id || null,
    status: session?.status || null,
    documentName: session?.documentName || null,
    pagesApproved: approved,
    pagesRejected: rejected,
    pagesPending: pending,
    totalPages: session?.totalPages || 0,
    eventCount,
    progressPercent: progress,
  })
);

export const selectUIState = createSelector(
  [
    selectGhostOverlay,
    selectPendingPermission,
    selectIsProcessing,
    selectIsInReplayMode,
    selectError,
  ],
  (ghost, permission, processing, replay, error) => ({
    hasGhostOverlay: ghost !== null,
    ghostOverlay: ghost,
    hasPendingPermission: permission !== null,
    pendingPermission: permission,
    isProcessing: processing,
    isInReplayMode: replay,
    error,
  })
);
