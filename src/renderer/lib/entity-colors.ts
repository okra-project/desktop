/**
 * Shared color definitions for entity types (tables, figures, footnotes, summaries, ocr)
 * Used by PDF overlays, filter UI, and layers dropdown to ensure visual consistency
 * Ported from okrapdf/lib/entity-colors.ts
 */

export const ENTITY_COLORS = {
  ocr: {
    hex: '#f59e0b',      // amber-500
    border: 'rgba(245, 158, 11, 0.9)',
    fill: 'rgba(245, 158, 11, 0.15)',
  },
  table: {
    hex: '#3b82f6',      // blue-500
    border: 'rgba(59, 130, 246, 0.9)',
    fill: 'rgba(59, 130, 246, 0.15)',
  },
  figure: {
    hex: '#22c55e',      // green-500
    border: 'rgba(34, 197, 94, 0.9)',
    fill: 'rgba(34, 197, 94, 0.15)',
  },
  footnote: {
    hex: '#6b7280',      // gray-500
    border: 'rgba(107, 114, 128, 0.9)',
    fill: 'rgba(107, 114, 128, 0.15)',
  },
  summary: {
    hex: '#a855f7',      // purple-500
    border: 'rgba(168, 85, 247, 0.9)',
    fill: 'rgba(168, 85, 247, 0.15)',
  },
  signature: {
    hex: '#d97706',      // amber-600
    border: 'rgba(217, 119, 6, 0.9)',
    fill: 'rgba(217, 119, 6, 0.15)',
  },
  paragraph: {
    hex: '#64748b',      // slate-500
    border: 'rgba(100, 116, 139, 0.9)',
    fill: 'rgba(100, 116, 139, 0.15)',
  },
} as const;

export type EntityColorType = keyof typeof ENTITY_COLORS;
