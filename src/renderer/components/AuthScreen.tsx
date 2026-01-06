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
      // Open OAuth popup window
      const result = await window.electron.ipcRenderer.invoke('auth:oauth-popup');

      if (result.success && result.token) {
        // Save the token
        await window.electron.ipcRenderer.invoke('auth:set-token', result.token);

        // Verify token works by fetching library
        const libraryResult = await window.electron.ipcRenderer.invoke('library:fetch');

        if (libraryResult.success) {
          onAuthenticated();
        } else {
          setError('Failed to verify session. Please try again.');
          await window.electron.ipcRenderer.invoke('auth:clear-token');
        }
      } else if (result.error) {
        if (result.error !== 'Authentication cancelled') {
          setError(result.error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-cream p-8">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🥬</div>
          <h1 className="text-3xl font-bold font-serif text-ink mb-2">OkraPDF Desktop</h1>
          <p className="text-sidebar-text">
            Connect your local Claude agent to your documents
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-sidebar-border">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={isLoading}
            className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all ${
              isLoading
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-okra-yellow text-ink hover:bg-okra-yellow-hover shadow-lg hover:shadow-xl'
            }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-3">
                <span className="animate-spin h-5 w-5 border-2 border-ink border-t-transparent rounded-full" />
                Signing in...
              </span>
            ) : (
              'Sign in with OkraPDF'
            )}
          </button>

          <p className="text-center text-sm text-sidebar-text mt-4">
            Sign in with Google, email, or your existing account
          </p>
        </div>

        {/* Benefits */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div className="p-4">
            <div className="text-2xl mb-2">🔒</div>
            <p className="text-sm text-sidebar-text">Data stays local</p>
          </div>
          <div className="p-4">
            <div className="text-2xl mb-2">💳</div>
            <p className="text-sm text-sidebar-text">Your Claude subscription</p>
          </div>
          <div className="p-4">
            <div className="text-2xl mb-2">⚡</div>
            <p className="text-sm text-sidebar-text">Full agent power</p>
          </div>
        </div>

        {/* Sign up link */}
        <p className="text-center text-sm text-sidebar-text mt-6">
          Don't have an account?{' '}
          <button
            onClick={() => {
              window.open('https://app.okrapdf.com/sign-up', '_blank');
            }}
            className="text-okra-orange hover:text-okra-orange/80 font-medium"
          >
            Sign up free
          </button>
        </p>
      </div>
    </div>
  );
}

export default AuthScreen;
