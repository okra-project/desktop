/**
 * History Modal Component
 *
 * Displays verification audit trail for a document.
 * Adapted from okrapdf/components/review/HistoryModal.tsx for desktop.
 */

import React from 'react';
import type { VerificationHistoryEntry } from '../../store/desktopApi';

// ============================================================================
// Types
// ============================================================================

export interface HistoryModalProps {
  open: boolean;
  onClose: () => void;
  history: VerificationHistoryEntry[] | undefined;
  isLoading?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function HistoryModal({ open, onClose, history, isLoading }: HistoryModalProps) {
  if (!open) return null;

  return (
    <div style={styles.overlay}>
      {/* Backdrop */}
      <div style={styles.backdrop} onClick={onClose} />

      {/* Modal */}
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Verification History</h2>
          <button onClick={onClose} style={styles.closeButton}>
            ✕
          </button>
        </div>

        <div style={styles.content}>
          {isLoading ? (
            <div style={styles.emptyState}>
              <span style={styles.spinner}>⏳</span>
              <span>Loading history...</span>
            </div>
          ) : !history?.length ? (
            <div style={styles.emptyState}>
              No verification history yet
            </div>
          ) : (
            <div style={styles.list}>
              {history.map((entry) => (
                <HistoryEntry key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// History Entry Component
// ============================================================================

function HistoryEntry({ entry }: { entry: VerificationHistoryEntry }) {
  const getStateStyle = (state: string): React.CSSProperties => {
    if (state === 'reviewed' || state === 'verified') {
      return { backgroundColor: '#d1fae5', color: '#059669' };
    }
    if (state === 'flagged') {
      return { backgroundColor: '#fef3c7', color: '#d97706' };
    }
    if (state === 'rejected') {
      return { backgroundColor: '#fee2e2', color: '#dc2626' };
    }
    return { backgroundColor: '#f1f5f9', color: '#475569' };
  };

  const getEntityIcon = (entityType: string): string => {
    if (entityType === 'page') return '📄';
    if (entityType === 'table') return '▤';
    return '●';
  };

  return (
    <div style={styles.entry}>
      {/* Icon/Avatar */}
      {entry.triggeredByImage ? (
        <img
          src={entry.triggeredByImage}
          alt={entry.triggeredByName || 'User'}
          style={styles.avatar}
        />
      ) : (
        <div style={styles.iconContainer}>
          <span style={styles.entityIcon}>{getEntityIcon(entry.entityType)}</span>
        </div>
      )}

      {/* Content */}
      <div style={styles.entryContent}>
        <div style={styles.entryHeader}>
          {entry.triggeredByName && (
            <span style={styles.userName}>{entry.triggeredByName}</span>
          )}
          <span style={styles.entityLabel}>
            {entry.entityType === 'page' ? `Page ${entry.pageNum}` : entry.entityType}
          </span>
          <span style={styles.arrow}>→</span>
          <span style={{ ...styles.stateBadge, ...getStateStyle(entry.state) }}>
            {entry.resolution || entry.state}
          </span>
        </div>

        {entry.reason && (
          <p style={styles.reason}>{entry.reason}</p>
        )}

        <p style={styles.timestamp}>
          {new Date(entry.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modal: {
    position: 'relative',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    maxWidth: '640px',
    width: 'calc(100% - 32px)',
    maxHeight: '80vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1e293b',
    margin: 0,
  },
  closeButton: {
    padding: '4px 8px',
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#64748b',
    fontSize: '14px',
  },
  content: {
    overflow: 'auto',
    flex: 1,
    padding: '16px',
  },
  emptyState: {
    textAlign: 'center',
    fontSize: '13px',
    color: '#64748b',
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  spinner: {
    fontSize: '24px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  entry: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    fontSize: '13px',
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
  },
  iconContainer: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  entityIcon: {
    fontSize: '14px',
    color: '#475569',
  },
  entryContent: {
    flex: 1,
    minWidth: 0,
  },
  entryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  userName: {
    fontWeight: 500,
    color: '#334155',
  },
  entityLabel: {
    color: '#64748b',
  },
  arrow: {
    color: '#94a3b8',
  },
  stateBadge: {
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
  },
  reason: {
    fontSize: '12px',
    color: '#64748b',
    margin: '4px 0 0 0',
  },
  timestamp: {
    fontSize: '11px',
    color: '#94a3b8',
    margin: '4px 0 0 0',
  },
};

export default HistoryModal;
