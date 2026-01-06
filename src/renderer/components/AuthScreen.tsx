import React, { useEffect, useState, useCallback } from 'react';
import { Clerk } from '@clerk/clerk-js';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

const CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsub2tyYXBkZi5jb20k';

function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [clerk, setClerk] = useState<Clerk | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize Clerk
  useEffect(() => {
    const initClerk = async () => {
      try {
        const clerkInstance = new Clerk(CLERK_PUBLISHABLE_KEY);
        await clerkInstance.load();
        setClerk(clerkInstance);
        setIsLoading(false);

        // Check if already signed in
        if (clerkInstance.session) {
          await handleClerkSession(clerkInstance);
        }
      } catch (err) {
        console.error('Clerk init error:', err);
        setError('Failed to initialize authentication');
        setIsLoading(false);
      }
    };

    initClerk();
  }, []);

  const handleClerkSession = useCallback(async (clerkInstance: Clerk) => {
    try {
      if (!clerkInstance.session) return;

      // Get session token for API calls
      const token = await clerkInstance.session.getToken();
      if (token) {
        await window.electron.ipcRenderer.invoke('auth:set-token', token);

        // Verify token works
        const result = await window.electron.ipcRenderer.invoke('library:fetch');
        if (result.success) {
          onAuthenticated();
        } else {
          setError('Failed to verify session. Please try again.');
        }
      }
    } catch (err) {
      console.error('Session error:', err);
      setError('Failed to get session token');
    }
  }, [onAuthenticated]);

  // Mount Clerk's SignIn component
  useEffect(() => {
    if (!clerk || isLoading) return;

    const signInDiv = document.getElementById('clerk-sign-in');
    if (!signInDiv) return;

    // Mount Clerk's SignIn UI
    clerk.mountSignIn(signInDiv, {
      appearance: {
        elements: {
          rootBox: 'w-full',
          card: 'shadow-none border-0',
          headerTitle: 'text-xl font-semibold text-gray-800',
          headerSubtitle: 'text-gray-600',
          socialButtonsBlockButton: 'border border-gray-300 hover:bg-gray-50',
          formButtonPrimary: 'bg-emerald-600 hover:bg-emerald-700',
          footerActionLink: 'text-emerald-600 hover:text-emerald-700',
        },
      },
    });

    // Listen for successful sign-in
    const handleUserChange = async () => {
      if (clerk.session) {
        await handleClerkSession(clerk);
      }
    };

    clerk.addListener(handleUserChange);

    return () => {
      clerk.unmountSignIn(signInDiv);
      clerk.removeListener(handleUserChange);
    };
  }, [clerk, isLoading, handleClerkSession]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100">
        <div className="text-center">
          <div className="text-6xl mb-4">🥬</div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 p-8">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">🥬</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">OkraPDF Desktop</h1>
          <p className="text-gray-600">
            Sign in to connect your documents
          </p>
        </div>

        {/* Clerk SignIn Component */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div id="clerk-sign-in" className="w-full" />
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
