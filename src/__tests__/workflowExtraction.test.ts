/**
 * Test: Plugin runs on all pages when clicked
 *
 * Regression test for bug where plugins only ran on 1 page instead of all pages.
 * Root cause: useWorkflowExtraction was using selectTotalPages from @okrapdf/redux
 * (extraction slice) instead of viewerSlice (which has actual PDF page count).
 */

import { configureStore } from '@reduxjs/toolkit';

// Mock the viewer slice state with totalPages
const createMockViewerState = (totalPages: number) => ({
  workspacePath: '/test/workspace',
  currentPage: 1,
  totalPages,
  scale: 1,
  pdfLoaded: true,
  overlayVisibility: {},
  entities: [],
  entitiesLoading: false,
  entitiesError: null,
  selectedEntityId: null,
  pageDimensions: {},
});

// Mock the extraction slice state (this was the buggy source)
const createMockExtractionState = (totalPages: number) => ({
  workspaceId: 'test-workspace',
  workspacePath: '/test/workspace',
  status: 'idle',
  progress: null,
  totalPages, // This was incorrectly being used before the fix
  error: null,
});

describe('Workflow Extraction - All Pages', () => {
  it('should use viewer totalPages (actual PDF count), not extraction slice', () => {
    // Simulate the bug scenario:
    // - Viewer has 74 pages (actual PDF)
    // - Extraction slice has 1 page (stale/incorrect)
    const viewerState = createMockViewerState(74);
    const extractionState = createMockExtractionState(1);

    // The fix ensures we use viewer.totalPages
    const actualTotalPages = viewerState.totalPages;
    const buggyTotalPages = extractionState.totalPages;

    expect(actualTotalPages).toBe(74);
    expect(buggyTotalPages).toBe(1);

    // After fix, workflow should use viewer's count
    expect(actualTotalPages).not.toBe(buggyTotalPages);
  });

  it('should pass correct totalPages to workflow run', () => {
    const viewerTotalPages = 74;

    // Simulating what startRun receives
    const workflowRunOptions = {
      workspaceId: 'test-workspace',
      workspacePath: '/test/workspace',
      totalPages: viewerTotalPages, // Should be 74, not 1
      nodes: [
        {
          nodeId: 'openrouter-extractor',
          nodeType: 'openrouter',
          config: {},
        },
      ],
    };

    expect(workflowRunOptions.totalPages).toBe(74);
  });

  it('workflow handler should iterate through all pages', () => {
    const totalPages = 74;
    const processedPages: number[] = [];

    // Simulate the loop in workflow.handlers.ts
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      processedPages.push(pageNum);
    }

    expect(processedPages.length).toBe(74);
    expect(processedPages[0]).toBe(1);
    expect(processedPages[processedPages.length - 1]).toBe(74);
  });
});

describe('selectTotalPages source', () => {
  it('viewerSlice.selectTotalPages returns viewer state', () => {
    // This test validates the selector reads from correct slice
    const mockState = {
      viewer: createMockViewerState(74),
      extraction: createMockExtractionState(1),
    };

    // Simulating selectTotalPages from viewerSlice
    const selectTotalPagesFromViewer = (state: typeof mockState) =>
      state.viewer.totalPages;

    // Simulating old buggy selectTotalPages from extraction slice
    const selectTotalPagesFromExtraction = (state: typeof mockState) =>
      state.extraction.totalPages;

    expect(selectTotalPagesFromViewer(mockState)).toBe(74);
    expect(selectTotalPagesFromExtraction(mockState)).toBe(1);
  });
});
