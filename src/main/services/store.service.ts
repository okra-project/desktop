/**
 * Store Service - Wraps electron-store for typed settings access
 *
 * Centralizes all persistent state: settings, workspace list, provider configs.
 */

import Store from 'electron-store';
import type { IService } from './index';

export interface LocalWorkspace {
  id: string;
  name: string;
  pdfPath: string;
  pdfFileName?: string;
  workspacePath: string;
  createdAt: string;
  lastOpenedAt: string;
  pageCount?: number;
  extractionStatus: string;
  extractionProgress?: number;
}

export interface ByokSettings {
  enabled: boolean;
  anthropicApiKey: string | null;
  openrouterApiKey: string | null;
  okrapdfApiKey: string | null;
  lastValidated: string | null;
}

export interface McpServerSettings {
  enabled: boolean;
  port: number;
}

export interface ProviderConfig {
  apiKey?: string;
}

interface SettingsSchema {
  lastWorkspacePath: string | null;
  telemetryConsent: boolean | null;
  telemetryUserId: string | null;
  byokSettings: ByokSettings;
  localWorkspaces: LocalWorkspace[];
  mcpServer: McpServerSettings;
}

interface ProviderSchema {
  providerConfigs: Record<string, ProviderConfig>;
}

class StoreService implements IService {
  readonly serviceName = 'StoreService';

  private settingsStore: Store<SettingsSchema>;
  private providerStore: Store<ProviderSchema>;

  constructor() {
    this.settingsStore = new Store<SettingsSchema>({
      name: 'okrapdf-settings',
      defaults: {
        lastWorkspacePath: null,
        telemetryConsent: null,
        telemetryUserId: null,
        byokSettings: {
          enabled: false,
          anthropicApiKey: null,
          openrouterApiKey: null,
          okrapdfApiKey: null,
          lastValidated: null,
        },
        localWorkspaces: [],
        mcpServer: {
          enabled: false,
          port: 23456,
        },
      },
    });

    this.providerStore = new Store<ProviderSchema>({
      name: 'okrapdf-ocr-providers',
      defaults: {
        providerConfigs: {},
      },
    });
  }

  // Settings store accessors
  getLastWorkspacePath(): string | null {
    return this.settingsStore.get('lastWorkspacePath');
  }

  setLastWorkspacePath(path: string | null): void {
    this.settingsStore.set('lastWorkspacePath', path);
  }

  getTelemetryConsent(): boolean | null {
    return this.settingsStore.get('telemetryConsent');
  }

  setTelemetryConsent(consent: boolean): void {
    this.settingsStore.set('telemetryConsent', consent);
  }

  getTelemetryUserId(): string | null {
    return this.settingsStore.get('telemetryUserId');
  }

  setTelemetryUserId(id: string): void {
    this.settingsStore.set('telemetryUserId', id);
  }

  getByokSettings(): ByokSettings {
    return this.settingsStore.get('byokSettings');
  }

  setByokSettings(settings: Partial<ByokSettings>): void {
    const current = this.getByokSettings();
    this.settingsStore.set('byokSettings', { ...current, ...settings });
  }

  getMcpServerSettings(): McpServerSettings {
    return this.settingsStore.get('mcpServer');
  }

  setMcpServerSettings(settings: McpServerSettings): void {
    this.settingsStore.set('mcpServer', settings);
  }

  // Workspace management
  getLocalWorkspaces(): LocalWorkspace[] {
    return this.settingsStore.get('localWorkspaces');
  }

  setLocalWorkspaces(workspaces: LocalWorkspace[]): void {
    this.settingsStore.set('localWorkspaces', workspaces);
  }

  addWorkspace(workspace: LocalWorkspace): void {
    const workspaces = this.getLocalWorkspaces();
    workspaces.unshift(workspace);
    this.setLocalWorkspaces(workspaces);
  }

  updateWorkspace(id: string, updates: Partial<LocalWorkspace>): void {
    const workspaces = this.getLocalWorkspaces();
    const idx = workspaces.findIndex((w) => w.id === id);
    if (idx >= 0) {
      workspaces[idx] = { ...workspaces[idx], ...updates };
      this.setLocalWorkspaces(workspaces);
    }
  }

  removeWorkspace(id: string): void {
    const workspaces = this.getLocalWorkspaces();
    this.setLocalWorkspaces(workspaces.filter((w) => w.id !== id));
  }

  getWorkspaceById(id: string): LocalWorkspace | undefined {
    return this.getLocalWorkspaces().find((w) => w.id === id);
  }

  // Provider config accessors
  getProviderConfigs(): Record<string, ProviderConfig> {
    return this.providerStore.get('providerConfigs');
  }

  getProviderConfig(providerId: string): ProviderConfig | undefined {
    return this.getProviderConfigs()[providerId];
  }

  setProviderConfig(providerId: string, config: ProviderConfig): void {
    const configs = this.getProviderConfigs();
    configs[providerId] = config;
    this.providerStore.set('providerConfigs', configs);
  }

  // Convenience: Check if Anthropic API key is configured
  hasAnthropicApiKey(): boolean {
    const providerConfig = this.getProviderConfig('anthropic');
    if (providerConfig?.apiKey) return true;

    // Fallback to legacy BYOK
    const byok = this.getByokSettings();
    return !!byok.enabled && !!byok.anthropicApiKey;
  }

  // Convenience: Get Anthropic API key from either source
  getAnthropicApiKey(): string | null {
    const providerConfig = this.getProviderConfig('anthropic');
    if (providerConfig?.apiKey) return providerConfig.apiKey;

    const byok = this.getByokSettings();
    if (byok.enabled && byok.anthropicApiKey) return byok.anthropicApiKey;

    return null;
  }

  // Convenience: Get OpenRouter API key
  getOpenRouterApiKey(): string | null {
    const providerConfig = this.getProviderConfig('openrouter');
    if (providerConfig?.apiKey) return providerConfig.apiKey;

    const byok = this.getByokSettings();
    return byok.openrouterApiKey || null;
  }

  // Convenience: Get okrapdf.com API key (global)
  getOkrapdfApiKey(): string | null {
    const byok = this.getByokSettings();
    return byok.okrapdfApiKey || null;
  }

  // Check if okrapdf API key is configured
  hasOkrapdfApiKey(): boolean {
    return !!this.getOkrapdfApiKey();
  }
}

// Singleton
export const storeService = new StoreService();
