/**
 * useVerificationSession Hook
 *
 * React hook for managing verification sessions.
 */

import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import {
  startSession,
  setStartingSession,
  pauseSession,
  resumeSession,
  endSession,
  cancelSession,
  navigateToPage,
  updatePageStatus,
  setPageExtractions,
  appendAction,
  appendObservation,
  setError,
  resetVerification,
} from '../store/verification/slice';
import {
  selectSession,
  selectSessionStatus,
  selectIsSessionActive,
  selectCurrentPageIndex,
  selectTotalPages,
  selectVerificationProgress,
  selectVerificationSummary,
  selectIsStartingSession,
} from '../store/verification/selectors';
import {
  startRecording,
  stopRecording,
  markMilestone,
} from '../services/sessionRecorder';
import type {
  SessionConfig,
  PermissionLevel,
  AgentType,
  Action,
  Observation,
  PageStatus,
  Extraction,
} from '../../shared/types/verification';

// ============================================
// Hook
// ============================================

export function useVerificationSession() {
  const dispatch = useAppDispatch();

  // Selectors
  const session = useAppSelector(selectSession);
  const status = useAppSelector(selectSessionStatus);
  const isActive = useAppSelector(selectIsSessionActive);
  const currentPage = useAppSelector(selectCurrentPageIndex);
  const totalPages = useAppSelector(selectTotalPages);
  const progress = useAppSelector(selectVerificationProgress);
  const summary = useAppSelector(selectVerificationSummary);
  const isStarting = useAppSelector(selectIsStartingSession);

  // ==========================================
  // Session Lifecycle
  // ==========================================

  /**
   * Start a new verification session
   */
  const start = useCallback(
    async (config: {
      documentId: string;
      documentName: string;
      totalPages: number;
      permissionLevel?: PermissionLevel;
      agentType?: AgentType;
    }) => {
      dispatch(setStartingSession(true));

      try {
        const sessionConfig: SessionConfig = {
          documentId: config.documentId,
          documentName: config.documentName,
          totalPages: config.totalPages,
          permissionLevel: config.permissionLevel || 'edit',
          agentType: config.agentType || 'claude-code',
        };

        // Start session in main process
        const result = await window.electron.ipcRenderer.invoke(
          'verification:start-session',
          sessionConfig
        );

        if (result.success) {
          // Update Redux state
          dispatch(startSession(sessionConfig));

          // Start recording
          startRecording(result.session.id);
          markMilestone('session_started', { documentName: config.documentName });

          return { success: true, sessionId: result.session.id };
        } else {
          dispatch(setError(result.error));
          return { success: false, error: result.error };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        dispatch(setError(errorMessage));
        return { success: false, error: errorMessage };
      } finally {
        dispatch(setStartingSession(false));
      }
    },
    [dispatch]
  );

  /**
   * Pause the current session
   */
  const pause = useCallback(async () => {
    if (!session) return { success: false, error: 'No active session' };

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'verification:pause-session',
        session.id
      );

      if (result.success) {
        dispatch(pauseSession());
        markMilestone('session_paused');
      }

      return result;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }, [session, dispatch]);

  /**
   * Resume the current session
   */
  const resume = useCallback(async () => {
    if (!session) return { success: false, error: 'No active session' };

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'verification:resume-session',
        session.id
      );

      if (result.success) {
        dispatch(resumeSession());
        markMilestone('session_resumed');
      }

      return result;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }, [session, dispatch]);

  /**
   * End the current session
   */
  const end = useCallback(async () => {
    if (!session) return { success: false, error: 'No active session' };

    try {
      markMilestone('session_ending');

      // Stop recording
      const events = stopRecording();

      const result = await window.electron.ipcRenderer.invoke(
        'verification:end-session',
        session.id
      );

      if (result.success) {
        dispatch(endSession());
      }

      return { ...result, recordedEvents: events.length };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }, [session, dispatch]);

  /**
   * Cancel the current session without completing
   */
  const cancel = useCallback(async () => {
    if (!session) return { success: false, error: 'No active session' };

    try {
      stopRecording();

      const result = await window.electron.ipcRenderer.invoke(
        'verification:end-session',
        session.id
      );

      if (result.success) {
        dispatch(cancelSession());
      }

      return result;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }, [session, dispatch]);

  /**
   * Reset verification state
   */
  const reset = useCallback(() => {
    stopRecording();
    dispatch(resetVerification());
  }, [dispatch]);

  // ==========================================
  // Navigation
  // ==========================================

  /**
   * Navigate to a specific page
   */
  const goToPage = useCallback(
    (pageNumber: number) => {
      if (pageNumber < 1 || pageNumber > totalPages) return;
      dispatch(navigateToPage(pageNumber));
    },
    [dispatch, totalPages]
  );

  /**
   * Navigate to the next page
   */
  const nextPage = useCallback(() => {
    if (currentPage < totalPages) {
      dispatch(navigateToPage(currentPage + 1));
    }
  }, [dispatch, currentPage, totalPages]);

  /**
   * Navigate to the previous page
   */
  const prevPage = useCallback(() => {
    if (currentPage > 1) {
      dispatch(navigateToPage(currentPage - 1));
    }
  }, [dispatch, currentPage]);

  // ==========================================
  // Page State Updates
  // ==========================================

  /**
   * Update page status
   */
  const setPageStatus = useCallback(
    (pageNumber: number, status: PageStatus) => {
      dispatch(updatePageStatus({ pageNumber, status }));
    },
    [dispatch]
  );

  /**
   * Set extractions for a page
   */
  const setExtractions = useCallback(
    (pageNumber: number, extractions: Extraction[]) => {
      dispatch(setPageExtractions({ pageNumber, extractions }));
    },
    [dispatch]
  );

  // ==========================================
  // Event Handling
  // ==========================================

  /**
   * Add an action to the event stream
   */
  const addAction = useCallback(
    (action: Action) => {
      dispatch(appendAction(action));
    },
    [dispatch]
  );

  /**
   * Add an observation to the event stream
   */
  const addObservation = useCallback(
    (observation: Observation) => {
      dispatch(appendObservation(observation));
    },
    [dispatch]
  );

  // ==========================================
  // IPC Event Listeners
  // ==========================================

  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    // Listen for events from main process
    const handleEvent = (event: Observation) => {
      dispatch(appendObservation(event));
    };

    const handlePageStatus = (data: { pageNumber: number; status: PageStatus }) => {
      dispatch(updatePageStatus(data));
    };

    const handleNavigate = (pageNumber: number) => {
      dispatch(navigateToPage(pageNumber));
    };

    // Set up listeners
    window.electron.ipcRenderer.on('verification:event', handleEvent);
    window.electron.ipcRenderer.on('verification:page-status', handlePageStatus);
    window.electron.ipcRenderer.on('verification:navigate', handleNavigate);

    return () => {
      // Cleanup listeners
      // Note: electron-builder's preload may not support removeListener
    };
  }, [dispatch]);

  // ==========================================
  // Return Value
  // ==========================================

  return {
    // State
    session,
    status,
    isActive,
    isStarting,
    currentPage,
    totalPages,
    progress,
    summary,

    // Session lifecycle
    start,
    pause,
    resume,
    end,
    cancel,
    reset,

    // Navigation
    goToPage,
    nextPage,
    prevPage,

    // Page state
    setPageStatus,
    setExtractions,

    // Events
    addAction,
    addObservation,
  };
}

export default useVerificationSession;
