import type { OcrPlugin } from './plugin-types';
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

const loadedPlugins = new Map<string, OcrPlugin>();

declare const __non_webpack_require__: typeof require;
const dynamicRequire =
  typeof __non_webpack_require__ !== 'undefined'
    ? __non_webpack_require__
    : require;

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
      const modulePath = `./${manifest.pluginFile}`;
      const pluginModule = dynamicRequire(modulePath);

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
