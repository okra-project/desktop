import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PDFViewer, { type EntityOverlay } from '../PDFViewer';
import { useReviewData } from '../../providers/ReviewDataContext';
import { LayerMenu } from './LayerMenu';
import { useAvailableLayers } from '../../hooks/useAvailableLayers';

export interface LocalReviewTabProps {
  jobId: string;
  documentName?: string;
  pdfPath?: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onBack?: () => void;
}

export function LocalReviewTab({
  documentName,
  pdfPath,
  currentPage: initialPage,
  onPageChange,
  onBack,
}: LocalReviewTabProps) {
  const {
    treeData,
    treeLoading,
    entitiesData,
    pageContent,
    contentLoading,
    currentPage,
    setCurrentPage,
    savePageVersion,
    isSaving,
    pageDimensions,
  } = useReviewData();

  const [isEditMode, setIsEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  const entityOverlays: EntityOverlay[] = useMemo(() => {
    if (!entitiesData?.entities) return [];
    return entitiesData.entities
      .filter((e) => visibleLayers.has(e.type))
      .map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        bbox: e.bbox,
        page: e.page,
      }));
  }, [entitiesData?.entities, visibleLayers]);

  const totalPages = treeData?.totalPages ?? 0;

  useEffect(() => {
    if (initialPage && initialPage !== currentPage) {
      setCurrentPage(initialPage);
    }
  }, [initialPage]);

  useEffect(() => {
    setEditedContent(pageContent?.content ?? '');
  }, [pageContent]);

  const handlePreviewPage = useCallback(
    (pageNum: number) => {
      setCurrentPage(pageNum);
      setIsEditMode(false);
      onPageChange?.(pageNum);
    },
    [setCurrentPage, onPageChange],
  );

  const handleSaveContent = useCallback(async () => {
    await savePageVersion(editedContent);
    setIsEditMode(false);
  }, [editedContent, savePageVersion]);

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  if (treeLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}>⏳</div>
          <p style={styles.loadingText}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
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
          <span style={styles.pageCount}>{totalPages} pages</span>
        </div>
      </div>

      <div style={styles.content}>
        <div style={{ ...styles.leftPanel, width: sidebarCollapsed ? 0 : 165 }}>
          <div style={styles.pageList}>
            {pages.map((page) => (
              <button
                key={page}
                onClick={() => handlePreviewPage(page)}
                style={{
                  ...styles.pageButton,
                  ...(currentPage === page ? styles.pageButtonActive : {}),
                }}
              >
                Page {page}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          style={{ ...styles.sidebarToggle, left: sidebarCollapsed ? 0 : 165 }}
        >
          {sidebarCollapsed ? '▶' : '◀'}
        </button>

        <div style={styles.middlePanel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Page {currentPage}</h2>
            <div style={styles.panelActions}>
              <LayerMenu
                open={layerMenuOpen}
                onOpenChange={setLayerMenuOpen}
                visibleLayers={visibleLayers}
                onToggleLayer={handleToggleLayer}
                layers={availableLayers}
              />
              <button
                onClick={() => handlePreviewPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                style={{
                  ...styles.navButton,
                  opacity: currentPage <= 1 ? 0.5 : 1,
                }}
              >
                ←
              </button>
              <span style={styles.pageIndicator}>
                {currentPage}/{totalPages}
              </span>
              <button
                onClick={() =>
                  handlePreviewPage(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage >= totalPages}
                style={{
                  ...styles.navButton,
                  opacity: currentPage >= totalPages ? 0.5 : 1,
                }}
              >
                →
              </button>
            </div>
          </div>
          <div style={styles.pdfContainer}>
            {pdfPath ? (
              <PDFViewer
                pdfPath={pdfPath}
                initialPage={currentPage}
                onPageChange={handlePreviewPage}
                entities={entityOverlays}
                showEntityOverlays={visibleLayers.size > 0}
                pageDimensions={pageDimensions}
              />
            ) : (
              <div style={styles.pdfPlaceholder}>
                <div style={styles.pdfPlaceholderIcon}>📄</div>
                <p>Loading PDF...</p>
              </div>
            )}
          </div>
        </div>

        <div style={styles.rightPanel}>
          <div style={styles.panelHeader}>
            <div style={styles.panelHeaderLeft}>
              {isEditMode && editedContent !== (pageContent?.content ?? '') && (
                <span style={styles.editedBadge}>edited</span>
              )}
            </div>
            <div style={styles.panelActions}>
              <span style={styles.charCount}>
                {(pageContent?.content?.length ?? 0).toLocaleString()} chars
              </span>
              {isEditMode && editedContent !== (pageContent?.content ?? '') && (
                <button
                  onClick={handleSaveContent}
                  disabled={isSaving}
                  style={styles.saveButton}
                >
                  {isSaving ? '⏳' : '💾'} Save
                </button>
              )}
              <div style={styles.modeToggle}>
                <button
                  onClick={() => setIsEditMode(false)}
                  style={{
                    ...styles.modeButton,
                    ...(isEditMode ? {} : styles.modeButtonActive),
                  }}
                >
                  👀
                </button>
                <button
                  onClick={() => setIsEditMode(true)}
                  style={{
                    ...styles.modeButton,
                    ...(isEditMode ? styles.modeButtonActive : {}),
                  }}
                >
                  ⌨
                </button>
              </div>
            </div>
          </div>
          <div style={styles.contentContainer}>
            {contentLoading ? (
              <div style={styles.contentPlaceholder}>Loading...</div>
            ) : isEditMode ? (
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                style={styles.contentEditor}
              />
            ) : (
              <div style={styles.contentPreview}>
                <pre style={styles.preformatted}>
                  {pageContent?.content || 'No content extracted'}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  spinner: { fontSize: '32px' },
  loadingText: { fontSize: '14px', color: '#64748b' },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '16px' },
  backButton: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
  },
  title: { fontSize: '16px', fontWeight: 600, color: '#1e293b', margin: 0 },
  pageCount: { fontSize: '12px', color: '#64748b' },
  content: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    position: 'relative' as const,
  },
  leftPanel: {
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    transition: 'width 0.2s ease',
    overflow: 'hidden',
    flexShrink: 0,
  },
  pageList: {
    flex: 1,
    overflow: 'auto',
    padding: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  pageButton: {
    padding: '8px 12px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '12px',
    textAlign: 'left' as const,
    color: '#475569',
  },
  pageButtonActive: {
    backgroundColor: '#f1f5f9',
    color: '#1e293b',
    fontWeight: 500,
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
    cursor: 'pointer',
    color: '#64748b',
    fontSize: '10px',
    transition: 'left 0.2s ease',
  },
  middlePanel: {
    flex: 1,
    borderRight: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    minWidth: '400px',
    overflow: 'hidden',
  },
  rightPanel: {
    width: '350px',
    minWidth: '300px',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid #f1f5f9',
    backgroundColor: '#f8fafc',
  },
  panelHeaderLeft: { display: 'flex', alignItems: 'center', gap: '8px' },
  panelTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    margin: 0,
  },
  panelActions: { display: 'flex', alignItems: 'center', gap: '4px' },
  navButton: {
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
  },
  pageIndicator: {
    fontSize: '11px',
    color: '#64748b',
    padding: '2px 8px',
    backgroundColor: '#f1f5f9',
    borderRadius: '4px',
  },
  pdfContainer: {
    flex: 1,
    overflow: 'auto',
    backgroundColor: '#f1f5f9',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  pdfPlaceholder: {
    textAlign: 'center' as const,
    padding: '32px',
    color: '#64748b',
  },
  pdfPlaceholderIcon: { fontSize: '48px', marginBottom: '16px' },
  contentContainer: { flex: 1, overflow: 'auto', padding: '12px' },
  contentPlaceholder: {
    color: '#94a3b8',
    fontSize: '13px',
    textAlign: 'center' as const,
    padding: '24px',
  },
  contentEditor: {
    width: '100%',
    height: '100%',
    padding: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    outline: 'none',
    resize: 'none' as const,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    fontSize: '13px',
    lineHeight: 1.6,
  },
  contentPreview: { fontSize: '13px', lineHeight: 1.6 },
  preformatted: {
    margin: 0,
    whiteSpace: 'pre-wrap' as const,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: '13px',
  },
  editedBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#fef3c7',
    color: '#b45309',
    fontWeight: 500,
  },
  charCount: { fontSize: '11px', color: '#94a3b8' },
  saveButton: {
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
  modeToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    backgroundColor: '#f1f5f9',
    borderRadius: '6px',
    padding: '2px',
  },
  modeButton: {
    padding: '4px 6px',
    fontSize: '11px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
  },
  modeButtonActive: {
    backgroundColor: '#fff',
    color: '#334155',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
};

export default LocalReviewTab;
