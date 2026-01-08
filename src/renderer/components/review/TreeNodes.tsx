/**
 * Document Tree Components for Review Tab
 *
 * Displays hierarchical page/entity tree with status indicators.
 * Adapted from okrapdf/components/review/TreeNodes.tsx for desktop.
 *
 * Updated to match web's simplified PageNode pattern (Jan 2026):
 * - Compact: status icon + page number + inline entity counts
 * - No expand/collapse (flat list)
 * - Left-aligned entity counts
 */

import React from 'react';
import type { VerificationPageStatus, Entity } from '../../store/desktopApi';

// ============================================================================
// Status Configuration
// ============================================================================

export const STATUS_CONFIG: Record<
  VerificationPageStatus,
  { icon: string; color: string; bgColor: string; label: string }
> = {
  complete: { icon: '✓', color: '#10b981', bgColor: '#d1fae5', label: 'verified' },
  partial: { icon: '◐', color: '#f59e0b', bgColor: '#fef3c7', label: 'partial' },
  flagged: { icon: '🔴', color: '#f97316', bgColor: '#fed7aa', label: 'flagged' },
  pending: { icon: '○', color: '#3b82f6', bgColor: '#dbeafe', label: 'pending' },
  empty: { icon: '−', color: '#94a3b8', bgColor: '#f1f5f9', label: 'empty' },
  gap: { icon: '!', color: '#ef4444', bgColor: '#fee2e2', label: 'gap' },
  error: { icon: '✕', color: '#ef4444', bgColor: '#fee2e2', label: 'error' },
};

const ENTITY_ICONS: Record<string, string> = {
  table: '▤',
  figure: '▣',
  footnote: '†',
  summary: '¶',
  paragraph: '≡',
};

const ENTITY_COLORS: Record<string, string> = {
  table: '#9333ea',
  figure: '#0891b2',
  footnote: '#d97706',
  summary: '#64748b',
  paragraph: '#475569',
};

// Page resolution choices (matching web)
const PageResolutionChoices = {
  REVIEWED: 'reviewed',
} as const;

// ============================================================================
// Page Node Component
// ============================================================================

export interface PageNodeProps {
  jobId: string;
  page: {
    page: number;
    status: VerificationPageStatus;
    total: number;
    verified: number;
    hasOcr: boolean;
    ocrLineCount: number;
    hasCoverageGaps: boolean;
    uncoveredCount: number;
    resolution: string | null;
    classification: string | null;
    isStale: boolean;
  };
  entities: Entity[];
  expanded: boolean;
  onToggle: () => void;
  onPreview?: () => void;
  isPreviewActive?: boolean;
  onEntityClick?: (entity: Entity) => void;
}

export function PageNode({
  jobId,
  page,
  entities,
  expanded,
  onToggle,
  onPreview,
  isPreviewActive,
  onEntityClick,
}: PageNodeProps) {
  const config = STATUS_CONFIG[page.status];
  const hasContent = entities.length > 0 || page.hasOcr;
  const hasResolution = page.resolution && page.resolution !== 'unresolved';

  const handleClick = () => {
    onToggle();
    onPreview?.();
  };

  return (
    <div style={{ padding: '2px 0' }}>
      {/* Page header */}
      <div
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 8px',
          marginLeft: '-8px',
          borderRadius: '4px',
          cursor: 'pointer',
          backgroundColor: isPreviewActive ? '#dbeafe' : (page.status === 'gap' && !hasResolution ? '#fee2e2' : 'transparent'),
          border: isPreviewActive ? '2px solid #60a5fa' : '2px solid transparent',
          transition: 'all 0.15s',
        }}
      >
        {/* Expand/collapse icon */}
        {hasContent ? (
          <span style={{ width: '16px', color: '#94a3b8', flexShrink: 0 }}>
            {expanded ? '▼' : '▶'}
          </span>
        ) : (
          <span style={{ width: '16px', flexShrink: 0 }} />
        )}

        {/* Status icon */}
        <span
          style={{
            width: '16px',
            height: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: config.color,
            fontWeight: 'bold',
            fontSize: '12px',
            flexShrink: 0,
          }}
        >
          {config.icon}
        </span>

        {/* Page info */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px', minWidth: 0 }}>
          <span style={{ color: '#334155', whiteSpace: 'nowrap' }}>Page {page.page}</span>
          <span style={{ fontSize: '11px', color: config.color, whiteSpace: 'nowrap' }}>[{config.label}]</span>
          {page.total > 0 && (
            <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
              {page.verified}/{page.total} verified
            </span>
          )}
        </div>

        {/* Gap indicator */}
        {page.hasCoverageGaps && !hasResolution && (
          <span style={{ fontSize: '11px', color: '#ef4444', marginLeft: 'auto', flexShrink: 0 }}>
            {page.uncoveredCount}
          </span>
        )}

        {/* Resolution badge */}
        {hasResolution && page.resolution !== 'reviewed' && (
          <span
            style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '4px',
              backgroundColor: page.isStale ? '#fef3c7' : '#f1f5f9',
              color: page.isStale ? '#b45309' : '#475569',
            }}
          >
            {page.resolution}
            {page.isStale && ' ↻'}
          </span>
        )}
      </div>

      {/* Expanded content */}
      {expanded && hasContent && (
        <div
          style={{
            marginLeft: '16px',
            marginTop: '4px',
            marginBottom: '8px',
            borderLeft: '1px solid #cbd5e1',
            paddingLeft: '8px',
          }}
        >
          {/* OCR info */}
          {page.hasOcr && (
            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📄</span>
              <span>{page.ocrLineCount} lines</span>
              {page.hasCoverageGaps && !hasResolution && (
                <span style={{ color: '#ef4444' }}>({page.uncoveredCount} uncovered)</span>
              )}
            </div>
          )}

          {/* Entities */}
          {entities.map((entity) => (
            <EntityNode
              key={entity.id}
              entity={entity}
              onClick={() => onEntityClick?.(entity)}
            />
          ))}

          {/* Gap warning */}
          {page.status === 'gap' && entities.length === 0 && (
            <div style={{ padding: '8px 0' }}>
              <div style={{ fontSize: '11px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚠</span>
                <span>This page has OCR content but no extracted entities</span>
              </div>
            </div>
          )}

          {/* Stale warning */}
          {page.isStale && hasResolution && (
            <div
              style={{
                fontSize: '11px',
                color: '#b45309',
                padding: '4px 8px',
                backgroundColor: '#fef3c7',
                borderRadius: '4px',
                marginTop: '4px',
              }}
            >
              ↻ Resolution is stale - entities changed since last review
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Entity Node Component
// ============================================================================

export interface EntityNodeProps {
  entity: Entity;
  onClick?: () => void;
}

export function EntityNode({ entity, onClick }: EntityNodeProps) {
  const icon = ENTITY_ICONS[entity.type] ?? '▪';
  const color = ENTITY_COLORS[entity.type] ?? '#64748b';
  const isClickable = !!onClick && entity.type === 'table';

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        fontSize: '11px',
        padding: '2px 6px',
        margin: '0 -6px',
        borderRadius: '4px',
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'background-color 0.15s',
      }}
      onMouseEnter={(e) => isClickable && (e.currentTarget.style.backgroundColor = '#f1f5f9')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <span style={{ color, marginTop: '2px', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ color, flexShrink: 0 }}>.{entity.type}</span>
          {entity.title && (
            <span
              style={{
                color: '#64748b',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={entity.title}
            >
              "{entity.title}"
            </span>
          )}
        </div>
        {entity.schema && entity.schema.length > 0 && (
          <div
            style={{
              color: '#94a3b8',
              marginTop: '2px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            schema: [{entity.schema.slice(0, 5).join(', ')}
            {entity.schema.length > 5 ? `, +${entity.schema.length - 5}` : ''}]
          </div>
        )}
      </div>
      {isClickable && (
        <span style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px', flexShrink: 0 }}>
          click to verify
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Simple Page Node Component (Web-style compact)
// ============================================================================

export interface SimplePageNodeProps {
  page: {
    page: number;
    status: VerificationPageStatus;
    resolution: string | null;
  };
  entityCounts?: { tables: number; figures: number; footnotes: number };
  onPreview?: () => void;
  isPreviewActive?: boolean;
  isFilteredOut?: boolean;
}

/**
 * Simplified page node matching web pattern:
 * - CheckCircle (verified) or Circle (pending) icon
 * - Page number
 * - Inline entity counts with icons
 */
export function SimplePageNode({
  page,
  entityCounts,
  onPreview,
  isPreviewActive,
  isFilteredOut,
}: SimplePageNodeProps) {
  const isVerified = page.resolution === PageResolutionChoices.REVIEWED;
  const hasEntities = entityCounts && (
    entityCounts.tables > 0 || entityCounts.figures > 0 || entityCounts.footnotes > 0
  );

  return (
    <div
      onClick={onPreview}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 6px',
        borderRadius: '4px',
        cursor: 'pointer',
        backgroundColor: isPreviewActive ? '#eff6ff' : 'transparent',
        opacity: isFilteredOut ? 0.3 : 1,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!isPreviewActive) e.currentTarget.style.backgroundColor = '#f1f5f9';
      }}
      onMouseLeave={(e) => {
        if (!isPreviewActive) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {/* Status icon */}
      <span
        style={{
          fontSize: '14px',
          color: isVerified ? '#10b981' : '#cbd5e1',
          flexShrink: 0,
        }}
      >
        {isVerified ? '✓' : '○'}
      </span>

      {/* Page number */}
      <span style={{ fontSize: '12px', color: '#475569', flexShrink: 0 }}>
        {page.page}
      </span>

      {/* Entity counts - inline */}
      {hasEntities && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', flexShrink: 0 }}>
          {entityCounts.tables > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px' }}>
              <span style={{ color: '#9333ea' }}>▤</span>{entityCounts.tables}
            </span>
          )}
          {entityCounts.figures > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px' }}>
              <span style={{ color: '#0891b2' }}>▣</span>{entityCounts.figures}
            </span>
          )}
          {entityCounts.footnotes > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px' }}>
              <span style={{ color: '#d97706' }}>†</span>{entityCounts.footnotes}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
