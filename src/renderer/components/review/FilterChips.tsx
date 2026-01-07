/**
 * Filter Chips for Review Tab
 *
 * Status and entity type filter badges.
 * Adapted from okrapdf/components/review/FilterChips.tsx for desktop.
 */

import React from 'react';

// ============================================================================
// Types
// ============================================================================

export type FilterColor = 'emerald' | 'amber' | 'red' | 'orange' | 'blue' | 'slate' | 'purple' | 'cyan';

const FILTER_COLORS: Record<FilterColor, { active: string; inactive: string }> = {
  emerald: { active: '#d1fae5', inactive: 'transparent' },
  amber: { active: '#fef3c7', inactive: 'transparent' },
  red: { active: '#fee2e2', inactive: 'transparent' },
  orange: { active: '#fed7aa', inactive: 'transparent' },
  blue: { active: '#dbeafe', inactive: 'transparent' },
  slate: { active: '#e2e8f0', inactive: 'transparent' },
  purple: { active: '#f3e8ff', inactive: 'transparent' },
  cyan: { active: '#cffafe', inactive: 'transparent' },
};

const FILTER_TEXT_COLORS: Record<FilterColor, string> = {
  emerald: '#059669',
  amber: '#d97706',
  red: '#dc2626',
  orange: '#ea580c',
  blue: '#2563eb',
  slate: '#475569',
  purple: '#9333ea',
  cyan: '#0891b2',
};

// ============================================================================
// Filter Badge Component
// ============================================================================

export interface FilterBadgeProps {
  label: string;
  count: number;
  color: FilterColor;
  active: boolean;
  onClick: () => void;
}

export function FilterBadge({ label, count, color, active, onClick }: FilterBadgeProps) {
  const bgColor = active ? FILTER_COLORS[color].active : FILTER_COLORS[color].inactive;
  const textColor = FILTER_TEXT_COLORS[color];

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '9999px',
        border: active ? `1px solid ${textColor}` : '1px solid transparent',
        backgroundColor: bgColor,
        color: textColor,
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontSize: '12px',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = FILTER_COLORS[color].active;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = FILTER_COLORS[color].inactive;
        }
      }}
    >
      <span style={{ fontWeight: 600 }}>{count}</span>
      <span style={{ color: active ? textColor : '#64748b' }}>{label}</span>
    </button>
  );
}

// ============================================================================
// Entity Filter Badge Component
// ============================================================================

export interface EntityFilterBadgeProps {
  icon: string;
  count: number;
  label: string;
  color: FilterColor;
  active: boolean;
  onClick: () => void;
}

export function EntityFilterBadge({ icon, count, label, color, active, onClick }: EntityFilterBadgeProps) {
  const bgColor = active ? FILTER_COLORS[color].active : FILTER_COLORS[color].inactive;
  const textColor = FILTER_TEXT_COLORS[color];

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '9999px',
        border: active ? `1px solid ${textColor}` : '1px solid transparent',
        backgroundColor: bgColor,
        color: textColor,
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontSize: '12px',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = FILTER_COLORS[color].active;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = FILTER_COLORS[color].inactive;
        }
      }}
    >
      <span>{icon}</span>
      <span style={{ fontWeight: 600 }}>{count}</span>
      <span style={{ color: active ? textColor : '#64748b' }}>{label}</span>
    </button>
  );
}

// ============================================================================
// Simple Filter Chip Component
// ============================================================================

export interface FilterChipProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon?: string;
}

export function FilterChip({ label, count, active, onClick, icon }: FilterChipProps) {
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
        backgroundColor: active ? '#1e293b' : 'transparent',
        color: active ? '#fff' : '#64748b',
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontSize: '11px',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = '#f1f5f9';
          e.currentTarget.style.color = '#334155';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = '#64748b';
        }
      }}
    >
      {icon && <span>{icon}</span>}
      <span style={{ fontWeight: 500 }}>{count}</span>
      <span>{label}</span>
    </button>
  );
}

// ============================================================================
// Filter Chips Row Component
// ============================================================================

export interface FilterChipsRowProps {
  summary: {
    complete: number;
    partial: number;
    flagged: number;
    pending: number;
    empty: number;
    gap: number;
  };
  entityCounts: {
    tables: number;
    figures: number;
    footnotes: number;
  };
  activeStatusFilter: string | null;
  activeEntityFilter: string | null;
  onStatusFilterChange: (status: string | null) => void;
  onEntityFilterChange: (entityType: string | null) => void;
}

export function FilterChipsRow({
  summary,
  entityCounts,
  activeStatusFilter,
  activeEntityFilter,
  onStatusFilterChange,
  onEntityFilterChange,
}: FilterChipsRowProps) {
  const handleClearAll = () => {
    onStatusFilterChange(null);
    onEntityFilterChange(null);
  };

  const hasActiveFilter = activeStatusFilter || activeEntityFilter;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Status filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
        <FilterBadge
          label="complete"
          count={summary.complete}
          color="emerald"
          active={activeStatusFilter === 'complete'}
          onClick={() => onStatusFilterChange(activeStatusFilter === 'complete' ? null : 'complete')}
        />
        <FilterBadge
          label="partial"
          count={summary.partial}
          color="amber"
          active={activeStatusFilter === 'partial'}
          onClick={() => onStatusFilterChange(activeStatusFilter === 'partial' ? null : 'partial')}
        />
        <FilterBadge
          label="flagged"
          count={summary.flagged}
          color="orange"
          active={activeStatusFilter === 'flagged'}
          onClick={() => onStatusFilterChange(activeStatusFilter === 'flagged' ? null : 'flagged')}
        />
        <FilterBadge
          label="pending"
          count={summary.pending}
          color="blue"
          active={activeStatusFilter === 'pending'}
          onClick={() => onStatusFilterChange(activeStatusFilter === 'pending' ? null : 'pending')}
        />
        <FilterBadge
          label="empty"
          count={summary.empty}
          color="slate"
          active={activeStatusFilter === 'empty'}
          onClick={() => onStatusFilterChange(activeStatusFilter === 'empty' ? null : 'empty')}
        />
        {summary.gap > 0 && (
          <FilterBadge
            label="gap"
            count={summary.gap}
            color="red"
            active={activeStatusFilter === 'gap'}
            onClick={() => onStatusFilterChange(activeStatusFilter === 'gap' ? null : 'gap')}
          />
        )}
      </div>

      {/* Entity filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
        <EntityFilterBadge
          icon="▤"
          label="tables"
          count={entityCounts.tables}
          color="purple"
          active={activeEntityFilter === 'table'}
          onClick={() => onEntityFilterChange(activeEntityFilter === 'table' ? null : 'table')}
        />
        <EntityFilterBadge
          icon="▣"
          label="figures"
          count={entityCounts.figures}
          color="cyan"
          active={activeEntityFilter === 'figure'}
          onClick={() => onEntityFilterChange(activeEntityFilter === 'figure' ? null : 'figure')}
        />
        <EntityFilterBadge
          icon="†"
          label="footnotes"
          count={entityCounts.footnotes}
          color="amber"
          active={activeEntityFilter === 'footnote'}
          onClick={() => onEntityFilterChange(activeEntityFilter === 'footnote' ? null : 'footnote')}
        />

        {/* Clear all */}
        {hasActiveFilter && (
          <button
            onClick={handleClearAll}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #e2e8f0',
              backgroundColor: 'transparent',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '11px',
              marginLeft: '8px',
            }}
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
