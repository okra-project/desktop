/**
 * BboxOverlay Component
 *
 * Renders bounding boxes from OCR providers on top of PDF pages.
 * Supports multiple providers for comparison mode.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { ENTITY_COLORS } from '../lib/entity-colors';
import type { OcrBoundingBox, OcrProviderId } from '../hooks/useOcrProviders';

// ============================================================================
// Types
// ============================================================================

interface BboxOverlayProps {
  /** Bounding boxes to render */
  bboxes: OcrBoundingBox[];
  /** Page width in pixels */
  pageWidth: number;
  /** Page height in pixels */
  pageHeight: number;
  /** Provider ID for styling/labeling */
  providerId?: OcrProviderId;
  /** Whether bboxes are normalized (0-1) or absolute */
  normalized?: boolean;
  /** Filter by bbox type */
  showTypes?: OcrBoundingBox['type'][];
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Callback when a bbox is clicked */
  onBboxClick?: (bbox: OcrBoundingBox, index: number) => void;
  /** Callback when hovering over a bbox */
  onBboxHover?: (bbox: OcrBoundingBox | null, index: number | null) => void;
  /** Selected bbox index */
  selectedIndex?: number | null;
  /** Show confidence as opacity */
  showConfidence?: boolean;
  /** Show labels on bboxes */
  showLabels?: boolean;
  /** Comparison mode: show provider indicator */
  comparisonMode?: boolean;
}

// Provider colors for comparison mode
const PROVIDER_COLORS: Record<string, { border: string; fill: string }> = {
  'google-docai': {
    border: 'rgba(66, 133, 244, 0.9)', // Google blue
    fill: 'rgba(66, 133, 244, 0.12)',
  },
  openrouter: {
    border: 'rgba(139, 92, 246, 0.9)', // Purple
    fill: 'rgba(139, 92, 246, 0.12)',
  },
  docling: {
    border: 'rgba(34, 197, 94, 0.9)', // Green
    fill: 'rgba(34, 197, 94, 0.12)',
  },
  marker: {
    border: 'rgba(249, 115, 22, 0.9)', // Orange
    fill: 'rgba(249, 115, 22, 0.12)',
  },
};

export const BboxOverlay = React.memo(
  function BboxOverlay({
    bboxes,
    pageWidth,
    pageHeight,
    providerId,
    normalized = true,
    showTypes,
    minConfidence = 0,
    onBboxClick,
    onBboxHover,
    selectedIndex,
    showConfidence = true,
    showLabels = true,
    comparisonMode = false,
  }: BboxOverlayProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    // Filter bboxes by type and confidence
    const filteredBboxes = useMemo(() => {
      return bboxes.filter((bbox) => {
        // Filter by type
        if (
          showTypes &&
          showTypes.length > 0 &&
          !showTypes.includes(bbox.type)
        ) {
          return false;
        }
        // Filter by confidence
        if (
          minConfidence > 0 &&
          bbox.confidence !== undefined &&
          bbox.confidence < minConfidence
        ) {
          return false;
        }
        return true;
      });
    }, [bboxes, showTypes, minConfidence]);

    // Convert vertices to rectangle dimensions
    const getRect = useCallback(
      (bbox: OcrBoundingBox) => {
        if (!bbox.vertices || bbox.vertices.length < 4) {
          return null;
        }

        const xs = bbox.vertices.map((v) => v.x);
        const ys = bbox.vertices.map((v) => v.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);

        if (normalized) {
          return {
            left: minX * pageWidth,
            top: minY * pageHeight,
            width: (maxX - minX) * pageWidth,
            height: (maxY - minY) * pageHeight,
          };
        }

        return {
          left: minX,
          top: minY,
          width: maxX - minX,
          height: maxY - minY,
        };
      },
      [pageWidth, pageHeight, normalized],
    );

    // Get colors for a bbox
    const getColors = useCallback(
      (bbox: OcrBoundingBox) => {
        if (comparisonMode && providerId && PROVIDER_COLORS[providerId]) {
          return PROVIDER_COLORS[providerId];
        }

        const entityColor =
          ENTITY_COLORS[bbox.type as keyof typeof ENTITY_COLORS];
        if (entityColor) {
          return { border: entityColor.border, fill: entityColor.fill };
        }

        // Default fallback
        return {
          border: 'rgba(100, 116, 139, 0.7)',
          fill: 'rgba(100, 116, 139, 0.08)',
        };
      },
      [comparisonMode, providerId],
    );

    // Handle bbox click
    const handleClick = useCallback(
      (bbox: OcrBoundingBox, index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        onBboxClick?.(bbox, index);
      },
      [onBboxClick],
    );

    // Handle bbox hover
    const handleMouseEnter = useCallback(
      (bbox: OcrBoundingBox, index: number) => {
        setHoveredIndex(index);
        onBboxHover?.(bbox, index);
      },
      [onBboxHover],
    );

    const handleMouseLeave = useCallback(() => {
      setHoveredIndex(null);
      onBboxHover?.(null, null);
    }, [onBboxHover]);

    if (filteredBboxes.length === 0) {
      return null;
    }

    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ width: pageWidth, height: pageHeight }}
      >
        {filteredBboxes.map((bbox, index) => {
          const rect = getRect(bbox);
          if (!rect) return null;

          const colors = getColors(bbox);
          const isSelected = selectedIndex === index;
          const isHovered = hoveredIndex === index;
          const opacity =
            showConfidence && bbox.confidence !== undefined
              ? 0.3 + bbox.confidence * 0.7
              : 1;

          return (
            <div
              key={bbox.blockId ?? `bbox-${index}`}
              className="absolute pointer-events-auto cursor-pointer transition-all duration-150"
              style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                border: `2px solid ${colors.border}`,
                backgroundColor: colors.fill,
                opacity,
                borderRadius: 2,
                boxShadow:
                  isSelected || isHovered
                    ? `0 0 0 2px ${colors.border}, 0 4px 12px rgba(0,0,0,0.15)`
                    : undefined,
                transform: isHovered ? 'scale(1.01)' : undefined,
                zIndex: isSelected ? 20 : isHovered ? 10 : 1,
              }}
              onClick={(e) => handleClick(bbox, index, e)}
              onMouseEnter={() => handleMouseEnter(bbox, index)}
              onMouseLeave={handleMouseLeave}
            >
              {/* Label */}
              {showLabels && (isHovered || isSelected) && (
                <div
                  className="absolute -top-6 left-0 px-1.5 py-0.5 text-[10px] font-medium rounded whitespace-nowrap shadow-sm"
                  style={{
                    backgroundColor: colors.border.replace(/[\d.]+\)$/, '1)'),
                    color: 'white',
                  }}
                >
                  {bbox.type}
                  {bbox.confidence !== undefined && (
                    <span className="ml-1 opacity-75">
                      {Math.round(bbox.confidence * 100)}%
                    </span>
                  )}
                  {comparisonMode && providerId && (
                    <span className="ml-1 opacity-75">({providerId})</span>
                  )}
                </div>
              )}

              {/* Text preview on hover */}
              {isHovered && bbox.text && (
                <div
                  className="absolute top-full left-0 mt-1 p-2 bg-white rounded shadow-lg border border-slate-200 text-xs text-slate-700 max-w-xs z-30"
                  style={{ maxHeight: 120, overflow: 'auto' }}
                >
                  {bbox.text.slice(0, 200)}
                  {bbox.text.length > 200 && '...'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.pageWidth === next.pageWidth &&
      prev.pageHeight === next.pageHeight &&
      prev.providerId === next.providerId &&
      prev.selectedIndex === next.selectedIndex &&
      prev.bboxes.length === next.bboxes.length &&
      prev.bboxes.every((b, i) => b.blockId === next.bboxes[i]?.blockId)
    );
  },
);

interface BboxComparisonOverlayProps {
  providerBboxes: Record<OcrProviderId, OcrBoundingBox[]>;
  pageWidth: number;
  pageHeight: number;
  selectedProviders?: OcrProviderId[];
  showTypes?: OcrBoundingBox['type'][];
}

export function BboxComparisonOverlay({
  providerBboxes,
  pageWidth,
  pageHeight,
  selectedProviders,
  showTypes,
}: BboxComparisonOverlayProps) {
  const providers = selectedProviders ?? Object.keys(providerBboxes);

  return (
    <div className="relative" style={{ width: pageWidth, height: pageHeight }}>
      {providers.map((providerId) => {
        const bboxes = providerBboxes[providerId];
        if (!bboxes) return null;

        return (
          <BboxOverlay
            key={providerId}
            bboxes={bboxes}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            providerId={providerId}
            showTypes={showTypes}
            comparisonMode={providers.length > 1}
            showLabels={true}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// Provider Legend (for comparison mode)
// ============================================================================

interface ProviderLegendProps {
  providers: OcrProviderId[];
  onToggle?: (providerId: OcrProviderId, enabled: boolean) => void;
  enabledProviders?: OcrProviderId[];
}

export function ProviderLegend({
  providers,
  onToggle,
  enabledProviders,
}: ProviderLegendProps) {
  return (
    <div className="flex flex-wrap gap-2 p-2 bg-white rounded-lg shadow-sm border border-slate-200">
      {providers.map((providerId) => {
        const colors = PROVIDER_COLORS[providerId] ?? {
          border: '#64748b',
          fill: '#f1f5f9',
        };
        const isEnabled =
          !enabledProviders || enabledProviders.includes(providerId);

        return (
          <button
            key={providerId}
            onClick={() => onToggle?.(providerId, !isEnabled)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-all ${
              isEnabled ? 'opacity-100' : 'opacity-40'
            }`}
            style={{
              borderWidth: 2,
              borderColor: colors.border,
              backgroundColor: isEnabled ? colors.fill : 'transparent',
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: colors.border }}
            />
            {providerId}
          </button>
        );
      })}
    </div>
  );
}

export default BboxOverlay;
