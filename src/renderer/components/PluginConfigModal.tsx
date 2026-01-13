import React, { useState, useEffect } from 'react';
import {
  PluginState,
  type OcrProviderMetadata,
  type OcrProviderConfig,
} from '../hooks/useOcrProviders';

interface PluginConfigModalProps {
  provider: OcrProviderMetadata;
  config: OcrProviderConfig | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: OcrProviderConfig) => Promise<void>;
  onTest: (
    config: OcrProviderConfig,
  ) => Promise<{ ok: boolean; error?: string; latencyMs?: number }>;
  onUninstall?: () => Promise<{ success: boolean; error?: string }>;
}

export function PluginConfigModal({
  provider,
  config,
  isOpen,
  onClose,
  onSave,
  onTest,
  onUninstall,
}: PluginConfigModalProps) {
  const [localConfig, setLocalConfig] = useState<OcrProviderConfig>(
    config ?? {},
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
    latencyMs?: number;
  } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const pluginState = provider.state ?? PluginState.Installed;
  const isUninstalling = pluginState === PluginState.Uninstalling;

  useEffect(() => {
    if (config) setLocalConfig(config);
  }, [config]);

  useEffect(() => {
    if (isOpen) {
      setTestResult(null);
    }
  }, [isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(localConfig);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(localConfig);
      setTestResult(result);
    } finally {
      setIsTesting(false);
    }
  };

  const handleUninstall = async () => {
    if (!onUninstall) return;
    await onUninstall();
    onClose();
  };

  if (!isOpen) return null;

  const capabilityBadges: string[] = [];
  if (provider.capabilities.supportsBboxes)
    capabilityBadges.push('Bounding Boxes');
  if (provider.capabilities.supportsTables) capabilityBadges.push('Tables');
  if (provider.capabilities.supportsHandwriting)
    capabilityBadges.push('Handwriting');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-sidebar-border">
          <div>
            <h2 className="text-xl font-bold text-ink">{provider.name}</h2>
            <p className="text-sm text-sidebar-text mt-0.5">
              {provider.description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-wrap gap-1.5 mb-6">
            {capabilityBadges.map((badge) => (
              <span
                key={badge}
                className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full"
              >
                {badge}
              </span>
            ))}
            {provider.costPerPage && (
              <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full">
                ~${provider.costPerPage}/page
              </span>
            )}
          </div>

          <div className="space-y-5">
            {/* Auth mode selector for google-docai */}
            {provider.id === 'google-docai' && (
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  Authentication Mode
                </label>
                <select
                  value={
                    (localConfig.options?.authMode as string) ?? 'okrapdf'
                  }
                  onChange={(e) =>
                    setLocalConfig((c) => ({
                      ...c,
                      options: { ...c.options, authMode: e.target.value },
                    }))
                  }
                  className="w-full px-4 py-3 border border-sidebar-border rounded-xl focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 text-sm bg-white"
                >
                  <option value="okrapdf">
                    okrapdf.com (Recommended - just API key)
                  </option>
                  <option value="direct">
                    Direct Google Credentials (Advanced)
                  </option>
                </select>
              </div>
            )}

            {/* API Key field */}
            <div>
              <label className="block text-sm font-medium text-ink mb-2">
                {provider.id === 'google-docai' &&
                (localConfig.options?.authMode as string) === 'direct'
                  ? 'Service Account Key (JSON)'
                  : 'API Key'}
              </label>
              {provider.id === 'google-docai' &&
              (localConfig.options?.authMode as string) === 'direct' ? (
                <textarea
                  value={localConfig.apiKey ?? ''}
                  onChange={(e) =>
                    setLocalConfig((c) => ({ ...c, apiKey: e.target.value }))
                  }
                  placeholder='{"type": "service_account", ...}'
                  rows={5}
                  className="w-full px-4 py-3 border border-sidebar-border rounded-xl focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 font-mono text-xs resize-none"
                />
              ) : (
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={localConfig.apiKey ?? ''}
                    onChange={(e) =>
                      setLocalConfig((c) => ({ ...c, apiKey: e.target.value }))
                    }
                    placeholder={
                      provider.id === 'google-docai' ? 'okra_...' : 'sk-...'
                    }
                    className="w-full px-4 py-3 pr-12 border border-sidebar-border rounded-xl focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-sidebar-text hover:text-ink rounded"
                  >
                    {showApiKey ? (
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
              )}
              {provider.id === 'google-docai' &&
                (localConfig.options?.authMode as string) !== 'direct' && (
                  <p className="mt-2 text-xs text-sidebar-text">
                    Get your API key at{' '}
                    <button
                      onClick={() =>
                        window.electron.ipcRenderer.invoke(
                          'shell:open-external',
                          'https://app.okrapdf.com/settings',
                        )
                      }
                      className="text-okra-yellow underline hover:opacity-80"
                    >
                      app.okrapdf.com/settings
                    </button>
                  </p>
                )}
            </div>

            {/* Direct mode fields for google-docai */}
            {provider.id === 'google-docai' &&
              (localConfig.options?.authMode as string) === 'direct' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">
                      Project ID
                    </label>
                    <input
                      type="text"
                      value={localConfig.projectId ?? ''}
                      onChange={(e) =>
                        setLocalConfig((c) => ({
                          ...c,
                          projectId: e.target.value,
                        }))
                      }
                      placeholder="my-gcp-project"
                      className="w-full px-4 py-3 border border-sidebar-border rounded-xl focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">
                      Processor ID
                    </label>
                    <input
                      type="text"
                      value={localConfig.processorId ?? ''}
                      onChange={(e) =>
                        setLocalConfig((c) => ({
                          ...c,
                          processorId: e.target.value,
                        }))
                      }
                      placeholder="abc123..."
                      className="w-full px-4 py-3 border border-sidebar-border rounded-xl focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 text-sm"
                    />
                  </div>
                </div>
              )}

            {provider.id === 'openrouter' && (
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  Model
                </label>
                <select
                  value={localConfig.modelId ?? 'qwen/qwen2.5-vl-72b-instruct'}
                  onChange={(e) =>
                    setLocalConfig((c) => ({ ...c, modelId: e.target.value }))
                  }
                  className="w-full px-4 py-3 border border-sidebar-border rounded-xl focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 text-sm bg-white"
                >
                  <option value="qwen/qwen2.5-vl-72b-instruct">
                    Qwen 2.5 VL 72B (Best value)
                  </option>
                  <option value="anthropic/claude-3.5-sonnet">
                    Claude 3.5 Sonnet
                  </option>
                  <option value="google/gemini-pro-vision">
                    Gemini Pro Vision
                  </option>
                </select>
              </div>
            )}

            {provider.id === 'anthropic' && (
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  Model
                </label>
                <select
                  value={localConfig.modelId ?? 'claude-sonnet-4-20250514'}
                  onChange={(e) =>
                    setLocalConfig((c) => ({ ...c, modelId: e.target.value }))
                  }
                  className="w-full px-4 py-3 border border-sidebar-border rounded-xl focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 text-sm bg-white"
                >
                  <option value="claude-sonnet-4-20250514">
                    Claude Sonnet 4 (Recommended)
                  </option>
                  <option value="claude-opus-4-20250514">Claude Opus 4</option>
                  <option value="claude-3-5-sonnet-latest">
                    Claude 3.5 Sonnet
                  </option>
                </select>
              </div>
            )}

            {testResult && (
              <div
                className={`p-4 rounded-xl text-sm ${testResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}
              >
                {testResult.ok ? (
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Connected successfully ({testResult.latencyMs}ms)
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {testResult.error}
                  </div>
                )}
              </div>
            )}

            {provider.documentationUrl && (
              <button
                onClick={() =>
                  window.electron.ipcRenderer.invoke(
                    'shell:open-external',
                    provider.documentationUrl,
                  )
                }
                className="text-sm text-ink underline decoration-okra-yellow hover:opacity-80 flex items-center gap-1"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                View setup instructions
              </button>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-sidebar-border bg-slate-50">
          <div className="flex items-center justify-between">
            <div>
              {provider.npmPackages && provider.npmPackages.length > 0 && (
                <button
                  onClick={handleUninstall}
                  disabled={isUninstalling}
                  className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isUninstalling ? 'Removing...' : 'Uninstall'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleTest}
                disabled={!localConfig.apiKey || isTesting}
                className="px-4 py-2 bg-white border border-sidebar-border hover:bg-slate-50 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2 bg-okra-yellow hover:bg-okra-yellow/90 text-ink rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PluginConfigModal;
