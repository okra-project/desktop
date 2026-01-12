import React, { useMemo } from 'react';
import { useAppSelector } from '../store';
import {
  selectQueryResults,
  selectFocusedIndex,
  selectHasActiveQuery,
} from '../store/querySlice';
import { selectCurrentPage, selectWorkspacePath } from '../store/viewerSlice';
import type { QueryResultItem } from '../../shared/types/query';

interface QueryResultsOverlayProps {
  containerWidth: number;
  containerHeight: number;
  pageWidth: number;
  pageHeight: number;
  offsetX?: number;
  offsetY?: number;
  workspaceId?: string;
}

const RESULT_COLOR = 'rgba(255, 193, 7, 0.3)';
const RESULT_BORDER = 'rgba(255, 193, 7, 0.8)';
const FOCUSED_COLOR = 'rgba(76, 175, 80, 0.4)';
const FOCUSED_BORDER = 'rgba(76, 175, 80, 1)';

function extractWorkspaceIdFromPath(path: string | null): string | null {
  if (!path) return null;
  const parts = path.replace(/\\/g, '/').split('/');
  const idx = parts.indexOf('workspaces');
  return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : null;
}

export function QueryResultsOverlay({
  containerWidth,
  containerHeight,
  pageWidth,
  pageHeight,
  offsetX = 0,
  offsetY = 0,
  workspaceId,
}: QueryResultsOverlayProps) {
  const hasActiveQuery = useAppSelector(selectHasActiveQuery);
  const results = useAppSelector(selectQueryResults);
  const focusedIndex = useAppSelector(selectFocusedIndex);
  const currentPage = useAppSelector(selectCurrentPage);
  const currentWorkspacePath = useAppSelector(selectWorkspacePath);

  const effectiveWorkspaceId =
    workspaceId ?? extractWorkspaceIdFromPath(currentWorkspacePath);

  const pageResults = useMemo(() => {
    if (!results?.results) return [];
    return results.results.filter((r) => {
      if (r.page !== currentPage) return false;
      if (effectiveWorkspaceId && r.workspaceId !== effectiveWorkspaceId)
        return false;
      return true;
    });
  }, [results, currentPage, effectiveWorkspaceId]);

  const focusedResult = useMemo(() => {
    if (focusedIndex === null || !results?.results) return null;
    return results.results[focusedIndex] ?? null;
  }, [focusedIndex, results]);

  if (!hasActiveQuery || pageResults.length === 0) {
    return null;
  }

  const scaleX = pageWidth;
  const scaleY = pageHeight;

  const renderResult = (result: QueryResultItem, isFocused: boolean) => {
    const { bbox } = result;
    const left = offsetX + bbox.xMin * scaleX;
    const top = offsetY + bbox.yMin * scaleY;
    const width = (bbox.xMax - bbox.xMin) * scaleX;
    const height = (bbox.yMax - bbox.yMin) * scaleY;

    return (
      <div
        key={result.id}
        style={{
          position: 'absolute',
          left,
          top,
          width,
          height,
          backgroundColor: isFocused ? FOCUSED_COLOR : RESULT_COLOR,
          border: `2px solid ${isFocused ? FOCUSED_BORDER : RESULT_BORDER}`,
          borderRadius: 2,
          pointerEvents: 'none',
          zIndex: isFocused ? 101 : 100,
          transition: 'all 0.15s ease',
        }}
      />
    );
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: containerWidth,
        height: containerHeight,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {pageResults.map((r) => renderResult(r, focusedResult?.id === r.id))}

      <div
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          pointerEvents: 'auto',
          zIndex: 200,
        }}
      >
        {results?.totalCount ?? 0} results
        {pageResults.length > 0 && ` (${pageResults.length} on this page)`}
      </div>
    </div>
  );
}

export default QueryResultsOverlay;
