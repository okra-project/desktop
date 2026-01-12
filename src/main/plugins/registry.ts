import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { app, BrowserWindow } from 'electron';
import { PluginState } from '../providers/ocr-types';
import type { OcrProviderMetadata } from '../providers/ocr-types';

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

/**
 * Get the correct path for npm install operations.
 * In dev: release/app (relative to project root)
 * In prod: app.getAppPath() (the asar or unpacked app directory)
 */
function getInstallPath(): string {
  if (app.isPackaged) {
    // Production: use the app path
    return app.getAppPath();
  }
  // Development: __dirname is release/app/dist/main/plugins
  // Go up to release/app
  return path.join(__dirname, '..', '..');
}

export interface PluginManifest {
  id: string;
  metadata: OcrProviderMetadata;
  npmPackages: string[];
  pluginFile: string;
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

const PLUGIN_REGISTRY: PluginManifest[] = [
  {
    id: 'google-docai',
    pluginFile: 'google-docai.plugin',
    npmPackages: ['google-auth-library'],
    metadata: {
      id: 'google-docai',
      name: 'Google Document AI',
      description: 'OCR with bounding boxes via Google Cloud Document AI',
      runtime: 'api',
      category: 'ocr',
      capabilities: {
        supportsText: true,
        supportsTables: true,
        supportsBboxes: true,
        supportsFigures: true,
        supportsHandwriting: true,
        supportsMultiLanguage: true,
        outputFormats: ['json', 'markdown'],
        maxPagesPerRequest: 15,
      },
      authenticate: { type: 'service-account' },
      documentationUrl: 'https://cloud.google.com/document-ai',
      costPerPage: 0.01,
      isCloud: true,
      configSchema: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            title: 'Service Account Key (JSON)',
            description: 'Paste the full JSON key file contents',
            format: 'file',
          },
          projectId: {
            type: 'string',
            title: 'GCP Project ID',
            description: 'Your Google Cloud project ID',
          },
          processorId: {
            type: 'string',
            title: 'Processor ID',
            description: 'Document AI processor ID',
          },
        },
        required: ['apiKey', 'projectId', 'processorId'],
      },
    },
  },
  {
    id: 'openrouter',
    pluginFile: 'openrouter.plugin',
    npmPackages: [],
    metadata: {
      id: 'openrouter',
      name: 'OpenRouter VLM',
      description: 'Vision LLMs via OpenRouter (Qwen, Claude, Gemini)',
      runtime: 'api',
      category: 'vlm',
      capabilities: {
        supportsText: true,
        supportsTables: true,
        supportsBboxes: false,
        supportsFigures: false,
        supportsHandwriting: true,
        supportsMultiLanguage: true,
        outputFormats: ['markdown'],
        maxPagesPerRequest: 1,
      },
      authenticate: { type: 'bearer' },
      documentationUrl: 'https://openrouter.ai/docs',
      costPerPage: 0.005,
      isCloud: true,
      configSchema: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            title: 'OpenRouter API Key',
            description: 'Get from openrouter.ai/keys',
            format: 'password',
          },
          modelId: {
            type: 'string',
            title: 'Model',
            description: 'VLM model for extraction',
            enum: [
              'qwen/qwen3-vl-235b-a22b-instruct',
              'qwen/qwen2.5-vl-72b-instruct',
              'anthropic/claude-3.5-sonnet',
              'google/gemini-pro-vision',
            ],
            default: 'qwen/qwen3-vl-235b-a22b-instruct',
          },
        },
        required: ['apiKey'],
      },
    },
  },
  {
    id: 'anthropic',
    pluginFile: 'anthropic.plugin',
    npmPackages: [],
    metadata: {
      id: 'anthropic',
      name: 'Anthropic Claude',
      description: 'Claude AI for document chat and vision analysis',
      runtime: 'api',
      category: 'agent',
      capabilities: {
        supportsText: true,
        supportsTables: true,
        supportsBboxes: false,
        supportsFigures: false,
        supportsHandwriting: false,
        supportsMultiLanguage: true,
        outputFormats: ['markdown'],
        maxPagesPerRequest: 100,
      },
      authenticate: { type: 'header', headerName: 'x-api-key' },
      documentationUrl: 'https://console.anthropic.com/settings/keys',
      costPerPage: 0.003,
      isCloud: true,
      configSchema: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            title: 'Anthropic API Key',
            description: 'Get from console.anthropic.com',
            format: 'password',
          },
          modelId: {
            type: 'string',
            title: 'Model',
            description: 'Claude model for chat',
            enum: [
              'claude-sonnet-4-20250514',
              'claude-3-5-sonnet-20241022',
              'claude-3-5-haiku-20241022',
            ],
            default: 'claude-sonnet-4-20250514',
          },
        },
        required: ['apiKey'],
      },
    },
  },
];

export function getRegistry(): PluginManifest[] {
  return PLUGIN_REGISTRY;
}

export function getManifest(id: string): PluginManifest | undefined {
  return PLUGIN_REGISTRY.find((p) => p.id === id);
}

function checkPackageInstalled(pkg: string): boolean {
  try {
    require.resolve(pkg);
    return true;
  } catch {
    return false;
  }
}

export function checkPluginInstalled(manifest: PluginManifest): boolean {
  if (manifest.npmPackages.length === 0) return true;
  return manifest.npmPackages.every(checkPackageInstalled);
}

export function getPluginStatuses(): (PluginManifest & PluginStatus)[] {
  return PLUGIN_REGISTRY.map((manifest) => {
    const existingState = pluginStates.get(manifest.id);
    if (existingState) {
      return { ...manifest, ...existingState };
    }
    const isInstalled = checkPluginInstalled(manifest);
    return {
      ...manifest,
      state: isInstalled ? PluginState.Installed : PluginState.NotInstalled,
    };
  });
}

export async function installPlugin(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const manifest = getManifest(id);
  if (!manifest) {
    return { success: false, error: `Plugin ${id} not found in registry` };
  }

  if (manifest.npmPackages.length === 0) {
    emitPluginStateChange({ id, state: PluginState.Installed });
    return { success: true };
  }

  emitPluginStateChange({
    id,
    state: PluginState.Installing,
    progress: { message: `Installing ${manifest.npmPackages.join(', ')}...` },
  });

  const installPath = getInstallPath();
  const packages = manifest.npmPackages.join(' ');

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
  const manifest = getManifest(id);
  if (!manifest) {
    return { success: false, error: `Plugin ${id} not found in registry` };
  }

  if (manifest.npmPackages.length === 0) {
    emitPluginStateChange({ id, state: PluginState.NotInstalled });
    return { success: true };
  }

  emitPluginStateChange({
    id,
    state: PluginState.Uninstalling,
    progress: { message: `Removing ${manifest.npmPackages.join(', ')}...` },
  });

  const installPath = getInstallPath();
  const packages = manifest.npmPackages.join(' ');

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
