import React, { useState, useEffect } from 'react';
import type { BYOKSettings } from '../../shared/types/byok';

interface SettingsScreenProps {
  onClose: () => void;
  onSettingsSaved?: () => void;
}

function SettingsScreen({ onClose, onSettingsSaved }: SettingsScreenProps) {
  const [settings, setSettings] = useState<BYOKSettings>({
    enabled: false,
    anthropicApiKey: '',
    openrouterApiKey: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{
    anthropic?: { valid: boolean; error?: string };
    openrouter?: { valid: boolean; error?: string };
  }>({});
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('byok:get-settings');
      if (result) {
        setSettings(result);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedSettings: BYOKSettings = {
        ...settings,
        enabled: !!settings.anthropicApiKey,
      };
      await window.electron.ipcRenderer.invoke('byok:set-settings', updatedSettings);
      onSettingsSaved?.();
      onClose();
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleValidateAnthropic = async () => {
    if (!settings.anthropicApiKey) return;
    setIsValidating(true);
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'byok:validate-key',
        'anthropic',
        settings.anthropicApiKey
      );
      setValidationStatus((prev) => ({ ...prev, anthropic: result }));
    } catch (err) {
      setValidationStatus((prev) => ({
        ...prev,
        anthropic: { valid: false, error: 'Validation failed' },
      }));
    } finally {
      setIsValidating(false);
    }
  };

  const handleValidateOpenrouter = async () => {
    if (!settings.openrouterApiKey) return;
    setIsValidating(true);
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'byok:validate-key',
        'openrouter',
        settings.openrouterApiKey
      );
      setValidationStatus((prev) => ({ ...prev, openrouter: result }));
    } catch (err) {
      setValidationStatus((prev) => ({
        ...prev,
        openrouter: { valid: false, error: 'Validation failed' },
      }));
    } finally {
      setIsValidating(false);
    }
  };

  const maskApiKey = (key: string) => {
    if (!key || key.length < 12) return key;
    return `${key.slice(0, 8)}...${key.slice(-4)}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cream">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-okra-orange" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold font-serif text-ink">Settings</h1>
            <p className="text-sidebar-text mt-1">Configure your API keys for local processing</p>
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

        <div className="bg-white rounded-2xl shadow-lg border border-sidebar-border overflow-hidden">
          <div className="p-6 border-b border-sidebar-border">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-okra-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ink">BYOK Mode</h2>
                <p className="text-sm text-sidebar-text">Bring Your Own Key - No signup required</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
              <p className="text-amber-800">
                <strong>Local Processing:</strong> Your PDFs never leave your computer. 
                API keys are stored locally and used only for Claude AI calls.
              </p>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-ink mb-2">
                Anthropic API Key <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-sidebar-text mb-2">
                Required for Claude agent and table extraction. Get your key at{' '}
                <button
                  onClick={() => window.electron.ipcRenderer.invoke('shell:open-external', 'https://console.anthropic.com/settings/keys')}
                  className="text-okra-orange hover:underline"
                >
                  console.anthropic.com
                </button>
              </p>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showAnthropicKey ? 'text' : 'password'}
                    value={settings.anthropicApiKey || ''}
                    onChange={(e) => {
                      setSettings((s) => ({ ...s, anthropicApiKey: e.target.value }));
                      setValidationStatus((prev) => ({ ...prev, anthropic: undefined }));
                    }}
                    placeholder="sk-ant-..."
                    className="w-full px-4 py-3 border border-sidebar-border rounded-lg focus:outline-none focus:ring-2 focus:ring-okra-orange/50 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sidebar-text hover:text-ink"
                  >
                    {showAnthropicKey ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <button
                  onClick={handleValidateAnthropic}
                  disabled={!settings.anthropicApiKey || isValidating}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isValidating ? 'Testing...' : 'Test'}
                </button>
              </div>
              {validationStatus.anthropic && (
                <div className={`mt-2 text-sm ${validationStatus.anthropic.valid ? 'text-green-600' : 'text-red-600'}`}>
                  {validationStatus.anthropic.valid ? 'API key is valid' : validationStatus.anthropic.error || 'Invalid API key'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-2">
                OpenRouter API Key <span className="text-sidebar-text">(optional)</span>
              </label>
              <p className="text-xs text-sidebar-text mb-2">
                For alternative models. Get your key at{' '}
                <button
                  onClick={() => window.electron.ipcRenderer.invoke('shell:open-external', 'https://openrouter.ai/keys')}
                  className="text-okra-orange hover:underline"
                >
                  openrouter.ai
                </button>
              </p>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showOpenrouterKey ? 'text' : 'password'}
                    value={settings.openrouterApiKey || ''}
                    onChange={(e) => {
                      setSettings((s) => ({ ...s, openrouterApiKey: e.target.value }));
                      setValidationStatus((prev) => ({ ...prev, openrouter: undefined }));
                    }}
                    placeholder="sk-or-..."
                    className="w-full px-4 py-3 border border-sidebar-border rounded-lg focus:outline-none focus:ring-2 focus:ring-okra-orange/50 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenrouterKey(!showOpenrouterKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sidebar-text hover:text-ink"
                  >
                    {showOpenrouterKey ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <button
                  onClick={handleValidateOpenrouter}
                  disabled={!settings.openrouterApiKey || isValidating}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isValidating ? 'Testing...' : 'Test'}
                </button>
              </div>
              {validationStatus.openrouter && (
                <div className={`mt-2 text-sm ${validationStatus.openrouter.valid ? 'text-green-600' : 'text-red-600'}`}>
                  {validationStatus.openrouter.valid ? 'API key is valid' : validationStatus.openrouter.error || 'Invalid API key'}
                </div>
              )}
            </div>
          </div>

          <div className="p-6 bg-slate-50 border-t border-sidebar-border flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-lg font-medium text-sidebar-text hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !settings.anthropicApiKey}
              className="px-6 py-2.5 bg-okra-orange hover:bg-okra-orange/90 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-sidebar-text">
          <p>
            Your API keys are stored locally and encrypted. They are never sent to OkraPDF servers.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SettingsScreen;
