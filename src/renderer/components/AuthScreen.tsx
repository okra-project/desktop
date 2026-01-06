import React, { useState } from 'react';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Open OkraPDF in default browser for authentication
      const authUrl = 'https://app.okrapdf.com/sign-in?redirect_url=/settings/desktop';
      window.open(authUrl, '_blank');

      // Show instructions to user
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open browser');
    } finally {
      setIsLoading(false);
    }
  };

  const [token, setToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);

  const handleSubmitToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      await window.electron.ipcRenderer.invoke('auth:set-token', token.trim());
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
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">🥬</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">OkraPDF Desktop</h1>
          <p className="text-gray-600">
            Connect your local Claude agent to your documents
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {!showTokenInput ? (
            <>
              {/* Primary: Sign in with browser */}
              <button
                onClick={handleSignIn}
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors mb-4"
              >
                Sign in with OkraPDF
              </button>

              <div className="text-center text-sm text-gray-500 mb-4">
                Opens in your browser for secure authentication
              </div>

              <div className="border-t pt-4">
                <button
                  onClick={() => setShowTokenInput(true)}
                  className="w-full text-sm text-gray-600 hover:text-gray-800"
                >
                  Already have a token? Enter it manually →
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="font-medium text-blue-800 mb-2">Get your token:</h3>
                <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
                  <li>Sign in at app.okrapdf.com</li>
                  <li>Go to Settings → Desktop App</li>
                  <li>Click "Generate Token" and paste below</li>
                </ol>
              </div>

              <form onSubmit={handleSubmitToken}>
                <textarea
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your token here..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none font-mono text-sm mb-4"
                />

                <button
                  type="submit"
                  disabled={isLoading || !token.trim()}
                  className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                    isLoading || !token.trim()
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {isLoading ? 'Connecting...' : 'Connect'}
                </button>
              </form>

              <button
                onClick={() => setShowTokenInput(false)}
                className="w-full mt-4 text-sm text-gray-600 hover:text-gray-800"
              >
                ← Back
              </button>
            </>
          )}
        </div>

        {/* Benefits */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div className="p-4">
            <div className="text-2xl mb-2">🔒</div>
            <p className="text-sm text-gray-600">Data stays local</p>
          </div>
          <div className="p-4">
            <div className="text-2xl mb-2">💳</div>
            <p className="text-sm text-gray-600">Your Claude subscription</p>
          </div>
          <div className="p-4">
            <div className="text-2xl mb-2">⚡</div>
            <p className="text-sm text-gray-600">Full agent power</p>
          </div>
        </div>

        {/* Sign up link */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have an account?{' '}
          <a
            href="https://app.okrapdf.com/sign-up"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Sign up free
          </a>
        </p>
      </div>
    </div>
  );
}

export default AuthScreen;
