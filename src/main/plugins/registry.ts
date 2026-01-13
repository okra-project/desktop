import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { app, BrowserWindow } from 'electron';
import { PluginState } from '../providers/ocr-types';
import type { OcrProviderMetadata } from '../providers/ocr-types';
import type { OcrPluginModule } from './plugin-types';

const execAsync = promisify(exec);

function getShellEnv(): { shell: string; env: NodeJS.ProcessEnv } {
  const shell =
    process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/zsh';
  return {
    shell,
    env: {
      ...process.env,
      PATH:
        process.env.PATH ||
        '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    },
  };
}

function getInstallPath(): string {
  if (app.isPackaged) {
    return app.getAppPath();
  }
  return path.join(__dirname, '..', '..');
}

export interface PluginRegistryEntry {
  id: string;
  pluginFile: string;
  npmPackages: string[];
}

export interface PluginManifest extends PluginRegistryEntry {
  metadata: OcrProviderMetadata;
}

export interface PluginStatus {
  id: string;
  state: PluginState;
  error?: string;
  progress?: { message: string; percent?: number };
}

const pluginStates = new Map<string, PluginStatus>();

function emitPluginStateChange(status: PluginStatus): void {
  pluginStates.set(status.id, status);
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('plugin:state-change', status);
  });
}

export function getPluginState(id: string): PluginStatus | undefined {
  return pluginStates.get(id);
}

const PLUGIN_REGISTRY: PluginRegistryEntry[] = [
  {
    id: 'google-docai',
    pluginFile: 'google-docai.plugin',
    npmPackages: ['google-auth-library'],
  },
  {
    id: 'openrouter',
    pluginFile: 'openrouter.plugin',
    npmPackages: [],
  },
  {
    id: 'anthropic',
    pluginFile: 'anthropic.plugin',
    npmPackages: [],
  },
];

const metadataCache = new Map<string, OcrProviderMetadata>();

function loadPluginMetadata(
  entry: PluginRegistryEntry,
): OcrProviderMetadata | null {
  if (metadataCache.has(entry.id)) {
    return metadataCache.get(entry.id)!;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pluginModule: OcrPluginModule = require(`./${entry.pluginFile}`);
    const plugin = pluginModule.createPlugin();
    metadataCache.set(entry.id, plugin.metadata);
    return plugin.metadata;
  } catch (err) {
    console.warn(`[plugins] Failed to load metadata for ${entry.id}:`, err);
    return null;
  }
}

export function getRegistry(): PluginManifest[] {
  return PLUGIN_REGISTRY.map((entry) => {
    const metadata = loadPluginMetadata(entry);
    if (!metadata) {
      return null;
    }
    return { ...entry, metadata };
  }).filter((m): m is PluginManifest => m !== null);
}

export function getManifest(id: string): PluginManifest | undefined {
  const entry = PLUGIN_REGISTRY.find((p) => p.id === id);
  if (!entry) return undefined;
  const metadata = loadPluginMetadata(entry);
  if (!metadata) return undefined;
  return { ...entry, metadata };
}

function checkPackageInstalled(pkg: string): boolean {
  try {
    require.resolve(pkg);
    return true;
  } catch {
    return false;
  }
}

export function checkPluginInstalled(entry: PluginRegistryEntry): boolean {
  if (entry.npmPackages.length === 0) return true;
  return entry.npmPackages.every(checkPackageInstalled);
}

export function getPluginStatuses(): (PluginManifest & PluginStatus)[] {
  return PLUGIN_REGISTRY.map((entry) => {
    const metadata = loadPluginMetadata(entry);
    if (!metadata) return null;

    const existingState = pluginStates.get(entry.id);
    if (existingState) {
      return { ...entry, metadata, ...existingState };
    }
    const isInstalled = checkPluginInstalled(entry);
    return {
      ...entry,
      metadata,
      state: isInstalled ? PluginState.Installed : PluginState.NotInstalled,
    };
  }).filter((m): m is PluginManifest & PluginStatus => m !== null);
}

export async function installPlugin(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const entry = PLUGIN_REGISTRY.find((p) => p.id === id);
  if (!entry) {
    return { success: false, error: `Plugin ${id} not found in registry` };
  }

  if (entry.npmPackages.length === 0) {
    emitPluginStateChange({ id, state: PluginState.Installed });
    return { success: true };
  }

  emitPluginStateChange({
    id,
    state: PluginState.Installing,
    progress: { message: `Installing ${entry.npmPackages.join(', ')}...` },
  });

  const installPath = getInstallPath();
  const packages = entry.npmPackages.join(' ');

  try {
    console.log(
      `[plugins] Installing ${packages} for ${id} in ${installPath}...`,
    );
    const { shell, env } = getShellEnv();
    await execAsync(`npm install ${packages}`, {
      cwd: installPath,
      shell,
      env,
    });
    console.log(`[plugins] Installed ${id} successfully`);
    emitPluginStateChange({ id, state: PluginState.Installed });
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[plugins] Failed to install ${id}: ${error}`);
    emitPluginStateChange({ id, state: PluginState.Error, error });
    return { success: false, error };
  }
}

export async function uninstallPlugin(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const entry = PLUGIN_REGISTRY.find((p) => p.id === id);
  if (!entry) {
    return { success: false, error: `Plugin ${id} not found in registry` };
  }

  if (entry.npmPackages.length === 0) {
    emitPluginStateChange({ id, state: PluginState.NotInstalled });
    return { success: true };
  }

  emitPluginStateChange({
    id,
    state: PluginState.Uninstalling,
    progress: { message: `Removing ${entry.npmPackages.join(', ')}...` },
  });

  const installPath = getInstallPath();
  const packages = entry.npmPackages.join(' ');

  try {
    console.log(`[plugins] Uninstalling ${packages} for ${id}...`);
    const { shell, env } = getShellEnv();
    await execAsync(`npm uninstall ${packages}`, {
      cwd: installPath,
      shell,
      env,
    });
    console.log(`[plugins] Uninstalled ${id} successfully`);
    emitPluginStateChange({ id, state: PluginState.NotInstalled });
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[plugins] Failed to uninstall ${id}: ${error}`);
    emitPluginStateChange({ id, state: PluginState.Error, error });
    return { success: false, error };
  }
}
