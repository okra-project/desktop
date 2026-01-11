import { useState, useEffect, useCallback } from 'react';
import LocalDocumentBrowser from './components/LocalDocumentBrowser';
import DocumentViewer from './components/DocumentViewer';
import TelemetryBanner from './components/TelemetryBanner';
import SettingsScreen from './components/SettingsScreen';
import DragDropOverlay from './components/DragDropOverlay';
import { LocalExtractionProvider } from './providers/LocalExtractionProvider';
import './App.css';

type AppScreen = 'loading' | 'settings' | 'browser' | 'viewer';

interface SelectedDocument {
  id: string;
  name: string;
  workspacePath: string;
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [previousScreen, setPreviousScreen] = useState<AppScreen>('browser');
  const [selectedDocument, setSelectedDocument] = useState<SelectedDocument | null>(null);

  const openPdfFromPath = useCallback(async (filePath: string) => {
    try {
      const workspace = await window.electron.ipcRenderer.invoke('workspace:create-from-path', filePath);
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
    // Always start at browser - API key prompt shown inline in chat when needed
    setScreen('browser');

    const unsubSettings = window.electron.ipcRenderer.on('menu:open-settings', () => {
      setScreen('settings');
    });

    const unsubOpenPdf = window.electron.ipcRenderer.on('menu:open-pdf', async (filePath: unknown) => {
      if (typeof filePath === 'string') {
        openPdfFromPath(filePath);
      }
    });

    return () => {
      unsubSettings();
      unsubOpenPdf();
    };
  }, [openPdfFromPath]);

  const handleSettingsSaved = useCallback(async () => {
    const hasApiKey = await window.electron.ipcRenderer.invoke('byok:is-enabled');
    // Return to previous screen if has API key, otherwise stay in settings
    if (hasApiKey) {
      setScreen(previousScreen === 'viewer' && selectedDocument ? 'viewer' : 'browser');
    }
  }, [previousScreen, selectedDocument]);

  const handleSelectDocument = useCallback((doc: { id: string; name: string; workspacePath: string }) => {
    setSelectedDocument(doc);
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

  if (screen === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cream">
        <div className="text-center">
          <div className="text-6xl mb-4">📄</div>
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-okra-yellow mx-auto" />        </div>
      </div>
    );
  }

  if (screen === 'settings') {
    return (
      <>
        <SettingsScreen onClose={handleSettingsSaved} onSettingsSaved={handleSettingsSaved} />
        {/* <TelemetryBanner /> */}
      </>
    );
  }

  if (screen === 'browser') {
    return (
      <DragDropOverlay onFileDrop={openPdfFromPath}>
        <LocalDocumentBrowser
          onSelectDocument={handleSelectDocument}
          onOpenSettings={handleOpenSettings}
        />
        {/* <TelemetryBanner /> */}
      </DragDropOverlay>
    );
  }

  if (screen === 'viewer' && selectedDocument) {
    return (
      <LocalExtractionProvider
        workspaceId={selectedDocument.id}
        workspacePath={selectedDocument.workspacePath}
      >
        <DocumentViewer
          documentUuid={selectedDocument.id}
          documentName={selectedDocument.name}
          workspacePath={selectedDocument.workspacePath}
          onBack={handleBackToBrowser}
          onOpenSettings={handleOpenSettings}
        />
        {/* <TelemetryBanner /> */}
      </LocalExtractionProvider>
    );
  }

  return null;
}
