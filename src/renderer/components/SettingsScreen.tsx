import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOcrProviders, type OcrProviderMetadata, type OcrProviderConfig, type OcrProviderId, type OcrProviderCategory } from '../hooks/useOcrProviders';

interface SettingsScreenProps {
  onClose: () => void;
  onSettingsSaved?: () => void;
}

// Category display info
const CATEGORY_INFO: Record<OcrProviderCategory, { label: string; description: string; icon: React.ReactNode }> = {
  agent: {
    label: 'Agent Providers',
    description: 'Powers document chat and analysis',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    ),
  },
  ocr: {
    label: 'OCR Providers',
    description: 'Extract text and bounding boxes from documents',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  vlm: {
    label: 'Vision-Language Models',
    description: 'AI models for visual document understanding',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
};

// ============================================================================
// OCR Provider Card Component
// ============================================================================

interface ProviderCardProps {
  provider: OcrProviderMetadata;
  config: OcrProviderConfig | null;
  onSave: (config: OcrProviderConfig) => Promise<void>;
  onTest: (config: OcrProviderConfig) => Promise<{ ok: boolean; error?: string; latencyMs?: number }>;
}

function ProviderCard({ provider, config, onSave, onTest }: ProviderCardProps) {
  const [localConfig, setLocalConfig] = useState<OcrProviderConfig>(config ?? {});
  const [expanded, setExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; latencyMs?: number } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // Reset local config when prop changes
  useEffect(() => {
    if (config) setLocalConfig(config);
  }, [config]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(localConfig);
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

  const isConfigured = !!localConfig.apiKey;
  const capabilityBadges = [];
  if (provider.capabilities.supportsBboxes) capabilityBadges.push('Bounding Boxes');
  if (provider.capabilities.supportsTables) capabilityBadges.push('Tables');
  if (provider.capabilities.supportsHandwriting) capabilityBadges.push('Handwriting');

  return (
    <div className="border border-sidebar-border rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isConfigured ? 'bg-green-100' : 'bg-slate-100'
          }`}>
            {provider.id === 'google-docai' && (
              <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/>
              </svg>
            )}
            {provider.id === 'openrouter' && (
              <svg className="w-5 h-5 text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            {provider.id === 'anthropic' && (
              <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.304 3.541l-5.296 16.918H9.262l5.296-16.918h2.746zm-7.63 0L4.377 20.459H1.631L6.927 3.541h2.747z"/>
              </svg>
            )}
            {!['google-docai', 'openrouter', 'anthropic'].includes(provider.id) && (
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            )}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">{provider.name}</span>
              {isConfigured && (
                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-medium rounded">
                  Configured
                </span>
              )}
            </div>
            <p className="text-xs text-sidebar-text">{provider.description}</p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-sidebar-text transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-sidebar-border">
          {/* Capabilities */}
          <div className="pt-3 pb-3 flex flex-wrap gap-1.5">
            {capabilityBadges.map((badge) => (
              <span
                key={badge}
                className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-medium rounded-full"
              >
                {badge}
              </span>
            ))}
            {provider.costPerPage && (
              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-medium rounded-full">
                ~${provider.costPerPage}/page
              </span>
            )}
          </div>

          {/* Configuration form */}
          <div className="space-y-4">
            {/* API Key field */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                {provider.id === 'google-docai' ? 'Service Account Key (JSON)' : 'API Key'}
              </label>
              <div className="relative">
                {provider.id === 'google-docai' ? (
                  <textarea
                    value={localConfig.apiKey ?? ''}
                    onChange={(e) => setLocalConfig((c) => ({ ...c, apiKey: e.target.value }))}
                    placeholder='{"type": "service_account", ...}'
                    rows={4}
                    className="w-full px-3 py-2 border border-sidebar-border rounded-lg focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 font-mono text-xs"
                  />
                ) : (
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={localConfig.apiKey ?? ''}
                      onChange={(e) => setLocalConfig((c) => ({ ...c, apiKey: e.target.value }))}
                      placeholder="sk-..."
                      className="w-full px-3 py-2.5 pr-10 border border-sidebar-border rounded-lg focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sidebar-text hover:text-ink"
                    >
                      {showApiKey ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Provider-specific fields */}
            {provider.id === 'google-docai' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">Project ID</label>
                    <input
                      type="text"
                      value={localConfig.projectId ?? ''}
                      onChange={(e) => setLocalConfig((c) => ({ ...c, projectId: e.target.value }))}
                      placeholder="my-gcp-project"
                      className="w-full px-3 py-2 border border-sidebar-border rounded-lg focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">Processor ID</label>
                    <input
                      type="text"
                      value={localConfig.processorId ?? ''}
                      onChange={(e) => setLocalConfig((c) => ({ ...c, processorId: e.target.value }))}
                      placeholder="abc123..."
                      className="w-full px-3 py-2 border border-sidebar-border rounded-lg focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 text-sm"
                    />
                  </div>
                </div>
              </>
            )}

            {provider.id === 'openrouter' && (
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Model</label>
                <select
                  value={localConfig.modelId ?? 'qwen/qwen2.5-vl-72b-instruct'}
                  onChange={(e) => setLocalConfig((c) => ({ ...c, modelId: e.target.value }))}
                  className="w-full px-3 py-2 border border-sidebar-border rounded-lg focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 text-sm"
                >
                  <option value="qwen/qwen2.5-vl-72b-instruct">Qwen 2.5 VL 72B (Best value)</option>
                  <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="google/gemini-pro-vision">Gemini Pro Vision</option>
                </select>
              </div>
            )}

            {provider.id === 'anthropic' && (
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Model</label>
                <select
                  value={localConfig.modelId ?? 'claude-sonnet-4-20250514'}
                  onChange={(e) => setLocalConfig((c) => ({ ...c, modelId: e.target.value }))}
                  className="w-full px-3 py-2 border border-sidebar-border rounded-lg focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 text-sm"
                >
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (Recommended)</option>
                  <option value="claude-opus-4-20250514">Claude Opus 4</option>
                  <option value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</option>
                </select>
              </div>
            )}

            {/* Test result */}
            {testResult && (
              <div className={`p-2.5 rounded-lg text-sm ${
                testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {testResult.ok ? (
                  <span>Connected successfully ({testResult.latencyMs}ms)</span>
                ) : (
                  <span>Connection failed: {testResult.error}</span>
                )}
              </div>
            )}

            {/* Documentation link */}
            {provider.documentationUrl && (
              <p className="text-xs text-sidebar-text">
                <button
                  onClick={() => window.electron.ipcRenderer.invoke('shell:open-external', provider.documentationUrl)}
                  className="text-ink underline decoration-okra-yellow hover:opacity-80"
                >
                  View setup instructions
                </button>
              </p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={handleTest}
                disabled={!localConfig.apiKey || isTesting}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-3 py-1.5 bg-okra-yellow hover:bg-okra-yellow-hover text-ink rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Settings Screen
// ============================================================================

function SettingsScreen({ onClose, onSettingsSaved }: SettingsScreenProps) {
  const [isLoading, setIsLoading] = useState(true);

  // All providers (agent, ocr, vlm) are now unified
  const { providers, loading: loadingProviders, getConfig, saveConfig, checkHealth } = useOcrProviders();
  const [providerConfigs, setProviderConfigs] = useState<Record<OcrProviderId, OcrProviderConfig | null>>({});

  // Group providers by category
  const providersByCategory = useMemo(() => {
    const grouped: Record<OcrProviderCategory, OcrProviderMetadata[]> = {
      agent: [],
      ocr: [],
      vlm: [],
    };
    for (const provider of providers) {
      const category = provider.category || 'ocr';
      grouped[category].push(provider);
    }
    return grouped;
  }, [providers]);

  // Load provider configs when providers are loaded
  useEffect(() => {
    if (providers.length > 0) {
      loadProviderConfigs();
    } else if (!loadingProviders) {
      setIsLoading(false);
    }
  }, [providers, loadingProviders]);

  const loadProviderConfigs = async () => {
    const configs: Record<OcrProviderId, OcrProviderConfig | null> = {};
    for (const provider of providers) {
      configs[provider.id] = await getConfig(provider.id);
    }
    setProviderConfigs(configs);
    setIsLoading(false);
  };

  const handleProviderSave = useCallback(async (providerId: OcrProviderId, config: OcrProviderConfig) => {
    await saveConfig(providerId, config);
    setProviderConfigs((prev) => ({ ...prev, [providerId]: config }));
    onSettingsSaved?.();
  }, [saveConfig, onSettingsSaved]);

  const handleProviderTest = useCallback(async (providerId: OcrProviderId, config: OcrProviderConfig) => {
    return checkHealth(providerId, config);
  }, [checkHealth]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cream">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-okra-yellow" />
      </div>
    );
  }

  // Order for displaying categories
  const categoryOrder: OcrProviderCategory[] = ['agent', 'ocr', 'vlm'];

  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">Settings</h1>
            <p className="text-sidebar-text mt-1">Configure providers and credentials</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-sidebar-hover rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Local processing notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm mb-6">
          <p className="text-amber-800">
            <strong>Local Processing:</strong> Your PDFs never leave your computer.
            All API keys are stored locally and encrypted. Each provider manages its own credentials.
          </p>
        </div>

        {loadingProviders ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-okra-yellow" />
          </div>
        ) : (
          <div className="space-y-8">
            {categoryOrder.map((category) => {
              const categoryProviders = providersByCategory[category];
              if (categoryProviders.length === 0) return null;

              const info = CATEGORY_INFO[category];
              return (
                <div key={category}>
                  {/* Category header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                      {info.icon}
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-ink">{info.label}</h2>
                      <p className="text-sm text-sidebar-text">{info.description}</p>
                    </div>
                  </div>

                  {/* Provider cards */}
                  <div className="space-y-3">
                    {categoryProviders.map((provider) => (
                      <ProviderCard
                        key={provider.id}
                        provider={provider}
                        config={providerConfigs[provider.id] ?? null}
                        onSave={(config) => handleProviderSave(provider.id, config)}
                        onTest={(config) => handleProviderTest(provider.id, config)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Future providers hint */}
        <div className="text-center py-6 text-sm text-sidebar-text">
          <p>More providers coming soon: Docling, Marker, Tesseract, Mistral OCR</p>
        </div>

        <div className="text-center text-sm text-sidebar-text">
          <p>
            All credentials are stored locally and encrypted. They are never sent to OkraPDF servers.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SettingsScreen;
