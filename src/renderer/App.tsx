import { useState, useEffect, useCallback } from 'react';
import AuthScreen from './components/AuthScreen';
import DocumentBrowser from './components/DocumentBrowser';
import DocumentViewer from './components/DocumentViewer';
import './App.css';

type AppScreen = 'loading' | 'auth' | 'browser' | 'viewer';

interface SelectedDocument {
  uuid: string;
  file_name: string;
  workspacePath: string;
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [selectedDocument, setSelectedDocument] = useState<SelectedDocument | null>(null);

  // Check for existing auth on startup
  useEffect(() => {
    const checkStartup = async () => {
      try {
        // Check OkraPDF auth
        const { token } = await window.electron.ipcRenderer.invoke('auth:get-token');
        if (token) {
          // Verify token is still valid
          const result = await window.electron.ipcRenderer.invoke('library:fetch');
          if (result.success) {
            setScreen('browser');
            return;
          }
        }
        setScreen('auth');
      } catch {
        setScreen('auth');
      }
    };

    checkStartup();
  }, []);

  const handleAuthenticated = useCallback(() => {
    setScreen('browser');
  }, []);

  const handleLogout = useCallback(async () => {
    await window.electron.ipcRenderer.invoke('auth:clear-token');
    setSelectedDocument(null);
    setScreen('auth');
  }, []);

  const handleSelectDocument = useCallback(
    async (doc: { uuid: string; file_name: string }) => {
      // Bootstrap workspace before switching to viewer
      try {
        const result = await window.electron.ipcRenderer.invoke(
          'workspace:bootstrap',
          doc.uuid,
          doc.file_name
        );

        if (result.success) {
          setSelectedDocument({
            uuid: doc.uuid,
            file_name: doc.file_name,
            workspacePath: result.workspacePath,
          });
          setScreen('viewer');
        } else {
          console.error('Failed to bootstrap workspace:', result.error);
          alert(`Failed to load document: ${result.error}`);
        }
      } catch (err) {
        console.error('Bootstrap error:', err);
        alert('Failed to load document. Please try again.');
      }
    },
    []
  );

  const handleBackToBrowser = useCallback(() => {
    setSelectedDocument(null);
    setScreen('browser');
  }, []);

  // Loading screen
  if (screen === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cream">
        <div className="text-center">
          <div className="text-6xl mb-4">📄</div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-okra-orange mx-auto"></div>
        </div>
      </div>
    );
  }

  // Auth screen
  if (screen === 'auth') {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  // Document browser
  if (screen === 'browser') {
    return (
      <DocumentBrowser
        onSelectDocument={handleSelectDocument}
        onLogout={handleLogout}
      />
    );
  }

  // Two-panel document viewer (PDF + Chat)
  if (screen === 'viewer' && selectedDocument) {
    return (
      <DocumentViewer
        documentUuid={selectedDocument.uuid}
        documentName={selectedDocument.file_name}
        workspacePath={selectedDocument.workspacePath}
        onBack={handleBackToBrowser}
      />
    );
  }

  // Fallback
  return (
    <div className="flex items-center justify-center min-h-screen bg-cream">
      <div className="text-center">
        <div className="text-6xl mb-4">📄</div>
        <p className="text-slate-500">Loading...</p>
      </div>
    </div>
  );
}
