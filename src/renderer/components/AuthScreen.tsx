import React, { useState } from 'react';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      // Set the token
      await window.electron.ipcRenderer.invoke('auth:set-token', token.trim());

      // Verify it works by fetching library
      const result = await window.electron.ipcRenderer.invoke('library:fetch');

      if (result.success) {
        onAuthenticated();
      } else {
        setError(result.error || 'Invalid token. Please try again.');
        await window.electron.ipcRenderer.invoke('auth:clear-token');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      await window.electron.ipcRenderer.invoke('auth:clear-token');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 p-8">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🥬</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">OkraPDF Desktop</h1>
          <p className="text-gray-600">
            Connect your local Claude agent to your OkraPDF documents
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">
            Connect to OkraPDF
          </h2>

          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-medium text-blue-800 mb-2">How to get your token:</h3>
            <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
              <li>
                Go to{' '}
                <a
                  href="https://app.okrapdf.com/settings/desktop"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-blue-900"
                >
                  app.okrapdf.com/settings/desktop
                </a>
              </li>
              <li>Click "Generate Desktop Token"</li>
              <li>Copy and paste the token below</li>
            </ol>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label
                htmlFor="token"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Session Token
              </label>
              <textarea
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your token here..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none font-mono text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !token.trim()}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                isLoading || !token.trim()
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                  Connecting...
                </span>
              ) : (
                'Connect'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center">
              Don't have an account?{' '}
              <a
                href="https://app.okrapdf.com/sign-up"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Sign up for free
              </a>
            </p>
          </div>
        </div>

        {/* Benefits */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div className="p-4">
            <div className="text-2xl mb-2">🔒</div>
            <p className="text-sm text-gray-600">Your data stays local</p>
          </div>
          <div className="p-4">
            <div className="text-2xl mb-2">💳</div>
            <p className="text-sm text-gray-600">Use your Claude subscription</p>
          </div>
          <div className="p-4">
            <div className="text-2xl mb-2">⚡</div>
            <p className="text-sm text-gray-600">Full Claude Code power</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;
