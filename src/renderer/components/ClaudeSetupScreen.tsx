import React, { useState } from 'react';

interface ClaudeStatus {
  claudeInstalled: boolean;
  claudeAuthenticated: boolean;
  hasUserApiKey: boolean;
  hasEnvApiKey: boolean;
  hasProxyAuth: boolean;
  ready: boolean;
}

interface ClaudeSetupScreenProps {
  onReady: () => void;
  claudeStatus: ClaudeStatus | null;
}

/**
 * ClaudeSetupScreen - BYOA (Bring Your Own Agent) setup
 *
 * Inspired by:
 * - Jan: Provider settings with API key input
 * - OpenHands: LLM API key configuration
 * - OpenCode: /connect command for BYOK
 * - Dyad: Settings page for provider API keys
 */
function ClaudeSetupScreen({ onReady, claudeStatus }: ClaudeSetupScreenProps) {
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmitApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      await window.electron.ipcRenderer.invoke('settings:set-api-key', apiKey.trim());
      onReady();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshStatus = async () => {
    setIsLoading(true);
    try {
      const status = await window.electron.ipcRenderer.invoke('claude:check-status');
      if (status.ready) {
        onReady();
      } else {
        setError('Claude Code CLI not detected. Please install it or enter an API key below.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check status');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-cream p-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🥬</div>
          <h1 className="text-3xl font-bold font-serif text-ink mb-2">OkraPDF Desktop</h1>
          <p className="text-sidebar-text">
            Use your own Claude subscription - no API billing through OkraPDF
          </p>
        </div>

        {/* Setup Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-sidebar-border">
          <h2 className="text-xl font-semibold text-ink mb-6">
            Connect Your Claude Account
          </h2>

          {/* Status Display */}
          <div className="mb-6 p-4 bg-sidebar-bg rounded-lg border border-sidebar-border">
            <h3 className="font-medium text-ink mb-3">Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-sidebar-text">Claude Code CLI</span>
                <span className={claudeStatus?.claudeInstalled ? 'text-green-600' : 'text-gray-400'}>
                  {claudeStatus?.claudeInstalled ? '✓ Installed' : '✗ Not found'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sidebar-text">CLI Authenticated</span>
                <span className={claudeStatus?.claudeAuthenticated ? 'text-green-600' : 'text-gray-400'}>
                  {claudeStatus?.claudeAuthenticated ? '✓ Yes' : '✗ No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sidebar-text">API Key (BYOK)</span>
                <span className={claudeStatus?.hasUserApiKey ? 'text-green-600' : 'text-gray-400'}>
                  {claudeStatus?.hasUserApiKey ? '✓ Set' : '✗ Not set'}
                </span>
              </div>
            </div>
            <button
              onClick={handleRefreshStatus}
              disabled={isLoading}
              className="mt-3 text-sm text-okra-orange hover:text-okra-orange/80"
            >
              Refresh Status
            </button>
          </div>

          {/* Option 1: Claude Code CLI */}
          <div className="mb-6 p-4 bg-lavender/30 rounded-lg border border-lavender/50">
            <h3 className="font-medium text-ink mb-2">Option 1: Use Claude Code CLI (Recommended)</h3>
            <ol className="text-sm text-sidebar-text list-decimal list-inside space-y-1">
              <li>
                Install Claude Code CLI:{' '}
                <code className="bg-lavender px-1 rounded text-ink">npm install -g @anthropic-ai/claude-code</code>
              </li>
              <li>Run <code className="bg-lavender px-1 rounded text-ink">claude</code> in terminal to authenticate</li>
              <li>Click "Refresh Status" above</li>
            </ol>
            <a
              href="https://docs.anthropic.com/en/docs/claude-code"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-sm text-okra-orange hover:text-okra-orange/80 underline"
            >
              Learn more about Claude Code CLI →
            </a>
          </div>

          {/* Option 2: Direct API Key */}
          <div className="mb-6">
            <h3 className="font-medium text-ink mb-2">Option 2: Enter API Key Directly</h3>
            <p className="text-sm text-sidebar-text mb-3">
              Get your API key from{' '}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-okra-orange hover:text-okra-orange/80 underline"
              >
                console.anthropic.com
              </a>
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmitApiKey}>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="w-full px-4 py-3 border border-sidebar-border rounded-lg focus:ring-2 focus:ring-okra-orange focus:border-okra-orange font-mono text-sm mb-3 bg-white text-ink"
              />
              <button
                type="submit"
                disabled={isLoading || !apiKey.trim()}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                  isLoading || !apiKey.trim()
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-okra-yellow text-ink hover:bg-okra-yellow-hover'
                }`}
              >
                {isLoading ? 'Saving...' : 'Save API Key'}
              </button>
            </form>
          </div>

          {/* Privacy Note */}
          <div className="pt-4 border-t border-sidebar-border">
            <p className="text-xs text-sidebar-text text-center">
              Your API key is stored locally on your device and never sent to OkraPDF servers.
              You are billed directly by Anthropic for your usage.
            </p>
          </div>
        </div>

        {/* Benefits */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div className="p-4">
            <div className="text-2xl mb-2">💰</div>
            <p className="text-sm text-sidebar-text">Use your own pricing tier</p>
          </div>
          <div className="p-4">
            <div className="text-2xl mb-2">🔐</div>
            <p className="text-sm text-sidebar-text">Keys stay on your device</p>
          </div>
          <div className="p-4">
            <div className="text-2xl mb-2">⚡</div>
            <p className="text-sm text-sidebar-text">Full Claude capabilities</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClaudeSetupScreen;
