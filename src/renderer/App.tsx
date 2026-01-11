import { useState, useEffect, useCallback } from 'react';
import LocalDocumentBrowser from './components/LocalDocumentBrowser';
import DocumentViewer from './components/DocumentViewer';
import TelemetryBanner from './components/TelemetryBanner';
import SettingsScreen from './components/SettingsScreen';
import './App.css';

type AppScreen = 'loading' | 'settings' | 'browser' | 'viewer';

interface SelectedDocument {
  id: string;
  name: string;
  workspacePath: string;
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [selectedDocument, setSelectedDocument] = useState<SelectedDocument | null>(null);

  useEffect(() => {
    const checkStartup = async () => {
      try {
        const hasApiKey = await window.electron.ipcRenderer.invoke('byok:is-enabled');
        setScreen(hasApiKey ? 'browser' : 'settings');
      } catch {
        setScreen('settings');
      }
    };
    checkStartup();

    const unsubSettings = window.electron.ipcRenderer.on('menu:open-settings', () => {
      setScreen('settings');
    });

    const unsubOpenPdf = window.electron.ipcRenderer.on('menu:open-pdf', async (filePath: unknown) => {
      if (typeof filePath !== 'string') return;
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
    });

    return () => {
      unsubSettings();
      unsubOpenPdf();
    };
  }, []);

  const handleSettingsSaved = useCallback(async () => {
    const hasApiKey = await window.electron.ipcRenderer.invoke('byok:is-enabled');
    setScreen(hasApiKey ? 'browser' : 'settings');
  }, []);

  const handleSelectDocument = useCallback((doc: { id: string; name: string; workspacePath: string }) => {
    setSelectedDocument(doc);
    setScreen('viewer');
  }, []);

  const handleBackToBrowser = useCallback(() => {
    setSelectedDocument(null);
    setScreen('browser');
  }, []);

  const handleOpenSettings = useCallback(() => {
    setScreen('settings');
  }, []);

  if (screen === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cream">
        <div className="text-center">
          <div className="text-6xl mb-4">📄</div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-okra-orange mx-auto" />
        </div>
      </div>
    );
  }

  if (screen === 'settings') {
    return (
      <>
        <SettingsScreen onClose={handleSettingsSaved} onSettingsSaved={handleSettingsSaved} />
        <TelemetryBanner />
      </>
    );
  }

  if (screen === 'browser') {
    return (
      <>
        <LocalDocumentBrowser
          onSelectDocument={handleSelectDocument}
          onOpenSettings={handleOpenSettings}
        />
        <TelemetryBanner />
      </>
    );
  }

  if (screen === 'viewer' && selectedDocument) {
    return (
      <>
        <DocumentViewer
          documentUuid={selectedDocument.id}
          documentName={selectedDocument.name}
          workspacePath={selectedDocument.workspacePath}
          onBack={handleBackToBrowser}
        />
        <TelemetryBanner />
      </>
    );
  }

  return null;
}
