/**
 * usePermissions Hook
 *
 * React hook for managing permission requests in the verification UI.
 */

import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import {
  requestPermission,
  resolvePermission,
  clearPendingPermission,
} from '../store/verification/slice';
import {
  selectPendingPermission,
  selectPermissionLevel,
  selectSessionId,
} from '../store/verification/selectors';
import {
  markPermissionRequested,
  markUserApproved,
  markUserRejected,
} from '../services/sessionRecorder';
import type {
  PermissionRequest,
  PermissionResponse,
  AgentAction,
  PermissionLevel,
} from '../../shared/types/verification';
import { generateId, requiresPermission } from '../../shared/types/verification';

// ============================================
// Hook
// ============================================

export function usePermissions() {
  const dispatch = useAppDispatch();

  // Selectors
  const pendingPermission = useAppSelector(selectPendingPermission);
  const permissionLevel = useAppSelector(selectPermissionLevel);
  const sessionId = useAppSelector(selectSessionId);

  // ==========================================
  // Permission Checks
  // ==========================================

  /**
   * Check if an action requires permission
   */
  const checkPermission = useCallback(
    (actionType: AgentAction['type']): boolean => {
      return requiresPermission(actionType, permissionLevel);
    },
    [permissionLevel]
  );

  /**
   * Check if we're in YOLO mode
   */
  const isYoloMode = permissionLevel === 'yolo';

  // ==========================================
  // Permission Requests
  // ==========================================

  /**
   * Create a permission request
   */
  const request = useCallback(
    (config: {
      action: AgentAction;
      pageNumber: number;
      reasoning: string;
      extractionId?: string;
    }) => {
      const permRequest: PermissionRequest = {
        id: generateId(),
        sessionId: sessionId || '',
        timestamp: new Date(),
        action: config.action,
        context: {
          pageNumber: config.pageNumber,
          reasoning: config.reasoning,
        },
        status: 'pending',
      };

      dispatch(requestPermission(permRequest));
      markPermissionRequested(config.action.type, {
        pageNumber: config.pageNumber,
      });

      return permRequest.id;
    },
    [dispatch, sessionId]
  );

  // ==========================================
  // Permission Responses
  // ==========================================

  /**
   * Approve the pending permission
   */
  const approve = useCallback(
    (comment?: string) => {
      if (!pendingPermission) return;

      const response: PermissionResponse = {
        requestId: pendingPermission.id,
        approved: true,
        userComment: comment,
      };

      // Send to main process
      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.sendMessage('verification:permission-response', response);
      }

      dispatch(resolvePermission(response));
      markUserApproved(pendingPermission.id);
    },
    [dispatch, pendingPermission]
  );

  /**
   * Deny the pending permission
   */
  const deny = useCallback(
    (reason?: string) => {
      if (!pendingPermission) return;

      const response: PermissionResponse = {
        requestId: pendingPermission.id,
        approved: false,
        userComment: reason,
      };

      // Send to main process
      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.sendMessage('verification:permission-response', response);
      }

      dispatch(resolvePermission(response));
      markUserRejected(pendingPermission.id, reason);
    },
    [dispatch, pendingPermission]
  );

  /**
   * Approve with modifications
   */
  const approveWithModification = useCallback(
    (modifiedAction: AgentAction, comment?: string) => {
      if (!pendingPermission) return;

      const response: PermissionResponse = {
        requestId: pendingPermission.id,
        approved: true,
        modifiedAction,
        userComment: comment,
      };

      // Send to main process
      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.sendMessage('verification:permission-response', response);
      }

      dispatch(resolvePermission(response));
      markUserApproved(pendingPermission.id);
    },
    [dispatch, pendingPermission]
  );

  /**
   * Clear the pending permission without response
   */
  const clear = useCallback(() => {
    dispatch(clearPendingPermission());
  }, [dispatch]);

  // ==========================================
  // IPC Event Listeners
  // ==========================================

  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    const handlePermissionRequest = (request: PermissionRequest) => {
      dispatch(requestPermission(request));
      markPermissionRequested(request.action.type, {
        pageNumber: request.context.pageNumber,
      });
    };

    window.electron.ipcRenderer.on('verification:permission-request', handlePermissionRequest);

    return () => {
      // Cleanup
    };
  }, [dispatch]);

  // ==========================================
  // Return Value
  // ==========================================

  return {
    // State
    pendingPermission,
    hasPending: pendingPermission !== null,
    permissionLevel,
    isYoloMode,

    // Checks
    checkPermission,

    // Actions
    request,
    approve,
    deny,
    approveWithModification,
    clear,
  };
}

export default usePermissions;
