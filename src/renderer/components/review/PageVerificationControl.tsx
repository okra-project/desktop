/**
 * Page Verification Control Component
 *
 * Toggle button to mark pages as verified/pending.
 * Adapted from okrapdf/components/review/PageVerificationControl.tsx for desktop.
 */

import React, { useCallback } from 'react';
import { useResolvePageStatusMutation } from '../../store/desktopApi';

// ============================================================================
// Constants
// ============================================================================

export const PageResolutionChoices = {
  UNRESOLVED: 'unresolved',
  REVIEWED: 'reviewed',
  INTENTIONAL_EMPTY: 'intentional_empty',
  NEEDS_REEXTRACTION: 'needs_reextraction',
  MANUALLY_ANNOTATED: 'manually_annotated',
  ACKNOWLEDGED: 'acknowledged',
} as const;

// ============================================================================
// Types
// ============================================================================

export interface PageVerificationControlProps {
  jobId: string;
  pageNum: number;
  currentResolution: string | null;
  isStale?: boolean;
  onResolved?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function PageVerificationControl({
  jobId,
  pageNum,
  currentResolution,
  isStale,
  onResolved,
}: PageVerificationControlProps) {
  const [resolvePageStatus, { isLoading }] = useResolvePageStatusMutation();

  const isVerified = currentResolution === PageResolutionChoices.REVIEWED;

  const handleToggle = useCallback(async () => {
    const newResolution = isVerified
      ? PageResolutionChoices.UNRESOLVED
      : PageResolutionChoices.REVIEWED;

    try {
      await resolvePageStatus({
        jobId,
        pageNum,
        resolution: newResolution,
      }).unwrap();
      onResolved?.();
    } catch (err) {
      console.error('Failed to update page status:', err);
    }
  }, [isVerified, jobId, pageNum, resolvePageStatus, onResolved]);

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '4px 8px',
    height: '28px',
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '6px',
    border: isVerified ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
    backgroundColor: isVerified ? '#d1fae5' : '#fff',
    color: isVerified ? '#059669' : '#475569',
    cursor: isLoading ? 'not-allowed' : 'pointer',
    opacity: isLoading ? 0.5 : 1,
    transition: 'all 0.15s',
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isLoading}
      style={buttonStyle}
      onMouseEnter={(e) => {
        if (!isLoading) {
          e.currentTarget.style.backgroundColor = isVerified ? '#a7f3d0' : '#f8fafc';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isVerified ? '#d1fae5' : '#fff';
      }}
    >
      {isLoading ? (
        <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
      ) : isVerified ? (
        <span>✓</span>
      ) : (
        <span>○</span>
      )}
      {isVerified ? 'Verified' : 'Pending'}
      {isStale && (
        <span style={{ color: '#d97706', fontSize: '10px' }}>↻</span>
      )}
    </button>
  );
}

export default PageVerificationControl;
