/**
 * Table Verification Panel
 *
 * Side-by-side view of PDF source and extracted table.
 * Supports edit mode, AI suggestions, and keyboard shortcuts.
 * Adapted from okrapdf/components/review/TableVerificationPanel.tsx for desktop.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { ExtractedTable, PageContent } from '../../store/desktopApi';
import { useGetTableHistoryQuery } from '../../store/desktopApi';

// ============================================================================
// Types
// ============================================================================

export interface TableVerificationPanelProps {
  table: ExtractedTable;
  pageContent: PageContent | null;
  isLoadingContent?: boolean;
  onClose: () => void;
  onVerify: () => Promise<void>;
  onFlag: () => Promise<void>;
  onReject: () => Promise<void>;
  onFixAndAccept?: (correctedMarkdown: string) => Promise<void>;
  isUpdating?: boolean;
  jobId?: string;
  // Queue navigation
  currentIndex?: number;
  totalCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  // Entity metadata
  entityTitle?: string | null;
  entitySchema?: string[];
}

type ViewMode = 'preview' | 'edit';

const STATUS_CONFIG = {
  pending: { icon: '○', color: '#3b82f6', bgColor: '#dbeafe', label: 'Pending' },
  verified: { icon: '✓', color: '#10b981', bgColor: '#d1fae5', label: 'Verified' },
  flagged: { icon: '🔴', color: '#f97316', bgColor: '#fed7aa', label: 'Flagged' },
  rejected: { icon: '✕', color: '#ef4444', bgColor: '#fee2e2', label: 'Rejected' },
};

// ============================================================================
// Main Component
// ============================================================================

export function TableVerificationPanel({
  table,
  pageContent,
  isLoadingContent,
  onClose,
  onVerify,
  onFlag,
  onReject,
  onFixAndAccept,
  isUpdating,
  jobId,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  entityTitle,
  entitySchema,
}: TableVerificationPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [actionInProgress, setActionInProgress] = useState<'verify' | 'flag' | 'reject' | 'fix' | null>(null);
  const [editedMarkdown, setEditedMarkdown] = useState(table.markdown);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch table history
  const { data: historyData } = useGetTableHistoryQuery(table.id, {
    skip: !table.id || table.id.startsWith('synthetic-'),
  });

  // Check if synthetic table
  const isSyntheticTable = !table.markdown.trim() ||
    table.markdown.includes('not extracted yet') ||
    !table.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

  // For synthetic tables, show full page content
  const fullPageMarkdown = pageContent?.content ?? null;

  // Reset edited markdown when table changes
  useEffect(() => {
    const initialContent = isSyntheticTable && fullPageMarkdown
      ? fullPageMarkdown
      : table.markdown;
    setEditedMarkdown(initialContent);
  }, [table.id, table.markdown, isSyntheticTable, fullPageMarkdown]);

  const statusConfig = STATUS_CONFIG[table.verification_status];
  const hasEdits = editedMarkdown.trim() !== table.markdown.trim();

  // Action handlers
  const handleAction = useCallback(
    async (action: 'verify' | 'flag' | 'reject' | 'fix', handler: () => Promise<void>) => {
      setActionInProgress(action);
      try {
        await handler();
      } finally {
        setActionInProgress(null);
      }
    },
    []
  );

  const handleFixAndAccept = useCallback(async () => {
    if (!onFixAndAccept || !hasEdits) return;
    await handleAction('fix', () => onFixAndAccept(editedMarkdown));
  }, [onFixAndAccept, hasEdits, editedMarkdown, handleAction]);

  const handleResetEdits = useCallback(() => {
    setEditedMarkdown(table.markdown);
  }, [table.markdown]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when editing
      if (viewMode === 'edit' && e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          setViewMode('preview');
        }
        return;
      }

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'v' && !e.metaKey && !e.ctrlKey && !actionInProgress) {
        if (hasEdits && onFixAndAccept) {
          handleFixAndAccept();
        } else {
          handleAction('verify', onVerify);
        }
      } else if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !actionInProgress) {
        handleAction('flag', onFlag);
      } else if (e.key === 'e' && !e.metaKey && !e.ctrlKey) {
        setViewMode(viewMode === 'edit' ? 'preview' : 'edit');
      } else if (e.key === '[' && !e.metaKey && !e.ctrlKey && hasPrev && onPrev) {
        onPrev();
      } else if (e.key === ']' && !e.metaKey && !e.ctrlKey && hasNext && onNext) {
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onVerify, onFlag, handleAction, handleFixAndAccept, actionInProgress, viewMode, hasEdits, onFixAndAccept, hasPrev, hasNext, onPrev, onNext]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (viewMode === 'edit' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [viewMode]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          zIndex: 40,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '800px',
          maxWidth: '90vw',
          backgroundColor: '#fff',
          boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
          borderLeft: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 50,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Queue navigation */}
            {typeof currentIndex === 'number' && typeof totalCount === 'number' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '8px' }}>
                <button
                  onClick={onPrev}
                  disabled={!hasPrev}
                  style={{
                    padding: '4px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: hasPrev ? '#475569' : '#cbd5e1',
                    cursor: hasPrev ? 'pointer' : 'not-allowed',
                  }}
                  title="Previous table ([)"
                >
                  ◀
                </button>
                <span style={{ fontSize: '11px', color: '#64748b', minWidth: '60px', textAlign: 'center' }}>
                  {currentIndex + 1} / {totalCount}
                </span>
                <button
                  onClick={onNext}
                  disabled={!hasNext}
                  style={{
                    padding: '4px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: hasNext ? '#475569' : '#cbd5e1',
                    cursor: hasNext ? 'pointer' : 'not-allowed',
                  }}
                  title="Next table (])"
                >
                  ▶
                </button>
              </div>
            )}

            <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', margin: 0 }}>
              Table - Page {table.page_number}
            </h2>

            {/* Status badge */}
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 500,
                backgroundColor: statusConfig.bgColor,
                color: statusConfig.color,
              }}
            >
              {statusConfig.icon} {statusConfig.label}
            </span>

            {/* Edited badge */}
            {hasEdits && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 500,
                  backgroundColor: '#fef3c7',
                  color: '#b45309',
                }}
              >
                ✎ Edited
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* View mode toggle */}
            <div
              style={{
                display: 'flex',
                backgroundColor: '#f1f5f9',
                borderRadius: '6px',
                padding: '2px',
              }}
            >
              <ViewModeButton
                active={viewMode === 'preview'}
                onClick={() => setViewMode('preview')}
                label="Preview"
              />
              <ViewModeButton
                active={viewMode === 'edit'}
                onClick={() => setViewMode('edit')}
                label="Edit"
                shortcut="E"
              />
            </div>

            <button
              onClick={onClose}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Extraction header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              backgroundColor: '#f8fafc',
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', margin: 0 }}>
                {isSyntheticTable ? 'Page Content' : 'Extracted Table'}
              </h3>
              {isSyntheticTable && fullPageMarkdown && (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor: '#dbeafe',
                    color: '#2563eb',
                  }}
                >
                  Full page
                </span>
              )}
            </div>

            {hasEdits && (
              <button
                onClick={handleResetEdits}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                ↺ Reset
              </button>
            )}
          </div>

          {/* Main content area */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {viewMode === 'edit' ? (
              <textarea
                ref={textareaRef}
                value={editedMarkdown}
                onChange={(e) => setEditedMarkdown(e.target.value)}
                placeholder="Edit table markdown..."
                style={{
                  width: '100%',
                  height: '100%',
                  padding: '16px',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  backgroundColor: '#fff',
                }}
              />
            ) : (
              <div style={{ padding: '16px' }}>
                <MarkdownPreview content={editedMarkdown} />
              </div>
            )}
          </div>

          {/* OCR Blocks reference (collapsible) */}
          {pageContent && pageContent.blocks && pageContent.blocks.length > 0 && (
            <details style={{ borderTop: '1px solid #e2e8f0' }}>
              <summary
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#f8fafc',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                OCR Blocks Reference ({pageContent.blocks.length} blocks)
              </summary>
              <div
                style={{
                  maxHeight: '160px',
                  overflow: 'auto',
                  padding: '12px',
                  backgroundColor: '#f8fafc',
                }}
              >
                {pageContent.blocks.map((block, idx) => (
                  <OcrBlockItem key={idx} block={block} index={idx} />
                ))}
              </div>
            </details>
          )}

          {/* History timeline (collapsible) */}
          {historyData && historyData.entries.length > 0 && (
            <details style={{ borderTop: '1px solid #e2e8f0' }}>
              <summary
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#f8fafc',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                📋 History ({historyData.entries.length} events)
              </summary>
              <div
                style={{
                  maxHeight: '192px',
                  overflow: 'auto',
                  padding: '12px',
                  backgroundColor: '#f8fafc',
                }}
              >
                {historyData.entries.map((entry) => (
                  <HistoryEntry key={entry.id} entry={entry} />
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
          }}
        >
          {/* Keyboard hints */}
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            <kbd style={kbdStyle}>V</kbd> Verify
            <span style={{ margin: '0 8px' }}>·</span>
            <kbd style={kbdStyle}>F</kbd> Flag
            <span style={{ margin: '0 8px' }}>·</span>
            <kbd style={kbdStyle}>E</kbd> Edit
            <span style={{ margin: '0 8px' }}>·</span>
            <kbd style={kbdStyle}>[</kbd><kbd style={kbdStyle}>]</kbd> Nav
            <span style={{ margin: '0 8px' }}>·</span>
            <kbd style={kbdStyle}>Esc</kbd> Close
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ActionButton
              onClick={() => handleAction('reject', onReject)}
              disabled={isUpdating || !!actionInProgress}
              loading={actionInProgress === 'reject'}
              color="red"
              icon="✕"
              label="Reject"
            />
            <ActionButton
              onClick={() => handleAction('flag', onFlag)}
              disabled={isUpdating || !!actionInProgress}
              loading={actionInProgress === 'flag'}
              color="orange"
              icon="🔴"
              label="Flag"
            />

            {hasEdits && onFixAndAccept ? (
              <ActionButton
                onClick={handleFixAndAccept}
                disabled={isUpdating || !!actionInProgress}
                loading={actionInProgress === 'fix'}
                color="blue"
                icon="✓"
                label="Fix & Accept"
                primary
              />
            ) : (
              <ActionButton
                onClick={() => handleAction('verify', onVerify)}
                disabled={isUpdating || !!actionInProgress}
                loading={actionInProgress === 'verify'}
                color="emerald"
                icon="✓"
                label="Verify"
                primary
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

const kbdStyle: React.CSSProperties = {
  padding: '2px 6px',
  backgroundColor: '#e2e8f0',
  borderRadius: '4px',
  fontSize: '10px',
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
};

function ViewModeButton({
  active,
  onClick,
  label,
  shortcut,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  shortcut?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        borderRadius: '4px',
        border: 'none',
        backgroundColor: active ? '#fff' : 'transparent',
        color: active ? '#334155' : '#64748b',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
        cursor: 'pointer',
        fontSize: '11px',
        fontWeight: 500,
        transition: 'all 0.15s',
      }}
    >
      {label}
      {shortcut && (
        <span style={{ fontSize: '9px', opacity: 0.5, fontFamily: 'ui-monospace' }}>{shortcut}</span>
      )}
    </button>
  );
}

function ActionButton({
  onClick,
  disabled,
  loading,
  color,
  icon,
  label,
  primary,
}: {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  color: 'emerald' | 'orange' | 'red' | 'blue';
  icon: string;
  label: string;
  primary?: boolean;
}) {
  const colors = {
    emerald: { bg: '#10b981', hover: '#059669', text: '#fff', border: '#10b981' },
    orange: { bg: 'transparent', hover: '#fff7ed', text: '#ea580c', border: '#fed7aa' },
    red: { bg: 'transparent', hover: '#fef2f2', text: '#dc2626', border: '#fecaca' },
    blue: { bg: '#2563eb', hover: '#1d4ed8', text: '#fff', border: '#2563eb' },
  };

  const c = colors[color];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '6px',
        border: `1px solid ${c.border}`,
        backgroundColor: primary ? c.bg : 'transparent',
        color: primary ? c.text : c.text,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '13px',
        fontWeight: 500,
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s',
      }}
    >
      {loading ? '⏳' : icon}
      {label}
    </button>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  // Simple markdown table rendering
  const lines = content.split('\n');

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: '14px', lineHeight: 1.6 }}>
      {lines.map((line, idx) => {
        // Table row
        if (line.trim().startsWith('|')) {
          const cells = line.split('|').filter(Boolean).map(c => c.trim());
          const isHeaderSep = cells.every(c => /^[-:]+$/.test(c));

          if (isHeaderSep) return null;

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: idx === 0 ? '#f8fafc' : 'transparent',
              }}
            >
              {cells.map((cell, cidx) => (
                <div
                  key={cidx}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRight: cidx < cells.length - 1 ? '1px solid #e2e8f0' : 'none',
                    fontWeight: idx === 0 ? 600 : 400,
                  }}
                >
                  {cell}
                </div>
              ))}
            </div>
          );
        }

        // Regular text
        if (line.trim()) {
          return (
            <p key={idx} style={{ margin: '8px 0' }}>
              {line}
            </p>
          );
        }

        return null;
      })}
    </div>
  );
}

function OcrBlockItem({ block, index }: { block: { text: string }; index: number }) {
  return (
    <div
      style={{
        fontSize: '11px',
        backgroundColor: '#fff',
        borderRadius: '4px',
        padding: '8px',
        border: '1px solid #f1f5f9',
        marginBottom: '6px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <span style={{ color: '#94a3b8', fontFamily: 'ui-monospace', fontSize: '10px', marginTop: '2px' }}>
          #{index + 1}
        </span>
        <p
          style={{
            flex: 1,
            color: '#475569',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {block.text}
        </p>
      </div>
    </div>
  );
}

const HISTORY_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  verified: { bg: '#d1fae5', text: '#059669' },
  flagged: { bg: '#fed7aa', text: '#ea580c' },
  rejected: { bg: '#fee2e2', text: '#dc2626' },
  pending: { bg: '#dbeafe', text: '#2563eb' },
};

function HistoryEntry({ entry }: { entry: {
  id: string;
  created_at: string;
  state: string;
  previous_state: string | null;
  transition_name: string | null;
  reason: string;
  was_corrected: boolean;
} }) {
  const timeAgo = useMemo(() => {
    const date = new Date(entry.created_at);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }, [entry.created_at]);

  const stateColor = HISTORY_STATUS_COLORS[entry.state] ?? { bg: '#f1f5f9', text: '#475569' };
  const actionLabel = entry.transition_name
    ? entry.transition_name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : entry.state;

  return (
    <div
      style={{
        fontSize: '11px',
        backgroundColor: '#fff',
        borderRadius: '4px',
        padding: '8px',
        border: '1px solid #f1f5f9',
        marginBottom: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 500,
              backgroundColor: stateColor.bg,
              color: stateColor.text,
            }}
          >
            {actionLabel}
          </span>
          {entry.was_corrected && (
            <span
              style={{
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 500,
                backgroundColor: '#f3e8ff',
                color: '#9333ea',
              }}
            >
              corrected
            </span>
          )}
        </div>
        <span style={{ color: '#94a3b8', fontSize: '10px', whiteSpace: 'nowrap' }}>{timeAgo}</span>
      </div>
      {entry.reason && entry.reason !== 'Status update' && (
        <p
          style={{
            marginTop: '4px',
            color: '#64748b',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {entry.reason}
        </p>
      )}
    </div>
  );
}
