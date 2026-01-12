import React from 'react';
import {
  PluginState,
  type OcrProviderMetadata,
  type OcrProviderConfig,
} from '../hooks/useOcrProviders';

interface PluginCardProps {
  provider: OcrProviderMetadata;
  config: OcrProviderConfig | null;
  onConfigure: () => void;
  onInstall: () => void;
  installing?: boolean;
}

// Provider icon component
function ProviderIcon({
  providerId,
  className = 'w-8 h-8',
}: {
  providerId: string;
  className?: string;
}) {
  if (providerId === 'google-docai') {
    return (
      <svg
        className={`${className} text-blue-600`}
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
        className={`${className} text-emerald-600`}
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
  if (providerId === 'anthropic') {
    return (
      <svg
        className={`${className} text-amber-600`}
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M17.304 3.541l-5.296 16.918H9.262l5.296-16.918h2.746zm-7.63 0L4.377 20.459H1.631L6.927 3.541h2.747z" />
      </svg>
    );
  }
  // Default icon
  return (
    <svg
      className={`${className} text-slate-600`}
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

// Category badge colors
const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  agent: { bg: 'bg-amber-100', text: 'text-amber-700' },
  ocr: { bg: 'bg-blue-100', text: 'text-blue-700' },
  vlm: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
};

export function PluginCard({
  provider,
  config,
  onConfigure,
  onInstall,
  installing,
}: PluginCardProps) {
  const pluginState = provider.state ?? PluginState.Installed;
  const isInstalled =
    pluginState === PluginState.Installed ||
    pluginState === PluginState.UpdateAvailable;
  const isInstalling = pluginState === PluginState.Installing;
  const isConfigured = !!config?.apiKey;
  const categoryColor =
    CATEGORY_COLORS[provider.category || 'ocr'] || CATEGORY_COLORS.ocr;

  const capabilityBadges: string[] = [];
  if (provider.capabilities.supportsBboxes) capabilityBadges.push('Bboxes');
  if (provider.capabilities.supportsTables) capabilityBadges.push('Tables');
  if (provider.capabilities.supportsHandwriting)
    capabilityBadges.push('Handwriting');

  return (
    <div className="group relative bg-white rounded-xl border border-sidebar-border hover:border-okra-yellow/50 hover:shadow-lg transition-all duration-200 overflow-hidden">
      {/* Status indicator bar */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${
          isConfigured
            ? 'bg-green-500'
            : isInstalled
              ? 'bg-amber-400'
              : 'bg-slate-200'
        }`}
      />

      <div className="p-5">
        {/* Header with icon and badges */}
        <div className="flex items-start justify-between mb-3">
          <div className="w-14 h-14 rounded-xl bg-slate-50 flex items-center justify-center group-hover:scale-105 transition-transform">
            <ProviderIcon providerId={provider.id} className="w-8 h-8" />
          </div>

          <div className="flex flex-col items-end gap-1.5">
            {/* Category badge */}
            <span
              className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-full ${categoryColor.bg} ${categoryColor.text}`}
            >
              {provider.category || 'OCR'}
            </span>

            {/* Status badge */}
            {pluginState === PluginState.NotInstalled && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-medium rounded-full">
                Not Installed
              </span>
            )}
            {(isInstalling || installing) && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-medium rounded-full flex items-center gap-1">
                <svg
                  className="animate-spin h-3 w-3"
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
                Installing
              </span>
            )}
            {pluginState === PluginState.UpdateAvailable && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded-full">
                Update
              </span>
            )}
            {isInstalled && isConfigured && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-medium rounded-full flex items-center gap-1">
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Ready
              </span>
            )}
            {isInstalled && !isConfigured && (
              <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-medium rounded-full">
                Needs Config
              </span>
            )}
          </div>
        </div>

        {/* Name and description */}
        <h3 className="font-semibold text-ink text-base mb-1">
          {provider.name}
        </h3>
        <p className="text-sm text-sidebar-text line-clamp-2 mb-3 min-h-[2.5rem]">
          {provider.description}
        </p>

        {/* Capability badges */}
        {capabilityBadges.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
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
                ~${provider.costPerPage}/pg
              </span>
            )}
          </div>
        )}

        {/* Progress indicator */}
        {provider.progress && (
          <div className="mb-3">
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <svg
                className="animate-spin h-3 w-3"
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
              {provider.progress.message}
            </div>
          </div>
        )}

        {/* Error message */}
        {pluginState === PluginState.Error && provider.error && (
          <div className="mb-3 p-2 bg-red-50 rounded-lg">
            <p className="text-xs text-red-600">{provider.error}</p>
          </div>
        )}

        {/* Action button */}
        <div className="pt-3 border-t border-sidebar-border/50">
          {!isInstalled && !isInstalling && !installing ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInstall();
              }}
              className="w-full py-2 bg-okra-yellow hover:bg-okra-yellow/90 text-ink font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Install
            </button>
          ) : isInstalling || installing ? (
            <button
              disabled
              className="w-full py-2 bg-slate-100 text-slate-500 font-medium rounded-lg text-sm cursor-not-allowed flex items-center justify-center gap-2"
            >
              <svg
                className="animate-spin h-4 w-4"
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
              Installing...
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConfigure();
              }}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-ink font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
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
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Configure
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PluginCard;
