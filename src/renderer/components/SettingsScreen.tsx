import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  saveProviderConfig as saveProviderConfigAction,
  type OcrProviderConfig as SharedOcrProviderConfig,
} from '@okrapdf/redux';
import { useAppDispatch, electronSettingsAdapter } from '../store';
import {
  useOcrProviders,
  PluginState,
  type OcrProviderMetadata,
  type OcrProviderConfig,
  type OcrProviderId,
  type OcrProviderCategory,
} from '../hooks/useOcrProviders';
import { useToast } from './Toast';
import CodingAgentsSection from './CodingAgentsSection';
import McpServerSection from './McpServerSection';
import PluginCard from './PluginCard';
import PluginConfigModal from './PluginConfigModal';
import OkrapdfApiKeySection from './OkrapdfApiKeySection';

interface SettingsScreenProps {
  onClose: () => void;
  onSettingsSaved?: () => void;
}

type FilterType = 'all' | 'installed' | 'not-installed' | OcrProviderCategory;

const FILTER_OPTIONS: { id: FilterType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'installed', label: 'Installed' },
  { id: 'not-installed', label: 'Available' },
  { id: 'agent', label: 'Agent' },
  { id: 'ocr', label: 'OCR' },
  { id: 'vlm', label: 'VLM' },
];

function SettingsScreen({ onClose, onSettingsSaved }: SettingsScreenProps) {
  const dispatch = useAppDispatch();
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [selectedProvider, setSelectedProvider] =
    useState<OcrProviderMetadata | null>(null);
  const { showToast } = useToast();

  const {
    providers,
    loading: loadingProviders,
    installing,
    getConfig,
    saveConfig,
    checkHealth,
    installPlugin,
    uninstallPlugin,
  } = useOcrProviders();

  const [providerConfigs, setProviderConfigs] = useState<
    Record<OcrProviderId, OcrProviderConfig | null>
  >({});

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

  const filteredProviders = useMemo(() => {
    let result = providers;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query),
      );
    }

    if (activeFilter === 'installed') {
      result = result.filter((p) => {
        const state = p.state ?? PluginState.Installed;
        return (
          state === PluginState.Installed ||
          state === PluginState.UpdateAvailable
        );
      });
    } else if (activeFilter === 'not-installed') {
      result = result.filter((p) => {
        const state = p.state ?? PluginState.Installed;
        return state === PluginState.NotInstalled;
      });
    } else if (['agent', 'ocr', 'vlm'].includes(activeFilter)) {
      result = result.filter((p) => (p.category || 'ocr') === activeFilter);
    }

    return result;
  }, [providers, searchQuery, activeFilter]);

  const handleProviderSave = useCallback(
    async (providerId: OcrProviderId, config: OcrProviderConfig) => {
      await saveConfig(providerId, config);
      setProviderConfigs((prev) => ({ ...prev, [providerId]: config }));
      dispatch(
        saveProviderConfigAction({
          providerId,
          config: config as SharedOcrProviderConfig,
          adapter: electronSettingsAdapter,
        }),
      );
      showToast('success', 'Configuration saved');
      onSettingsSaved?.();
    },
    [dispatch, saveConfig, onSettingsSaved, showToast],
  );

  const handleInstall = useCallback(
    async (providerId: OcrProviderId) => {
      const result = await installPlugin(providerId);
      if (result.success) {
        showToast('success', 'Plugin installed successfully');
      } else {
        showToast('error', result.error || 'Installation failed');
      }
    },
    [installPlugin, showToast],
  );

  const handleUninstall = useCallback(
    async (providerId: OcrProviderId) => {
      const result = await uninstallPlugin(providerId);
      if (result.success) {
        showToast('info', 'Plugin uninstalled');
      } else {
        showToast('error', result.error || 'Uninstall failed');
      }
      return result;
    },
    [uninstallPlugin, showToast],
  );

  const installedCount = providers.filter((p) => {
    const state = p.state ?? PluginState.Installed;
    return (
      state === PluginState.Installed || state === PluginState.UpdateAvailable
    );
  }).length;

  const configuredCount = providers.filter((p) => {
    const state = p.state ?? PluginState.Installed;
    const isInstalled =
      state === PluginState.Installed || state === PluginState.UpdateAvailable;
    return isInstalled && providerConfigs[p.id]?.apiKey;
  }).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cream">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-okra-yellow" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-cream flex flex-col">
      {/* Sticky header - with drag region for macOS traffic lights */}
      <div className="sticky top-0 z-10 bg-cream border-b border-sidebar-border">
        <div className="max-w-6xl mx-auto pr-6 py-3 flex">
          {/* Draggable spacer for traffic lights area - only this area is draggable */}
          <div className="w-20 flex-shrink-0 drag-region self-stretch" />
          {/* Content area - NOT draggable */}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold text-ink">Plugins</h1>
                <div className="flex items-center gap-2 text-sm text-sidebar-text">
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                    {configuredCount} ready
                  </span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                    {installedCount} installed
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-sidebar-hover rounded-lg transition-colors"
                aria-label="Close settings"
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

            <div className="flex items-center gap-4 mt-3">
            <div className="relative flex-1 max-w-md">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-sidebar-text"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search plugins..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-sidebar-border rounded-xl focus:outline-none focus:ring-2 focus:ring-okra-yellow/50 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded"
                >
                  <svg
                    className="w-4 h-4 text-sidebar-text"
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
              )}
            </div>

            <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-sidebar-border">
              {FILTER_OPTIONS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    activeFilter === filter.id
                      ? 'bg-okra-yellow text-ink'
                      : 'text-sidebar-text hover:bg-slate-100'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm mb-6">
            <p className="text-amber-800">
              <strong>Local Processing:</strong> Your PDFs never leave your
              computer. All API keys are stored locally and encrypted.
            </p>
          </div>

          <OkrapdfApiKeySection />

          <CodingAgentsSection />

          <McpServerSection />

          {loadingProviders ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-okra-yellow" />
            </div>
          ) : filteredProviders.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="w-12 h-12 mx-auto text-slate-300 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sidebar-text">No plugins match your search</p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActiveFilter('all');
                }}
                className="mt-2 text-sm text-okra-yellow hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProviders.map((provider) => (
                <PluginCard
                  key={provider.id}
                  provider={provider}
                  config={providerConfigs[provider.id] ?? null}
                  onConfigure={() => setSelectedProvider(provider)}
                  onInstall={() => handleInstall(provider.id)}
                  installing={installing === provider.id}
                />
              ))}
            </div>
          )}

          <div className="text-center py-8 text-sm text-sidebar-text border-t border-sidebar-border mt-8">
            <p className="mb-2">
              More providers coming soon: Docling, Marker, Tesseract, Mistral
              OCR
            </p>
            <p>
              All credentials are stored locally and encrypted. They are never
              sent to OkraPDF servers.
            </p>
          </div>
        </div>
      </div>

      {selectedProvider && (
        <PluginConfigModal
          provider={selectedProvider}
          config={providerConfigs[selectedProvider.id] ?? null}
          isOpen={true}
          onClose={() => setSelectedProvider(null)}
          onSave={(config) => handleProviderSave(selectedProvider.id, config)}
          onTest={(config) => checkHealth(selectedProvider.id, config)}
          onUninstall={() => handleUninstall(selectedProvider.id)}
        />
      )}
    </div>
  );
}

export default SettingsScreen;
