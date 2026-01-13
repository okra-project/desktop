import React, { useState, useEffect, useCallback } from 'react';
import {
  PluginState,
  useOcrProviders,
  type OcrProviderMetadata,
  type OcrProviderConfig,
} from '../hooks/useOcrProviders';

interface PluginMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRunPlugin: (providerId: string, config: OcrProviderConfig) => void;
  runningPluginId?: string | null;
}

function PluginIcon({ providerId }: { providerId: string }) {
  if (providerId === 'google-docai') {
    return (
      <svg
        className="w-4 h-4 text-blue-600"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
      </svg>
    );
  }
  if (providerId === 'openrouter') {
    return (
      <svg
        className="w-4 h-4 text-emerald-600"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    );
  }
  return (
    <svg
      className="w-4 h-4 text-slate-500"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
      />
    </svg>
  );
}

export function PluginMenu({
  open,
  onOpenChange,
  onRunPlugin,
  runningPluginId,
}: PluginMenuProps) {
  const { providers, getConfig } = useOcrProviders();
  const [configs, setConfigs] = useState<
    Record<string, OcrProviderConfig | null>
  >({});

  const installedPlugins = providers.filter((p) => {
    const state = p.state ?? PluginState.Installed;
    return (
      state === PluginState.Installed || state === PluginState.UpdateAvailable
    );
  });

  useEffect(() => {
    const loadConfigs = async () => {
      const newConfigs: Record<string, OcrProviderConfig | null> = {};
      for (const p of installedPlugins) {
        newConfigs[p.id] = await getConfig(p.id);
      }
      setConfigs(newConfigs);
    };
    if (open) loadConfigs();
  }, [open, installedPlugins.length, getConfig]);

  const handleRunClick = useCallback(
    (provider: OcrProviderMetadata) => {
      const config = configs[provider.id] || {};
      onRunPlugin(provider.id, config);
      onOpenChange(false);
    },
    [configs, onRunPlugin, onOpenChange],
  );

  if (installedPlugins.length === 0) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => onOpenChange(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-sidebar-border bg-white text-slate-600 hover:bg-slate-50 transition-colors"
        title="Run extraction plugin"
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
            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>Plugins</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">
          {installedPlugins.length}
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => onOpenChange(false)}
          />
          <div className="absolute top-full right-0 mt-1 bg-white border border-sidebar-border rounded-lg shadow-lg py-1 z-[9999] min-w-[200px]">
            <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              Run Extraction
            </div>
            {installedPlugins.map((plugin) => {
              const config = configs[plugin.id];
              const hasKey =
                !!config?.apiKey || !!config?.options?.useGlobalKey;
              const isRunning = runningPluginId === plugin.id;

              return (
                <button
                  key={plugin.id}
                  onClick={() => handleRunClick(plugin)}
                  disabled={isRunning}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <PluginIcon providerId={plugin.id} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-700 truncate">
                      {plugin.name}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {plugin.category?.toUpperCase() || 'OCR'}
                    </div>
                  </div>
                  {isRunning ? (
                    <svg
                      className="w-4 h-4 animate-spin text-blue-500"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  ) : hasKey ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                      Ready
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                      No Key
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default PluginMenu;
