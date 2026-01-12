import { useState, useEffect, useCallback } from 'react';
import { loadSettings, selectIsAnthropicConfigured } from '@okrapdf/redux';
import {
  useAppDispatch,
  useAppSelector,
  electronSettingsAdapter,
} from './store';
import LocalDocumentBrowser from './components/LocalDocumentBrowser';
import DocumentViewer from './components/DocumentViewer';
import SettingsScreen from './components/SettingsScreen';
import DragDropOverlay from './components/DragDropOverlay';
import { useExtractionInit } from './hooks/useExtractionRedux';
import { useWorkflowExtraction } from './hooks/useWorkflowExtraction';
import { useMcpEvents } from './hooks/useMcpEvents';
import { ToastProvider } from './components/Toast';
import './App.css';

// Wrapper to initialize MCP events listener (must be inside ToastProvider)
function McpEventsInitializer({ children }: { children: React.ReactNode }) {
  useMcpEvents();
  return <>{children}</>;
}

function ExtractionInitializer({
  workspaceId,
  workspacePath,
  children,
}: {
  workspaceId: string;
  workspacePath: string;
  children: React.ReactNode;
}) {
  useExtractionInit(workspaceId, workspacePath);
  useWorkflowExtraction(workspaceId, workspacePath);
  return <>{children}</>;
}

type AppScreen = 'loading' | 'settings' | 'browser' | 'viewer';

interface SelectedDocument {
  id: string;
  name: string;
  workspacePath: string;
}

interface SelectorResult {
  id: string;
  page: number;
  type: string;
  text: string;
  bbox: { xMin: number; yMin: number; xMax: number; yMax: number };
  workspaceId: string;
  workspaceName: string;
  workspacePath: string;
}

export default function App() {
  const dispatch = useAppDispatch();
  const hasApiKey = useAppSelector(selectIsAnthropicConfigured);

  const [screen, setScreen] = useState<AppScreen>('loading');
  const [previousScreen, setPreviousScreen] = useState<AppScreen>('browser');
  const [selectedDocument, setSelectedDocument] =
    useState<SelectedDocument | null>(null);
  const [activeSelector, setActiveSelector] = useState<string | null>(null);
  const [activeSelectorResults, setActiveSelectorResults] = useState<
    SelectorResult[] | null
  >(null);

  const openPdfFromPath = useCallback(async (filePath: string) => {
    try {
      const workspace = await window.electron.ipcRenderer.invoke(
        'workspace:create-from-path',
        filePath,
      );
      setSelectedDocument({
        id: workspace.id,
        name: workspace.name,
        workspacePath: workspace.path,
      });
      setScreen('viewer');
    } catch (err) {
      console.error('Failed to open PDF:', err);
    }
  }, []);

  useEffect(() => {
    dispatch(loadSettings({ adapter: electronSettingsAdapter }));
    setScreen('browser');

    const unsubSettings = window.electron.ipcRenderer.on(
      'menu:open-settings',
      () => {
        setScreen('settings');
      },
    );

    const unsubOpenPdf = window.electron.ipcRenderer.on(
      'menu:open-pdf',
      async (filePath: unknown) => {
        if (typeof filePath === 'string') {
          openPdfFromPath(filePath);
        }
      },
    );

    const unsubShowResult = window.electron.ipcRenderer.on(
      'mcp:show-result',
      (data: unknown) => {
        const event = data as {
          workspaceId?: string;
          workspaceName?: string;
          workspacePath?: string;
          selector: string;
          results: SelectorResult[];
        };
        setActiveSelector(event.selector);
        setActiveSelectorResults(event.results);

        const primaryWorkspace =
          event.workspaceId && event.workspaceName && event.workspacePath
            ? {
                id: event.workspaceId,
                name: event.workspaceName,
                workspacePath: event.workspacePath,
              }
            : event.results[0]
              ? {
                  id: event.results[0].workspaceId,
                  name: event.results[0].workspaceName,
                  workspacePath: event.results[0].workspacePath,
                }
              : null;

        if (primaryWorkspace) {
          setSelectedDocument(primaryWorkspace);
          setScreen('viewer');
        }
      },
    );

    return () => {
      unsubSettings();
      unsubOpenPdf();
      unsubShowResult();
    };
  }, [dispatch, openPdfFromPath]);

  const handleCloseSettings = useCallback(() => {
    setScreen(
      previousScreen === 'viewer' && selectedDocument ? 'viewer' : 'browser',
    );
  }, [previousScreen, selectedDocument]);

  const handleSettingsSaved = useCallback(() => {
    if (hasApiKey) {
      handleCloseSettings();
    }
  }, [hasApiKey, handleCloseSettings]);

  const handleSelectDocument = useCallback(
    (doc: {
      id: string;
      name: string;
      workspacePath: string;
      page?: number;
    }) => {
      setSelectedDocument(doc);
      setScreen('viewer');
      // Page navigation handled via Redux in DocumentViewer when it mounts
    },
    [],
  );

  // Initial page to navigate to (set by MCP show_result)
  const [initialPage, setInitialPage] = useState<number | null>(null);

  const handleResultSelect = useCallback((result: SelectorResult) => {
    setSelectedDocument((current) => {
      if (!current || current.id !== result.workspaceId) {
        return {
          id: result.workspaceId,
          name: result.workspaceName,
          workspacePath: result.workspacePath,
        };
      }
      return current;
    });
    setInitialPage(result.page);
    setScreen('viewer');
  }, []);

  const handleBackToBrowser = useCallback(() => {
    setSelectedDocument(null);
    setScreen('browser');
  }, []);

  const handleOpenSettings = useCallback(() => {
    setPreviousScreen(screen);
    setScreen('settings');
  }, [screen]);

  const renderScreen = () => {
    if (screen === 'loading') {
      return (
        <div className="flex items-center justify-center min-h-screen bg-cream">
          <div className="text-center">
            <div className="text-6xl mb-4">📄</div>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-okra-yellow mx-auto" />
          </div>
        </div>
      );
    }

    if (screen === 'settings') {
      return (
        <SettingsScreen
          onClose={handleCloseSettings}
          onSettingsSaved={handleSettingsSaved}
        />
      );
    }

    if (screen === 'browser') {
      return (
        <DragDropOverlay onFileDrop={openPdfFromPath}>
          <LocalDocumentBrowser
            onSelectDocument={handleSelectDocument}
            onOpenSettings={handleOpenSettings}
          />
        </DragDropOverlay>
      );
    }

    if (screen === 'viewer' && selectedDocument) {
      return (
        <ExtractionInitializer
          workspaceId={selectedDocument.id}
          workspacePath={selectedDocument.workspacePath}
        >
          <DocumentViewer
            documentUuid={selectedDocument.id}
            documentName={selectedDocument.name}
            workspacePath={selectedDocument.workspacePath}
            onBack={handleBackToBrowser}
            onOpenSettings={handleOpenSettings}
            initialPage={initialPage}
            onInitialPageUsed={() => setInitialPage(null)}
            selector={activeSelector}
            selectorResults={activeSelectorResults}
            onSelectorUsed={() => {
              setActiveSelector(null);
              setActiveSelectorResults(null);
            }}
            onResultSelect={handleResultSelect}
          />
        </ExtractionInitializer>
      );
    }

    return null;
  };

  return (
    <ToastProvider>
      <McpEventsInitializer>{renderScreen()}</McpEventsInitializer>
    </ToastProvider>
  );
}
