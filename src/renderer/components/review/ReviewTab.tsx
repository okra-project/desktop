/**
 * Review Tab Component
 *
 * Three-panel layout for document review:
 * - Left: Document tree with page hierarchy
 * - Middle: PDF preview (currently placeholder)
 * - Right: Page content editor
 *
 * Adapted from okrapdf/app/app.okrapdf.com/(dashboard)/ocr/[jobId]/review/page.tsx
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useAppDispatch } from '../../store';
import PDFViewer, {
  type EntityOverlay,
  type PageDimension as PDFPageDimension,
} from '../PDFViewer';
import {
  useGetVerificationTreeQuery,
  useGetEntitiesQuery,
  useGetTablesByJobIdQuery,
  useGetPageContentQuery,
  useGetVerificationHistoryQuery,
  useSavePageVersionMutation,
  useUpdateTableStatusMutation,
  useFixAndAcceptTableMutation,
  type Entity,
  type ExtractedTable,
  type VerificationPageStatus,
} from '../../store/desktopApi';
import { PageNode, SimplePageNode, STATUS_CONFIG } from './TreeNodes';
import { FilterChip } from './FilterChips';
import { LayerMenu } from './LayerMenu';
import { useAvailableLayers } from '../../hooks/useAvailableLayers';
import { TableVerificationPanel } from './TableVerificationPanel';
import { HistoryModal } from './HistoryModal';
import { PageVerificationControl } from './PageVerificationControl';
import {
  EntityActionPopover,
  type EntityAction,
  type EntityOverlayInfo,
} from './EntityActionPopover';
import { DockedChat } from './DockedChat';
import {
  SelectableMarkdownRenderer,
  type SelectionData,
} from './SelectableMarkdownRenderer';
import { setContext } from '../../store/reviewAgentSlice';

// ============================================================================
// Types
// ============================================================================

export interface ReviewTabProps {
  jobId: string;
  documentName?: string;
  pdfPath?: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onBack?: () => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function ReviewTab({
  jobId,
  documentName,
  pdfPath,
  currentPage,
  onPageChange,
  onBack,
}: ReviewTabProps) {
  // State
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());
  const [previewPage, setPreviewPage] = useState<number | null>(
    currentPage ?? 1,
  );
  const [activeStatusFilter, setActiveStatusFilter] = useState<string | null>(
    null,
  );
  const [activeEntityFilter, setActiveEntityFilter] = useState<string | null>(
    null,
  );
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState<string>('');

  // Table verification state
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [verificationPanelOpen, setVerificationPanelOpen] = useState(false);
  const [syntheticTable, setSyntheticTable] = useState<ExtractedTable | null>(
    null,
  );

  // History modal state
  const [historyOpen, setHistoryOpen] = useState(false);

  // Entity overlay state - layers come from plugins
  const { layers: availableLayers } = useAvailableLayers();
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set());
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  useEffect(() => {
    if (availableLayers.length > 0 && visibleLayers.size === 0) {
      const entityLayers = availableLayers
        .filter((l) => l.category === 'entity' || !l.category)
        .map((l) => l.id);
      setVisibleLayers(new Set(entityLayers));
    }
  }, [availableLayers, visibleLayers.size]);

  // Sidebar collapsed state (web-style 165px collapsible)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Entity action popover state
  const [popoverEntity, setPopoverEntity] = useState<EntityOverlayInfo | null>(
    null,
  );
  const [popoverPosition, setPopoverPosition] = useState<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });

  // Chat state
  const [chatPrefill, setChatPrefill] = useState<string>('');
  const [chatAutoSend, setChatAutoSend] = useState(false);
  const [tableSelection, setTableSelection] = useState<SelectionData | null>(
    null,
  );
  const dispatch = useAppDispatch();

  // RTK Query
  const {
    data: treeData,
    isLoading: treeLoading,
    refetch: refetchTree,
  } = useGetVerificationTreeQuery(jobId, {
    skip: !jobId,
    pollingInterval: 30000, // Poll every 30s
  });

  const { data: entitiesData, isLoading: entitiesLoading } =
    useGetEntitiesQuery({ jobId }, { skip: !jobId });

  const { data: tablesData, refetch: refetchTables } = useGetTablesByJobIdQuery(
    { jobId },
    { skip: !jobId },
  );

  const { data: pageContent, isLoading: contentLoading } =
    useGetPageContentQuery(
      { jobId, pageNum: previewPage! },
      { skip: !jobId || !previewPage },
    );

  const [savePageVersion, { isLoading: isSaving }] =
    useSavePageVersionMutation();
  const [updateTableStatus, { isLoading: isUpdatingTable }] =
    useUpdateTableStatusMutation();
  const [fixAndAcceptTable] = useFixAndAcceptTableMutation();

  // Verification history - only fetch when modal is open
  const { data: historyData, isLoading: historyLoading } =
    useGetVerificationHistoryQuery(
      { jobId, limit: 100 },
      { skip: !jobId || !historyOpen },
    );

  // Group entities by page
  const entitiesByPage = useMemo(() => {
    const map = new Map<number, Entity[]>();
    if (entitiesData?.entities) {
      for (const entity of entitiesData.entities) {
        const existing = map.get(entity.page) ?? [];
        existing.push(entity);
        map.set(entity.page, existing);
      }
    }
    return map;
  }, [entitiesData?.entities]);

  // Convert entities to EntityOverlay format for PDFViewer (filtered by visible layers)
  const entityOverlays: EntityOverlay[] = useMemo(() => {
    if (!entitiesData?.entities) return [];

    const isLayerVisible = (type: string) => {
      if (visibleLayers.has(type)) return true;
      for (const layerId of visibleLayers) {
        if (layerId.endsWith(`:${type}`)) return true;
      }
      return false;
    };

    return entitiesData.entities
      .filter((e) => isLayerVisible(e.type))
      .map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        bbox: e.bbox,
        page: e.page,
      }));
  }, [entitiesData?.entities, visibleLayers]);

  // Toggle layer visibility
  const handleToggleLayer = useCallback((layer: string) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) {
        next.delete(layer);
      } else {
        next.add(layer);
      }
      return next;
    });
  }, []);

  // Page dimensions map - currently empty, relies on PDFViewer fallback
  // TODO: Fetch from API when available
  const pageDimensions = useMemo<Record<number, PDFPageDimension>>(
    () => ({}),
    [],
  );

  // Filter pages based on active filters
  const filteredPages = useMemo(() => {
    if (!treeData?.pages) return [];

    return treeData.pages.filter((page) => {
      // Status filter
      if (activeStatusFilter && page.status !== activeStatusFilter) {
        return false;
      }

      // Entity filter
      if (activeEntityFilter) {
        const pageEntities = entitiesByPage.get(page.page) ?? [];
        const hasEntityType = pageEntities.some(
          (e) => e.type === activeEntityFilter,
        );
        if (!hasEntityType) return false;
      }

      return true;
    });
  }, [treeData?.pages, activeStatusFilter, activeEntityFilter, entitiesByPage]);

  // Calculate progress
  const progress = useMemo(() => {
    if (!treeData) return { percent: 0, verified: 0, total: 0 };
    const total = treeData.totalPages;
    const verified = treeData.summary.complete;
    const percent = total > 0 ? Math.round((verified / total) * 100) : 0;
    return { percent, verified, total };
  }, [treeData]);

  // Get current page info for verification control
  const previewPageInfo = useMemo(() => {
    if (!previewPage || !treeData?.pages) return null;
    const pageData = treeData.pages.find((p) => p.page === previewPage);
    return pageData
      ? {
          resolution: pageData.resolution,
          isStale: pageData.isStale,
          status: pageData.status,
        }
      : null;
  }, [previewPage, treeData?.pages]);

  // Sync edited content when page content changes
  useEffect(() => {
    if (pageContent?.content && !isEditMode) {
      setEditedContent(pageContent.content);
    }
  }, [pageContent?.content, isEditMode]);

  // Handlers
  const handleTogglePage = useCallback((pageNum: number) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) {
        next.delete(pageNum);
      } else {
        next.add(pageNum);
      }
      return next;
    });
  }, []);

  const handlePreviewPage = useCallback(
    (pageNum: number) => {
      setPreviewPage(pageNum);
      setIsEditMode(false);
      onPageChange?.(pageNum);
    },
    [onPageChange],
  );

  const handleExpandAll = useCallback(() => {
    if (!filteredPages.length) return;
    setExpandedPages(new Set(filteredPages.map((p) => p.page)));
  }, [filteredPages]);

  const handleCollapseAll = useCallback(() => {
    setExpandedPages(new Set());
  }, []);

  const handleSaveContent = useCallback(async () => {
    if (!jobId || !previewPage || !editedContent) return;

    try {
      await savePageVersion({
        jobId,
        pageNum: previewPage,
        content: editedContent,
      }).unwrap();
      setIsEditMode(false);
      refetchTree();
    } catch (error) {
      console.error('Failed to save page content:', error);
    }
  }, [jobId, previewPage, editedContent, savePageVersion, refetchTree]);

  // Table verification handlers
  const handleEntityClick = useCallback(
    (entity: Entity) => {
      if (entity.type !== 'table') return;

      // Find matching extracted table
      const pageTable = tablesData?.tables?.find(
        (t) => t.page_number === entity.page,
      );

      if (pageTable) {
        setSyntheticTable(null);
        setSelectedTableId(pageTable.id);
      } else {
        // Create synthetic placeholder
        setSelectedTableId(null);
        setSyntheticTable({
          id: entity.id,
          page_number: entity.page,
          markdown: '',
          bbox: entity.bbox
            ? {
                xmin: entity.bbox.x,
                ymin: entity.bbox.y,
                xmax: entity.bbox.x + entity.bbox.width,
                ymax: entity.bbox.y + entity.bbox.height,
              }
            : { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
          confidence: null,
          verification_status: 'pending',
          verified_by: null,
          verified_at: null,
          created_at: new Date().toISOString(),
        });
      }
      setVerificationPanelOpen(true);
      setPreviewPage(entity.page);
    },
    [tablesData?.tables],
  );

  // Handle entity overlay click from PDFViewer - show popover
  const handleOverlayEntityClick = useCallback(
    (overlay: EntityOverlay, event: React.MouseEvent) => {
      // Set popover entity info
      setPopoverEntity({
        id: overlay.id,
        type: overlay.type,
        title: overlay.title,
        page: overlay.page,
      });
      setPopoverPosition({ x: event.clientX, y: event.clientY });
    },
    [],
  );

  // Handle popover close
  const handlePopoverClose = useCallback(() => {
    setPopoverEntity(null);
  }, []);

  // Handle popover action
  const handlePopoverAction = useCallback(
    (action: EntityAction, entity: EntityOverlayInfo) => {
      // For tables with verify-schema, open verification panel
      if (entity.type === 'table' && action.id === 'verify-schema') {
        const fullEntity = entitiesData?.entities.find(
          (e) => e.id === entity.id,
        );
        if (fullEntity) {
          handleEntityClick(fullEntity);
        }
      } else {
        // Build context message for the chat
        const contextMessage = `[${entity.type.toUpperCase()}${entity.title ? `: ${entity.title}` : ''} on page ${entity.page}]\n\n${action.prompt}`;

        // Set the context for the agent
        dispatch(
          setContext({
            jobId,
            documentName,
            currentPage: entity.page,
            selectedEntityId: entity.id,
            selectedEntityType: entity.type,
          }),
        );

        // Set prefill and auto-send
        setChatPrefill(contextMessage);
        setChatAutoSend(action.autoSend);
      }
    },
    [entitiesData?.entities, handleEntityClick, dispatch, jobId, documentName],
  );

  // Handle chat with table selection
  const handleChatWithSelection = useCallback(
    (selection: SelectionData) => {
      // Build a message with the selection
      const label = `${selection.headers.slice(0, 3).join(', ')} p${previewPage}`;
      const contextMessage = `[TABLE SELECTION: ${label}]\n\n${selection.asMarkdown}\n\nPlease analyze this table selection.`;

      // Set the context for the agent
      dispatch(
        setContext({
          jobId,
          documentName,
          currentPage: previewPage ?? undefined,
          tableMarkdown: selection.asMarkdown,
        }),
      );

      // Set prefill and auto-send
      setChatPrefill(contextMessage);
      setChatAutoSend(true);
      setTableSelection(selection);
    },
    [previewPage, dispatch, jobId, documentName],
  );

  const handleCloseVerificationPanel = useCallback(() => {
    setVerificationPanelOpen(false);
    setSelectedTableId(null);
    setSyntheticTable(null);
  }, []);

  const selectedTable = useMemo(() => {
    if (syntheticTable) return syntheticTable;
    if (!selectedTableId || !tablesData?.tables) return null;
    return tablesData.tables.find((t) => t.id === selectedTableId) ?? null;
  }, [selectedTableId, tablesData?.tables, syntheticTable]);

  const handleVerifyTable = useCallback(async () => {
    if (syntheticTable) {
      handleCloseVerificationPanel();
      return;
    }
    if (!selectedTableId) return;
    await updateTableStatus({
      tableId: selectedTableId,
      jobId,
      status: 'verified',
    }).unwrap();
    refetchTree();
    refetchTables();
  }, [
    selectedTableId,
    jobId,
    updateTableStatus,
    refetchTree,
    refetchTables,
    syntheticTable,
    handleCloseVerificationPanel,
  ]);

  const handleFlagTable = useCallback(async () => {
    if (syntheticTable) {
      handleCloseVerificationPanel();
      return;
    }
    if (!selectedTableId) return;
    await updateTableStatus({
      tableId: selectedTableId,
      jobId,
      status: 'flagged',
    }).unwrap();
    refetchTree();
    refetchTables();
  }, [
    selectedTableId,
    jobId,
    updateTableStatus,
    refetchTree,
    refetchTables,
    syntheticTable,
    handleCloseVerificationPanel,
  ]);

  const handleRejectTable = useCallback(async () => {
    if (syntheticTable) {
      handleCloseVerificationPanel();
      return;
    }
    if (!selectedTableId) return;
    await updateTableStatus({
      tableId: selectedTableId,
      jobId,
      status: 'rejected',
    }).unwrap();
    refetchTree();
    refetchTables();
  }, [
    selectedTableId,
    jobId,
    updateTableStatus,
    refetchTree,
    refetchTables,
    syntheticTable,
    handleCloseVerificationPanel,
  ]);

  const handleFixAndAcceptTable = useCallback(
    async (correctedMarkdown: string) => {
      if (!selectedTableId && !syntheticTable) return;

      if (syntheticTable) {
        // For synthetic tables, we'd need to create a new table
        // For now, just close the panel
        handleCloseVerificationPanel();
        return;
      }

      if (selectedTableId) {
        await fixAndAcceptTable({
          tableId: selectedTableId,
          jobId,
          correctedMarkdown,
        }).unwrap();
        refetchTree();
        refetchTables();
      }
    },
    [
      selectedTableId,
      jobId,
      fixAndAcceptTable,
      refetchTree,
      refetchTables,
      syntheticTable,
      handleCloseVerificationPanel,
    ],
  );

  // Table queue navigation
  const tableQueue = useMemo(() => {
    if (!tablesData?.tables || !selectedTable) return null;
    const currentIdx = tablesData.tables.findIndex(
      (t) => t.id === selectedTable.id,
    );
    return {
      currentIndex: currentIdx,
      totalCount: tablesData.tables.length,
      hasPrev: currentIdx > 0,
      hasNext: currentIdx < tablesData.tables.length - 1,
    };
  }, [tablesData?.tables, selectedTable]);

  const handlePrevTable = useCallback(() => {
    if (!tablesData?.tables || !tableQueue?.hasPrev) return;
    const prevTable = tablesData.tables[tableQueue.currentIndex - 1];
    if (prevTable) {
      setSyntheticTable(null);
      setSelectedTableId(prevTable.id);
      setPreviewPage(prevTable.page_number);
    }
  }, [tablesData?.tables, tableQueue]);

  const handleNextTable = useCallback(() => {
    if (!tablesData?.tables || !tableQueue?.hasNext) return;
    const nextTable = tablesData.tables[tableQueue.currentIndex + 1];
    if (nextTable) {
      setSyntheticTable(null);
      setSelectedTableId(nextTable.id);
      setPreviewPage(nextTable.page_number);
    }
  }, [tablesData?.tables, tableQueue]);

  // Loading state
  if (treeLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}>⏳</div>
          <p style={styles.loadingText}>Loading verification data...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          {onBack && (
            <button onClick={onBack} style={styles.backButton}>
              ← Back
            </button>
          )}
          <h1 style={styles.title}>{documentName || 'Document Review'}</h1>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.progressContainer}>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${progress.percent}%`,
                }}
              />
            </div>
            <span style={styles.progressText}>
              {progress.verified}/{progress.total} pages ({progress.percent}%)
            </span>
          </div>
          <button
            onClick={() => setHistoryOpen(true)}
            style={styles.historyButton}
          >
            🕐 History
          </button>
        </div>
      </div>

      {/* Main content - three panels */}
      <div style={styles.content}>
        {/* Left panel - Document tree (web-style collapsible 165px) */}
        <div
          style={{
            ...styles.leftPanelCollapsible,
            width: sidebarCollapsed ? 0 : 165,
            overflow: sidebarCollapsed ? 'hidden' : 'visible',
          }}
        >
          {/* Filter chips in sidebar header */}
          <div style={styles.sidebarFilterRow}>
            {entitiesData && (
              <>
                <FilterChip
                  label=""
                  icon="▤"
                  count={entitiesData.counts['tables'] ?? 0}
                  active={activeEntityFilter === 'table'}
                  onClick={() =>
                    setActiveEntityFilter(
                      activeEntityFilter === 'table' ? null : 'table',
                    )
                  }
                />
                <FilterChip
                  label=""
                  icon="▣"
                  count={entitiesData.counts['figures'] ?? 0}
                  active={activeEntityFilter === 'figure'}
                  onClick={() =>
                    setActiveEntityFilter(
                      activeEntityFilter === 'figure' ? null : 'figure',
                    )
                  }
                />
                <FilterChip
                  label=""
                  icon="†"
                  count={entitiesData.counts['footnotes'] ?? 0}
                  active={activeEntityFilter === 'footnote'}
                  onClick={() =>
                    setActiveEntityFilter(
                      activeEntityFilter === 'footnote' ? null : 'footnote',
                    )
                  }
                />
                {(activeStatusFilter || activeEntityFilter) && (
                  <button
                    onClick={() => {
                      setActiveStatusFilter(null);
                      setActiveEntityFilter(null);
                    }}
                    style={styles.clearFilterButton}
                    title="Clear filters"
                  >
                    ✕
                  </button>
                )}
              </>
            )}
          </div>
          {/* Page tree (scrollbar on hover) */}
          <div style={styles.treeContainerScrollable}>
            {treeLoading ? (
              <div style={styles.skeletonContainer}>
                {[...Array(8)].map((_, i) => (
                  <div key={i} style={styles.skeletonRow} />
                ))}
              </div>
            ) : (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
              >
                {treeData?.pages.map((page) => {
                  const pageEntities = entitiesByPage.get(page.page) ?? [];
                  const entityCounts = {
                    tables: pageEntities.filter((e) => e.type === 'table')
                      .length,
                    figures: pageEntities.filter((e) => e.type === 'figure')
                      .length,
                    footnotes: pageEntities.filter((e) => e.type === 'footnote')
                      .length,
                  };
                  const isFilteredOut = Boolean(
                    (activeStatusFilter &&
                      page.status !== activeStatusFilter) ||
                    (activeEntityFilter &&
                      !pageEntities.some((e) => e.type === activeEntityFilter)),
                  );

                  return (
                    <SimplePageNode
                      key={page.page}
                      page={page}
                      entityCounts={entityCounts}
                      onPreview={() => handlePreviewPage(page.page)}
                      isPreviewActive={previewPage === page.page}
                      isFilteredOut={isFilteredOut}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Toggle sidebar button */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          style={{
            ...styles.sidebarToggle,
            left: sidebarCollapsed ? 0 : 165,
          }}
          title={sidebarCollapsed ? 'Show pages' : 'Hide pages'}
        >
          {sidebarCollapsed ? '▶' : '◀'}
        </button>

        {/* Middle panel - PDF preview */}
        <div style={styles.middlePanel}>
          <div style={styles.panelHeader}>
            <div style={styles.panelHeaderLeft}>
              {previewPage && previewPageInfo && (
                <PageVerificationControl
                  jobId={jobId}
                  pageNum={previewPage}
                  currentResolution={previewPageInfo.resolution}
                  isStale={previewPageInfo.isStale}
                  onResolved={refetchTree}
                />
              )}
              <h2 style={styles.panelTitle}>Page {previewPage || '-'}</h2>
            </div>
            <div style={styles.panelActions}>
              <LayerMenu
                open={layerMenuOpen}
                onOpenChange={setLayerMenuOpen}
                visibleLayers={visibleLayers}
                onToggleLayer={handleToggleLayer}
                layers={availableLayers}
              />
              {previewPage && treeData && (
                <>
                  <button
                    onClick={() =>
                      setPreviewPage((p) => Math.max(1, (p ?? 1) - 1))
                    }
                    disabled={previewPage <= 1}
                    style={{
                      ...styles.navButton,
                      opacity: previewPage <= 1 ? 0.5 : 1,
                    }}
                  >
                    ←
                  </button>
                  <span style={styles.pageIndicator}>
                    {previewPage}/{treeData.totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setPreviewPage((p) =>
                        Math.min(treeData.totalPages, (p ?? 1) + 1),
                      )
                    }
                    disabled={previewPage >= treeData.totalPages}
                    style={{
                      ...styles.navButton,
                      opacity: previewPage >= treeData.totalPages ? 0.5 : 1,
                    }}
                  >
                    →
                  </button>
                </>
              )}
            </div>
          </div>
          <div style={styles.pdfContainer}>
            {pdfPath ? (
              <PDFViewer
                pdfPath={pdfPath}
                initialPage={previewPage ?? 1}
                onPageChange={handlePreviewPage}
                entities={entityOverlays}
                showEntityOverlays={visibleLayers.size > 0}
                onEntityClick={handleOverlayEntityClick}
                pageDimensions={pageDimensions}
              />
            ) : (
              <div style={styles.pdfPlaceholder}>
                <div style={styles.pdfPlaceholderIcon}>📄</div>
                <p style={styles.pdfPlaceholderText}>Loading PDF...</p>
              </div>
            )}
          </div>
        </div>

        {/* Right panel - Page content */}
        <div style={styles.rightPanel}>
          <div style={styles.panelHeader}>
            <div style={styles.panelHeaderLeft}>
              {pageContent?.version && pageContent.version > 1 && (
                <span style={styles.versionBadge}>v{pageContent.version}</span>
              )}
              {isEditMode && editedContent !== (pageContent?.content ?? '') && (
                <span style={styles.editedBadge}>edited</span>
              )}
            </div>
            <div style={styles.panelActions}>
              <span style={styles.charCountSmall}>
                {pageContent?.content
                  ? `${pageContent.content.length.toLocaleString()} chars`
                  : ''}
              </span>
              {/* Save button when edited */}
              {isEditMode && editedContent !== (pageContent?.content ?? '') && (
                <button
                  onClick={handleSaveContent}
                  disabled={isSaving}
                  style={styles.saveButtonCompact}
                >
                  {isSaving ? '⏳' : '💾'} Save
                </button>
              )}
              {/* Eye/Code toggle (web-style) */}
              <div style={styles.modeToggleGroup}>
                <button
                  onClick={() => setIsEditMode(false)}
                  style={{
                    ...styles.modeToggleButton,
                    ...(isEditMode ? {} : styles.modeToggleButtonActive),
                  }}
                  title="Preview"
                >
                  👀
                </button>
                <button
                  onClick={() => setIsEditMode(true)}
                  style={{
                    ...styles.modeToggleButton,
                    ...(isEditMode ? styles.modeToggleButtonActive : {}),
                  }}
                  title="Edit"
                >
                  ⌨
                </button>
              </div>
            </div>
          </div>
          <div style={styles.contentContainer}>
            {(() => {
              // Loading skeleton when fetching and no content yet
              if (contentLoading && !pageContent) {
                return (
                  <div style={styles.skeletonContent}>
                    <div style={{ ...styles.skeletonLine, width: '75%' }} />
                    <div style={{ ...styles.skeletonLine, width: '100%' }} />
                    <div style={{ ...styles.skeletonLine, width: '85%' }} />
                    <div style={{ ...styles.skeletonLine, width: '65%' }} />
                  </div>
                );
              }
              // Content available
              if (previewPage && pageContent) {
                return isEditMode ? (
                  <textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    style={styles.contentEditor}
                  />
                ) : (
                  <div style={styles.contentPreview}>
                    <SelectableMarkdownRenderer
                      content={pageContent.content}
                      onChatWithSelection={handleChatWithSelection}
                    />
                  </div>
                );
              }
              // No content
              return (
                <div style={styles.contentPlaceholder}>
                  No content available
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Table Verification Panel */}
      {verificationPanelOpen && selectedTable && (
        <TableVerificationPanel
          table={selectedTable}
          pageContent={pageContent ?? null}
          isLoadingContent={contentLoading}
          onClose={handleCloseVerificationPanel}
          onVerify={handleVerifyTable}
          onFlag={handleFlagTable}
          onReject={handleRejectTable}
          onFixAndAccept={handleFixAndAcceptTable}
          isUpdating={isUpdatingTable}
          jobId={jobId}
          currentIndex={tableQueue?.currentIndex}
          totalCount={tableQueue?.totalCount}
          onPrev={handlePrevTable}
          onNext={handleNextTable}
          hasPrev={tableQueue?.hasPrev}
          hasNext={tableQueue?.hasNext}
        />
      )}

      {/* History Modal */}
      <HistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={historyData?.history}
        isLoading={historyLoading}
      />

      {/* Entity Action Popover */}
      {popoverEntity && (
        <EntityActionPopover
          entity={popoverEntity}
          position={popoverPosition}
          onAction={handlePopoverAction}
          onClose={handlePopoverClose}
        />
      )}

      {/* Docked Chat */}
      <DockedChat
        context={{
          jobId,
          documentName,
          currentPage: previewPage ?? undefined,
        }}
        prefill={chatPrefill}
        autoSend={chatAutoSend}
        onSave={(content) => {
          // Save edited content to page
          if (previewPage && content) {
            savePageVersion({ jobId, pageNum: previewPage, content });
          }
        }}
        isSaving={isSaving}
      />
    </div>
  );
}

// ============================================================================
// Simple Markdown Renderer
// ============================================================================

function MarkdownContent({ content }: { content: string }) {
  return (
    <div
      style={{
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '14px',
        lineHeight: 1.6,
      }}
    >
      {content.split('\n').map((line, idx) => {
        // Headers
        if (line.startsWith('# ')) {
          return (
            <h1
              key={idx}
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                margin: '16px 0 8px',
              }}
            >
              {line.slice(2)}
            </h1>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h2
              key={idx}
              style={{
                fontSize: '18px',
                fontWeight: 'bold',
                margin: '14px 0 6px',
              }}
            >
              {line.slice(3)}
            </h2>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <h3
              key={idx}
              style={{
                fontSize: '16px',
                fontWeight: 'bold',
                margin: '12px 0 4px',
              }}
            >
              {line.slice(4)}
            </h3>
          );
        }

        // Table row
        if (line.trim().startsWith('|')) {
          const cells = line
            .split('|')
            .filter(Boolean)
            .map((c) => c.trim());
          const isHeaderSep = cells.every((c) => /^[-:]+$/.test(c));
          if (isHeaderSep) return null;

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
              }}
            >
              {cells.map((cell, cidx) => (
                <div
                  key={cidx}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRight:
                      cidx < cells.length - 1 ? '1px solid #e2e8f0' : 'none',
                    fontSize: '13px',
                  }}
                >
                  {cell}
                </div>
              ))}
            </div>
          );
        }

        // Regular paragraph
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

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#fff',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
  },
  spinner: {
    fontSize: '32px',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontSize: '14px',
    color: '#64748b',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  backButton: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    color: '#475569',
    cursor: 'pointer',
    fontSize: '13px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1e293b',
    margin: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  progressBar: {
    width: '120px',
    height: '8px',
    backgroundColor: '#e2e8f0',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '12px',
    color: '#64748b',
  },
  filtersContainer: {
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
  },
  content: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0, // Required for flex children to shrink properly
  },
  leftPanel: {
    width: '280px',
    minWidth: '200px',
    maxWidth: '400px',
    borderRight: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    resize: 'horizontal',
    overflow: 'auto',
  },
  middlePanel: {
    flex: 1,
    borderRight: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    minWidth: '400px', // Prevent PDF panel from being too narrow
    overflow: 'hidden',
  },
  rightPanel: {
    width: '350px',
    minWidth: '300px', // Ensure content panel stays readable
    maxWidth: '500px',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0, // Don't shrink below minWidth
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid #f1f5f9',
    backgroundColor: '#f8fafc',
  },
  panelTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    margin: 0,
  },
  panelActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  iconButton: {
    padding: '4px 8px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '14px',
  },
  editButton: {
    padding: '4px 10px',
    borderRadius: '4px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    color: '#475569',
    cursor: 'pointer',
    fontSize: '11px',
  },
  cancelButton: {
    padding: '4px 10px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '11px',
  },
  saveButton: {
    padding: '4px 10px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#10b981',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '11px',
  },
  pageIndicator: {
    fontSize: '11px',
    color: '#64748b',
    padding: '2px 8px',
    backgroundColor: '#f1f5f9',
    borderRadius: '4px',
  },
  treeContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 12px',
  },
  pdfContainer: {
    flex: 1,
    overflow: 'auto',
    backgroundColor: '#f1f5f9',
    display: 'flex',
    alignItems: 'flex-start', // Start from top, not center (prevents vertical cropping)
    justifyContent: 'center',
    minHeight: 0, // Required for flex children to scroll properly
  },
  pdfPlaceholder: {
    textAlign: 'center',
    padding: '32px',
  },
  pdfPlaceholderIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  pdfPlaceholderText: {
    fontSize: '14px',
    color: '#64748b',
    margin: 0,
  },
  pdfPlaceholderSubtext: {
    fontSize: '12px',
    color: '#94a3b8',
    marginTop: '8px',
  },
  contentContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    minHeight: 0, // Required for flex children to scroll properly
  },
  contentLoading: {
    color: '#64748b',
    fontSize: '13px',
    textAlign: 'center',
    padding: '24px',
  },
  contentPlaceholder: {
    color: '#94a3b8',
    fontSize: '13px',
    textAlign: 'center',
    padding: '24px',
  },
  contentEditor: {
    width: '100%',
    height: '100%',
    padding: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    outline: 'none',
    resize: 'none',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    fontSize: '13px',
    lineHeight: 1.6,
  },
  contentPreview: {
    fontSize: '13px',
    lineHeight: 1.6,
  },
  contentFooter: {
    padding: '8px 12px',
    borderTop: '1px solid #f1f5f9',
    backgroundColor: '#f8fafc',
  },
  charCount: {
    fontSize: '11px',
    color: '#94a3b8',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },
  emptyState: {
    textAlign: 'center',
    padding: '24px',
    color: '#94a3b8',
    fontSize: '13px',
  },
  historyButton: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  panelHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  navButton: {
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    color: '#475569',
    cursor: 'pointer',
    fontSize: '12px',
  },
  versionBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    fontWeight: 500,
  },
  editedBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#fef3c7',
    color: '#b45309',
    fontWeight: 500,
  },
  overlayToggle: {
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid #e2e8f0',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.15s ease',
  },
  // Web-style collapsible sidebar (165px fixed width)
  leftPanelCollapsible: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    borderRight: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    transition: 'width 0.2s ease',
    flexShrink: 0,
  },
  sidebarFilterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    padding: '8px',
    borderBottom: '1px solid #e2e8f0',
  },
  clearFilterButton: {
    padding: '4px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '10px',
  },
  treeContainerScrollable: {
    flex: 1,
    overflow: 'auto',
    padding: '4px',
    // Scrollbar on hover pattern would need CSS pseudo-elements
  },
  sidebarToggle: {
    position: 'absolute' as const,
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 20,
    padding: '4px',
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '0 4px 4px 0',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    cursor: 'pointer',
    color: '#64748b',
    fontSize: '10px',
    transition: 'left 0.2s ease',
  },
  // Skeleton loading
  skeletonContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  skeletonRow: {
    height: '28px',
    backgroundColor: '#f1f5f9',
    borderRadius: '4px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonContent: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  skeletonLine: {
    height: '16px',
    backgroundColor: '#f1f5f9',
    borderRadius: '4px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  // Eye/Code toggle (web-style)
  modeToggleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    backgroundColor: '#f1f5f9',
    borderRadius: '6px',
    padding: '2px',
  },
  modeToggleButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 6px',
    fontSize: '11px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  modeToggleButtonActive: {
    backgroundColor: '#fff',
    color: '#334155',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  saveButtonCompact: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
  },
  charCountSmall: {
    fontSize: '11px',
    color: '#94a3b8',
  },
};

export default ReviewTab;
