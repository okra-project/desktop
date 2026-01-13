/**
 * OkrapdfApiKeySection
 *
 * Allows users to configure a global okrapdf.com API key that can be
 * shared across all plugins that support okrapdf proxy mode.
 */

import React, { useState, useEffect } from 'react';

export function OkrapdfApiKeySection() {
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    window.electron.ipcRenderer
      .invoke('byok:get-okrapdf-key')
      .then((key: string | null) => {
        setSavedKey(key);
        if (key) setApiKey(key);
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    try {
      const settings = await window.electron.ipcRenderer.invoke(
        'byok:get-settings',
      );
      await window.electron.ipcRenderer.invoke('byok:set-settings', {
        ...settings,
        okrapdfApiKey: apiKey.trim(),
      });
      setSavedKey(apiKey.trim());
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save okrapdf key:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    try {
      const settings = await window.electron.ipcRenderer.invoke(
        'byok:get-settings',
      );
      await window.electron.ipcRenderer.invoke('byok:set-settings', {
        ...settings,
        okrapdfApiKey: null,
      });
      setSavedKey(null);
      setApiKey('');
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to clear okrapdf key:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const maskedKey = savedKey
    ? `okra_${savedKey.slice(5, 13)}${'•'.repeat(8)}`
    : null;

  return (
    <div className="bg-white rounded-xl border border-sidebar-border p-5 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-okra-yellow/20 rounded-xl flex items-center justify-center">
          <svg
            className="w-5 h-5 text-okra-yellow"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
            />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-ink">okrapdf.com API Key</h3>
          <p className="text-xs text-sidebar-text">
            Global key for plugins with okrapdf proxy mode
          </p>
        </div>
      </div>

      {savedKey && !isEditing ? (
        <div className="flex items-center gap-3">
          <div className="flex-1 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-green-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm font-mono text-green-700">
                {maskedKey}
              </span>
            </div>
          </div>
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-2 text-sm text-sidebar-text hover:bg-slate-100 rounded-lg transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleClear}
            disabled={isSaving}
            className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="okra_..."
              className="w-full px-4 py-2.5 pr-24 border border-sidebar-border rounded-xl focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-sidebar-text hover:text-ink rounded"
            >
              {showKey ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() =>
                window.electron.ipcRenderer.invoke(
                  'shell:open-external',
                  'https://app.okrapdf.com/settings',
                )
              }
              className="text-sm text-okra-yellow hover:underline"
            >
              Get your API key
            </button>
            <div className="flex items-center gap-2">
              {isEditing && (
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setApiKey(savedKey || '');
                  }}
                  className="px-3 py-1.5 text-sm text-sidebar-text hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!apiKey.trim() || isSaving}
                className="px-4 py-1.5 bg-okra-yellow hover:bg-okra-yellow/90 text-ink rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-sidebar-text">
        This key will be used by plugins like Google Document AI (okrapdf mode)
        so you don't need to enter it multiple times.
      </p>
    </div>
  );
}

export default OkrapdfApiKeySection;
