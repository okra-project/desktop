/**
 * EntityActionPopover
 *
 * Context menu that appears when clicking on entity overlays in the PDF viewer.
 * Provides entity-specific quick actions that will trigger AI-powered analysis.
 */

import React, { useCallback, useEffect, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface EntityOverlayInfo {
  id: string;
  type: string;
  title: string | null;
  page: number;
}

export interface EntityAction {
  id: string;
  label: string;
  icon: string;
  prompt: string;
  autoSend: boolean;
}

export interface EntityActionPopoverProps {
  entity: EntityOverlayInfo;
  position: { x: number; y: number };
  onAction: (action: EntityAction, entity: EntityOverlayInfo) => void;
  onClose: () => void;
}

// ============================================================================
// Actions Configuration
// ============================================================================

const ENTITY_ACTIONS: Record<string, EntityAction[]> = {
  table: [
    {
      id: 'verify-schema',
      label: 'Verify table schema',
      icon: '☑',
      prompt:
        'Verify this table schema matches the source PDF. Check that all column headers are correct and data types are appropriate.',
      autoSend: true,
    },
  ],
  figure: [
    {
      id: 'describe',
      label: 'Describe this figure',
      icon: '💡',
      prompt: 'Please describe what is shown in this figure.',
      autoSend: true,
    },
  ],
  footnote: [
    {
      id: 'explain',
      label: 'Explain footnote',
      icon: '💡',
      prompt: 'Please explain this footnote in context.',
      autoSend: true,
    },
  ],
  paragraph: [
    {
      id: 'summarize',
      label: 'Summarize',
      icon: '💡',
      prompt: 'Please summarize this paragraph.',
      autoSend: true,
    },
  ],
  summary: [
    {
      id: 'review',
      label: 'Review summary',
      icon: '💡',
      prompt: 'Please review this summary for accuracy.',
      autoSend: true,
    },
  ],
  signature: [
    {
      id: 'verify',
      label: 'Verify signature',
      icon: '☑',
      prompt: 'Please verify this signature field.',
      autoSend: true,
    },
  ],
};

// ============================================================================
// Component
// ============================================================================

export function EntityActionPopover({
  entity,
  position,
  onAction,
  onClose,
}: EntityActionPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const actions = ENTITY_ACTIONS[entity.type] || [];

  const handleActionClick = useCallback(
    (action: EntityAction) => {
      onAction(action, entity);
      onClose();
    },
    [entity, onAction, onClose],
  );

  // Calculate position to keep popover in viewport
  const adjustedPosition = {
    left: Math.min(position.x, window.innerWidth - 280),
    top: Math.min(position.y, window.innerHeight - 200),
  };

  return (
    <>
      {/* Backdrop */}
      <div style={styles.backdrop} onClick={onClose} />

      {/* Popover */}
      <div
        ref={popoverRef}
        style={{
          ...styles.popover,
          left: adjustedPosition.left,
          top: adjustedPosition.top,
        }}
      >
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.entityType}>{entity.type.toUpperCase()}</span>
          <button onClick={onClose} style={styles.closeButton}>
            ×
          </button>
        </div>

        {/* Entity info */}
        {entity.title && (
          <div style={styles.entityInfo}>
            <span style={styles.entityTitle}>{entity.title}</span>
          </div>
        )}
        <div style={styles.entityMeta}>Page {entity.page}</div>

        {/* Divider */}
        <div style={styles.divider} />

        {/* Actions */}
        <div style={styles.actions}>
          {actions.length > 0 ? (
            actions.map((action) => (
              <button
                key={action.id}
                onClick={() => handleActionClick(action)}
                style={{
                  ...styles.actionButton,
                  ...(action.id === 'verify-schema'
                    ? styles.actionButtonPrimary
                    : {}),
                }}
              >
                <span style={styles.actionIcon}>{action.icon}</span>
                <span style={styles.actionLabel}>{action.label}</span>
                {action.autoSend && <span style={styles.autoBadge}>auto</span>}
              </button>
            ))
          ) : (
            <div style={styles.noActions}>No actions available</div>
          )}
        </div>

        {/* Footer note */}
        <div style={styles.footer}>Click action to send to Review Agent</div>
      </div>
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 999,
  },
  popover: {
    position: 'fixed',
    zIndex: 1000,
    width: '260px',
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  entityType: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#64748b',
    letterSpacing: '0.05em',
  },
  closeButton: {
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '16px',
    borderRadius: '4px',
  },
  entityInfo: {
    padding: '8px 12px 0',
  },
  entityTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#1e293b',
  },
  entityMeta: {
    padding: '4px 12px 8px',
    fontSize: '11px',
    color: '#94a3b8',
  },
  divider: {
    height: '1px',
    backgroundColor: '#e2e8f0',
    margin: '0 12px',
  },
  actions: {
    padding: '8px',
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 10px',
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: '6px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.15s ease',
  },
  actionButtonPrimary: {
    backgroundColor: '#eff6ff',
  },
  actionIcon: {
    fontSize: '14px',
  },
  actionLabel: {
    flex: 1,
    fontSize: '13px',
    color: '#334155',
  },
  autoBadge: {
    fontSize: '9px',
    padding: '2px 5px',
    borderRadius: '4px',
    backgroundColor: '#dbeafe',
    color: '#2563eb',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  noActions: {
    padding: '12px',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: '12px',
  },
  footer: {
    padding: '8px 12px',
    fontSize: '10px',
    color: '#94a3b8',
    textAlign: 'center',
    borderTop: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
  },
};

export default EntityActionPopover;
