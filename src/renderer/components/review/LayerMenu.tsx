/**
 * Layer Menu Component for Review Tab
 *
 * Dropdown menu for toggling entity overlay visibility.
 * Adapted from okrapdf/components/review/LayerMenu.tsx for desktop.
 */

import React from 'react';

// ============================================================================
// Entity Colors (matching web)
// ============================================================================

const ENTITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  table: { bg: '#9333ea', border: '#9333ea', text: '#9333ea' },
  figure: { bg: '#0891b2', border: '#0891b2', text: '#0891b2' },
  footnote: { bg: '#d97706', border: '#d97706', text: '#d97706' },
  ocr: { bg: '#64748b', border: '#64748b', text: '#64748b' },
};

const LAYER_ICONS: Record<string, string> = {
  table: '▤',
  figure: '▣',
  footnote: '†',
  ocr: '▭',
};

const LAYER_LABELS: Record<string, string> = {
  table: 'Tables',
  figure: 'Figures',
  footnote: 'Footnotes',
  ocr: 'OCR blocks',
};

// ============================================================================
// Layer Option Component
// ============================================================================

interface LayerOptionProps {
  layer: string;
  active: boolean;
  onClick: () => void;
}

function LayerOption({ layer, active, onClick }: LayerOptionProps) {
  const color = ENTITY_COLORS[layer] ?? ENTITY_COLORS.ocr;
  const icon = LAYER_ICONS[layer] ?? '▪';
  const label = LAYER_LABELS[layer] ?? layer;

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '6px 12px',
        textAlign: 'left',
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: '#334155',
        backgroundColor: 'transparent',
        border: 'none',
        cursor: 'pointer',
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {/* Checkbox */}
      <div
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '4px',
          border: `2px solid ${active ? color.border : '#cbd5e1'}`,
          backgroundColor: active ? color.bg : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {active && (
          <span style={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}>✓</span>
        )}
      </div>
      {/* Icon */}
      <span style={{ color: color.text, fontSize: '14px' }}>{icon}</span>
      {/* Label */}
      <span>{label}</span>
    </button>
  );
}

// ============================================================================
// Layer Menu Component
// ============================================================================

export interface LayerMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibleLayers: Set<string>;
  onToggleLayer: (layer: string) => void;
}

export function LayerMenu({
  open,
  onOpenChange,
  visibleLayers,
  onToggleLayer,
}: LayerMenuProps) {
  const activeCount = visibleLayers.size;

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => onOpenChange(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer',
          border: '1px solid #e2e8f0',
          backgroundColor: '#fff',
          color: '#475569',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fff')}
        title="Toggle overlay layers"
      >
        {/* Layers icon */}
        <span style={{ fontSize: '14px' }}>⧉</span>
        <span>Layers</span>
        {/* Count badge */}
        <span
          style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '9999px',
            backgroundColor: activeCount > 0 ? '#dbeafe' : '#f1f5f9',
            color: activeCount > 0 ? '#2563eb' : '#64748b',
            fontWeight: 600,
          }}
        >
          {activeCount}
        </span>
        {/* Chevron */}
        <span style={{ fontSize: '10px', color: '#94a3b8' }}>▼</span>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998,
            }}
            onClick={() => onOpenChange(false)}
          />
          {/* Menu */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
              padding: '4px 0',
              zIndex: 9999,
              minWidth: '150px',
            }}
          >
            <LayerOption
              layer="table"
              active={visibleLayers.has('table')}
              onClick={() => onToggleLayer('table')}
            />
            <LayerOption
              layer="figure"
              active={visibleLayers.has('figure')}
              onClick={() => onToggleLayer('figure')}
            />
            <LayerOption
              layer="footnote"
              active={visibleLayers.has('footnote')}
              onClick={() => onToggleLayer('footnote')}
            />
            {/* Separator */}
            <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />
            <LayerOption
              layer="ocr"
              active={visibleLayers.has('ocr')}
              onClick={() => onToggleLayer('ocr')}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default LayerMenu;
