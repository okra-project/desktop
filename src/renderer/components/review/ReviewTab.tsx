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
import {
  useGetVerificationTreeQuery,
  useGetEntitiesQuery,
  useGetTablesByJobIdQuery,
  useGetPageContentQuery,
  useSavePageVersionMutation,
  useUpdateTableStatusMutation,
  useFixAndAcceptTableMutation,
  type Entity,
  type ExtractedTable,
  type VerificationPageStatus,
} from '../../store/desktopApi';
import { PageNode, STATUS_CONFIG } from './TreeNodes';
import { FilterChipsRow } from './FilterChips';
import { TableVerificationPanel } from './TableVerificationPanel';

// ============================================================================
// Types
// ============================================================================

export interface ReviewTabProps {
  jobId: string;
  documentName?: string;
  onBack?: () => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function ReviewTab({ jobId, documentName, onBack }: ReviewTabProps) {
  // State
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  const [activeStatusFilter, setActiveStatusFilter] = useState<string | null>(null);
  const [activeEntityFilter, setActiveEntityFilter] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState<string>('');

  // Table verification state
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [verificationPanelOpen, setVerificationPanelOpen] = useState(false);
  const [syntheticTable, setSyntheticTable] = useState<ExtractedTable | null>(null);

  // RTK Query
  const { data: treeData, isLoading: treeLoading, refetch: refetchTree } = useGetVerificationTreeQuery(jobId, {
    skip: !jobId,
    pollingInterval: 30000, // Poll every 30s
  });

  const { data: entitiesData, isLoading: entitiesLoading } = useGetEntitiesQuery(
    { jobId },
    { skip: !jobId }
  );

  const { data: tablesData, refetch: refetchTables } = useGetTablesByJobIdQuery(
    { jobId },
    { skip: !jobId }
  );

  const { data: pageContent, isLoading: contentLoading } = useGetPageContentQuery(
    { jobId, pageNum: previewPage! },
    { skip: !jobId || !previewPage }
  );

  const [savePageVersion, { isLoading: isSaving }] = useSavePageVersionMutation();
  const [updateTableStatus, { isLoading: isUpdatingTable }] = useUpdateTableStatusMutation();
  const [fixAndAcceptTable] = useFixAndAcceptTableMutation();

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
        const hasEntityType = pageEntities.some((e) => e.type === activeEntityFilter);
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

  const handlePreviewPage = useCallback((pageNum: number) => {
    setPreviewPage(pageNum);
    setIsEditMode(false);
  }, []);

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
  const handleEntityClick = useCallback((entity: Entity) => {
    if (entity.type !== 'table') return;

    // Find matching extracted table
    const pageTable = tablesData?.tables?.find((t) => t.page_number === entity.page);

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
        bbox: entity.bbox ? {
          xmin: entity.bbox.x,
          ymin: entity.bbox.y,
          xmax: entity.bbox.x + entity.bbox.width,
          ymax: entity.bbox.y + entity.bbox.height,
        } : { xmin: 0, ymin: 0, xmax: 1, ymax: 1 },
        confidence: null,
        verification_status: 'pending',
        verified_by: null,
        verified_at: null,
        created_at: new Date().toISOString(),
      });
    }
    setVerificationPanelOpen(true);
    setPreviewPage(entity.page);
  }, [tablesData?.tables]);

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
    await updateTableStatus({ tableId: selectedTableId, jobId, status: 'verified' }).unwrap();
    refetchTree();
    refetchTables();
  }, [selectedTableId, jobId, updateTableStatus, refetchTree, refetchTables, syntheticTable, handleCloseVerificationPanel]);

  const handleFlagTable = useCallback(async () => {
    if (syntheticTable) {
      handleCloseVerificationPanel();
      return;
    }
    if (!selectedTableId) return;
    await updateTableStatus({ tableId: selectedTableId, jobId, status: 'flagged' }).unwrap();
    refetchTree();
    refetchTables();
  }, [selectedTableId, jobId, updateTableStatus, refetchTree, refetchTables, syntheticTable, handleCloseVerificationPanel]);

  const handleRejectTable = useCallback(async () => {
    if (syntheticTable) {
      handleCloseVerificationPanel();
      return;
    }
    if (!selectedTableId) return;
    await updateTableStatus({ tableId: selectedTableId, jobId, status: 'rejected' }).unwrap();
    refetchTree();
    refetchTables();
  }, [selectedTableId, jobId, updateTableStatus, refetchTree, refetchTables, syntheticTable, handleCloseVerificationPanel]);

  const handleFixAndAcceptTable = useCallback(async (correctedMarkdown: string) => {
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
  }, [selectedTableId, jobId, fixAndAcceptTable, refetchTree, refetchTables, syntheticTable, handleCloseVerificationPanel]);

  // Table queue navigation
  const tableQueue = useMemo(() => {
    if (!tablesData?.tables || !selectedTable) return null;
    const currentIdx = tablesData.tables.findIndex((t) => t.id === selectedTable.id);
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
          <h1 style={styles.title}>
            {documentName || 'Document Review'}
          </h1>
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
        </div>
      </div>

      {/* Filter chips */}
      {treeData && entitiesData && (
        <div style={styles.filtersContainer}>
          <FilterChipsRow
            summary={treeData.summary}
            entityCounts={entitiesData.counts}
            activeStatusFilter={activeStatusFilter}
            activeEntityFilter={activeEntityFilter}
            onStatusFilterChange={setActiveStatusFilter}
            onEntityFilterChange={setActiveEntityFilter}
          />
        </div>
      )}

      {/* Main content - three panels */}
      <div style={styles.content}>
        {/* Left panel - Document tree */}
        <div style={styles.leftPanel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Pages</h2>
            <div style={styles.panelActions}>
              <button onClick={handleExpandAll} style={styles.iconButton} title="Expand all">
                ⊞
              </button>
              <button onClick={handleCollapseAll} style={styles.iconButton} title="Collapse all">
                ⊟
              </button>
            </div>
          </div>
          <div style={styles.treeContainer}>
            {filteredPages.map((page) => (
              <PageNode
                key={page.page}
                jobId={jobId}
                page={page}
                entities={entitiesByPage.get(page.page) ?? []}
                expanded={expandedPages.has(page.page)}
                onToggle={() => handleTogglePage(page.page)}
                onPreview={() => handlePreviewPage(page.page)}
                isPreviewActive={previewPage === page.page}
                onEntityClick={handleEntityClick}
              />
            ))}
            {filteredPages.length === 0 && (
              <div style={styles.emptyState}>
                No pages match the current filters
              </div>
            )}
          </div>
        </div>

        {/* Middle panel - PDF preview placeholder */}
        <div style={styles.middlePanel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>PDF Preview</h2>
            {previewPage && (
              <span style={styles.pageIndicator}>Page {previewPage}</span>
            )}
          </div>
          <div style={styles.pdfContainer}>
            {previewPage ? (
              <div style={styles.pdfPlaceholder}>
                <div style={styles.pdfPlaceholderIcon}>📄</div>
                <p style={styles.pdfPlaceholderText}>Page {previewPage}</p>
                <p style={styles.pdfPlaceholderSubtext}>
                  PDF preview will be integrated with PDFViewer component
                </p>
              </div>
            ) : (
              <div style={styles.pdfPlaceholder}>
                <p style={styles.pdfPlaceholderText}>Select a page to preview</p>
              </div>
            )}
          </div>
        </div>

        {/* Right panel - Page content */}
        <div style={styles.rightPanel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Page Content</h2>
            <div style={styles.panelActions}>
              {pageContent && !isEditMode && (
                <button
                  onClick={() => setIsEditMode(true)}
                  style={styles.editButton}
                >
                  ✎ Edit
                </button>
              )}
              {isEditMode && (
                <>
                  <button
                    onClick={() => {
                      setIsEditMode(false);
                      setEditedContent(pageContent?.content ?? '');
                    }}
                    style={styles.cancelButton}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveContent}
                    disabled={isSaving}
                    style={styles.saveButton}
                  >
                    {isSaving ? '⏳ Saving...' : '✓ Save'}
                  </button>
                </>
              )}
            </div>
          </div>
          <div style={styles.contentContainer}>
            {contentLoading ? (
              <div style={styles.contentLoading}>Loading content...</div>
            ) : previewPage && pageContent ? (
              isEditMode ? (
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  style={styles.contentEditor}
                />
              ) : (
                <div style={styles.contentPreview}>
                  <MarkdownContent content={pageContent.content} />
                </div>
              )
            ) : (
              <div style={styles.contentPlaceholder}>
                Select a page to view its content
              </div>
            )}
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
    </div>
  );
}

// ============================================================================
// Simple Markdown Renderer
// ============================================================================

function MarkdownContent({ content }: { content: string }) {
  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: '14px', lineHeight: 1.6 }}>
      {content.split('\n').map((line, idx) => {
        // Headers
        if (line.startsWith('# ')) {
          return <h1 key={idx} style={{ fontSize: '20px', fontWeight: 'bold', margin: '16px 0 8px' }}>{line.slice(2)}</h1>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={idx} style={{ fontSize: '18px', fontWeight: 'bold', margin: '14px 0 6px' }}>{line.slice(3)}</h2>;
        }
        if (line.startsWith('### ')) {
          return <h3 key={idx} style={{ fontSize: '16px', fontWeight: 'bold', margin: '12px 0 4px' }}>{line.slice(4)}</h3>;
        }

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
                backgroundColor: '#f8fafc',
              }}
            >
              {cells.map((cell, cidx) => (
                <div
                  key={cidx}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRight: cidx < cells.length - 1 ? '1px solid #e2e8f0' : 'none',
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
          return <p key={idx} style={{ margin: '8px 0' }}>{line}</p>;
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
  },
  leftPanel: {
    width: '280px',
    borderRight: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
  },
  middlePanel: {
    flex: 1,
    borderRight: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  rightPanel: {
    width: '350px',
    display: 'flex',
    flexDirection: 'column',
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
    alignItems: 'center',
    justifyContent: 'center',
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
  emptyState: {
    textAlign: 'center',
    padding: '24px',
    color: '#94a3b8',
    fontSize: '13px',
  },
};

export default ReviewTab;
