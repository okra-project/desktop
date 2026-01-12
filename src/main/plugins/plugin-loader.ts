import type { OcrPlugin, OcrPluginModule } from './plugin-types';
import type { OcrProviderMetadata } from '../providers/ocr-types';
import {
  getRegistry,
  checkPluginInstalled,
  getPluginStatuses,
  installPlugin,
  uninstallPlugin,
  type PluginManifest,
  type PluginStatus,
} from './registry';

import * as openrouterPlugin from './openrouter.plugin';
import * as googleDocaiPlugin from './google-docai.plugin';
import * as anthropicPlugin from './anthropic.plugin';

const PLUGIN_MODULES: Record<string, OcrPluginModule> = {
  'openrouter.plugin': openrouterPlugin,
  'google-docai.plugin': googleDocaiPlugin,
  'anthropic.plugin': anthropicPlugin,
};

const loadedPlugins = new Map<string, OcrPlugin>();

export async function loadPlugins(): Promise<void> {
  const registry = getRegistry();

  for (const manifest of registry) {
    if (!checkPluginInstalled(manifest)) {
      console.log(
        `[plugins] ${manifest.id}: not installed (needs: ${manifest.npmPackages.join(', ') || 'nothing'})`,
      );
      continue;
    }

    try {
      const pluginModule = PLUGIN_MODULES[manifest.pluginFile];
      if (!pluginModule) {
        console.log(`[plugins] ${manifest.id}: module not found`);
        continue;
      }

      const depError = pluginModule.checkDependencies?.();
      if (depError) {
        console.log(`[plugins] ${manifest.id}: ${depError}`);
        continue;
      }

      const plugin = pluginModule.createPlugin();
      loadedPlugins.set(plugin.id, plugin);
      console.log(`[plugins] ${manifest.id}: loaded`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[plugins] ${manifest.id}: failed - ${message}`);
    }
  }
}

export function getPlugin(id: string): OcrPlugin | undefined {
  return loadedPlugins.get(id);
}

export function getAllPlugins(): OcrPlugin[] {
  return Array.from(loadedPlugins.values());
}

export function getPluginMetadata(): OcrProviderMetadata[] {
  return getAllPlugins().map((p) => p.metadata);
}

export function isPluginLoaded(id: string): boolean {
  return loadedPlugins.has(id);
}

export function getAvailablePlugins(): (PluginManifest & PluginStatus)[] {
  return getPluginStatuses();
}

export { installPlugin, uninstallPlugin };
