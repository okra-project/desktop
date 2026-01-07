/**
 * useGhostOverlay Hook
 *
 * React hook for managing ghost overlays in the verification UI.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import {
  showGhost,
  hideGhost,
  updateGhost,
} from '../store/verification/slice';
import {
  selectGhostOverlay,
  selectPermissionLevel,
} from '../store/verification/selectors';
import {
  markGhostShown,
  markGhostHidden,
} from '../services/sessionRecorder';
import type { GhostOverlay, GhostType, PageStatus } from '../../shared/types/verification';
import { generateId } from '../../shared/types/verification';

// ============================================
// Hook
// ============================================

export function useGhostOverlay() {
  const dispatch = useAppDispatch();

  // Selectors
  const ghost = useAppSelector(selectGhostOverlay);
  const permissionLevel = useAppSelector(selectPermissionLevel);

  // Local state for countdown
  const [countdown, setCountdown] = useState<number | null>(null);

  // ==========================================
  // Ghost Lifecycle
  // ==========================================

  /**
   * Show a ghost overlay
   */
  const show = useCallback(
    (config: {
      type: GhostType;
      pageNumber: number;
      reasoning: string;
      confidence?: number;
      fieldName?: string;
      currentValue?: unknown;
      proposedValue?: unknown;
      proposedStatus?: PageStatus;
      boundingBox?: { x: number; y: number; width: number; height: number };
      autoCommitDelay?: number;
    }) => {
      const overlay: GhostOverlay = {
        id: generateId(),
        type: config.type,
        pageNumber: config.pageNumber,
        timestamp: new Date(),
        autoCommitDelay: permissionLevel === 'yolo' ? config.autoCommitDelay || 2000 : undefined,
        boundingBox: config.boundingBox,
        content: {
          reasoning: config.reasoning,
          confidence: config.confidence,
          fieldName: config.fieldName,
          currentValue: config.currentValue,
          proposedValue: config.proposedValue,
          proposedStatus: config.proposedStatus,
        },
      };

      dispatch(showGhost(overlay));

      // Record in session
      markGhostShown(
        config.fieldName || config.type,
        config.proposedValue || config.proposedStatus,
        config.confidence
      );

      // Start countdown if in YOLO mode
      if (overlay.autoCommitDelay) {
        setCountdown(overlay.autoCommitDelay);
      }

      return overlay.id;
    },
    [dispatch, permissionLevel]
  );

  /**
   * Hide the current ghost overlay
   */
  const hide = useCallback(() => {
    dispatch(hideGhost());
    markGhostHidden();
    setCountdown(null);
  }, [dispatch]);

  /**
   * Update the current ghost overlay
   */
  const update = useCallback(
    (updates: Partial<GhostOverlay>) => {
      dispatch(updateGhost(updates));
    },
    [dispatch]
  );

  // ==========================================
  // Countdown Timer
  // ==========================================

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 100) {
          return null;
        }
        return prev - 100;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [countdown]);

  // ==========================================
  // Convenience Methods
  // ==========================================

  /**
   * Show a field correction ghost
   */
  const showFieldCorrection = useCallback(
    (config: {
      pageNumber: number;
      fieldName: string;
      currentValue: unknown;
      proposedValue: unknown;
      reasoning: string;
      confidence?: number;
      boundingBox?: { x: number; y: number; width: number; height: number };
    }) => {
      return show({
        type: 'field_correction',
        ...config,
      });
    },
    [show]
  );

  /**
   * Show a status change ghost
   */
  const showStatusChange = useCallback(
    (config: {
      pageNumber: number;
      proposedStatus: PageStatus;
      reasoning: string;
      confidence?: number;
    }) => {
      return show({
        type: 'status_change',
        ...config,
      });
    },
    [show]
  );

  /**
   * Show a thinking ghost
   */
  const showThinking = useCallback(
    (pageNumber: number, reasoning: string) => {
      return show({
        type: 'thinking',
        pageNumber,
        reasoning,
      });
    },
    [show]
  );

  /**
   * Show a navigation ghost
   */
  const showNavigation = useCallback(
    (fromPage: number, toPage: number) => {
      return show({
        type: 'navigation',
        pageNumber: toPage,
        reasoning: `Navigating from page ${fromPage} to page ${toPage}`,
      });
    },
    [show]
  );

  // ==========================================
  // IPC Event Listeners
  // ==========================================

  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    const handleShowGhost = (ghostOverlay: GhostOverlay) => {
      dispatch(showGhost(ghostOverlay));
      if (ghostOverlay.autoCommitDelay) {
        setCountdown(ghostOverlay.autoCommitDelay);
      }
    };

    const handleHideGhost = () => {
      dispatch(hideGhost());
      setCountdown(null);
    };

    window.electron.ipcRenderer.on('verification:ghost-show', handleShowGhost);
    window.electron.ipcRenderer.on('verification:ghost-hide', handleHideGhost);

    return () => {
      // Cleanup
    };
  }, [dispatch]);

  // ==========================================
  // Return Value
  // ==========================================

  return {
    // State
    ghost,
    isVisible: ghost !== null,
    countdown,
    isCountingDown: countdown !== null && countdown > 0,
    countdownSeconds: countdown !== null ? Math.ceil(countdown / 1000) : null,

    // Actions
    show,
    hide,
    update,

    // Convenience methods
    showFieldCorrection,
    showStatusChange,
    showThinking,
    showNavigation,
  };
}

export default useGhostOverlay;
