import { useState, useEffect, useCallback } from 'react';
import ChatInterface from './components/ChatInterface';
import AuthScreen from './components/AuthScreen';
import DocumentBrowser from './components/DocumentBrowser';
import ClaudeSetupScreen from './components/ClaudeSetupScreen';
import './App.css';

type AppScreen = 'loading' | 'claude-setup' | 'auth' | 'browser' | 'chat';

interface SelectedDocument {
  uuid: string;
  file_name: string;
}

interface ClaudeStatus {
  claudeInstalled: boolean;
  claudeAuthenticated: boolean;
  hasUserApiKey: boolean;
  hasEnvApiKey: boolean;
  ready: boolean;
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [selectedDocument, setSelectedDocument] = useState<SelectedDocument | null>(null);
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus | null>(null);

  // Check for Claude status and existing auth on startup
  useEffect(() => {
    const checkStartup = async () => {
      try {
        // First check if Claude/API key is ready (BYOA)
        const status = await window.electron.ipcRenderer.invoke('claude:check-status') as ClaudeStatus;
        setClaudeStatus(status);

        if (!status.ready) {
          // Need to set up Claude or API key first
          setScreen('claude-setup');
          return;
        }

        // Then check OkraPDF auth
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

  const handleClaudeReady = useCallback(() => {
    setScreen('auth');
  }, []);

  const handleAuthenticated = useCallback(() => {
    setScreen('browser');
  }, []);

  const handleLogout = useCallback(async () => {
    await window.electron.ipcRenderer.invoke('auth:clear-token');
    setSelectedDocument(null);
    setScreen('auth');
  }, []);

  const handleSelectDocument = useCallback((doc: { uuid: string; file_name: string }) => {
    setSelectedDocument(doc);
    setScreen('chat');
  }, []);

  const handleBackToBrowser = useCallback(() => {
    setSelectedDocument(null);
    setScreen('browser');
  }, []);

  // Loading screen
  if (screen === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100">
        <div className="text-center">
          <div className="text-6xl mb-4">🥬</div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  // Claude setup screen (BYOA - Bring Your Own Agent)
  if (screen === 'claude-setup') {
    return <ClaudeSetupScreen onReady={handleClaudeReady} claudeStatus={claudeStatus} />;
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

  // Chat interface with document context
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header with document info and back button */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBackToBrowser}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Back to documents"
            >
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-800">
                {selectedDocument?.file_name || 'OkraPDF Desktop'}
              </h1>
              <p className="text-sm text-gray-500">
                Connected to local Claude agent
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              <span className="w-2 h-2 bg-emerald-500 rounded-full mr-1.5 animate-pulse"></span>
              Local Agent
            </span>
          </div>
        </div>
      </header>

      <ChatInterface />
    </div>
  );
}
