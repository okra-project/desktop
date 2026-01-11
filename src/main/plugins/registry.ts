import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import type { OcrProviderMetadata } from '../providers/ocr-types';

const execAsync = promisify(exec);

export interface PluginManifest {
  id: string;
  metadata: OcrProviderMetadata;
  npmPackages: string[];
  pluginFile: string;
}

export interface PluginStatus {
  id: string;
  installed: boolean;
  loading?: boolean;
  error?: string;
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
              'qwen/qwen2.5-vl-72b-instruct',
              'anthropic/claude-3.5-sonnet',
              'google/gemini-pro-vision',
            ],
            default: 'qwen/qwen2.5-vl-72b-instruct',
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
  return PLUGIN_REGISTRY.map((manifest) => ({
    ...manifest,
    installed: checkPluginInstalled(manifest),
  }));
}

export async function installPlugin(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const manifest = getManifest(id);
  if (!manifest) {
    return { success: false, error: `Plugin ${id} not found in registry` };
  }

  if (manifest.npmPackages.length === 0) {
    return { success: true };
  }

  const appPath = path.join(__dirname, '..', '..', '..', 'release', 'app');
  const packages = manifest.npmPackages.join(' ');

  try {
    console.log(`[plugins] Installing ${packages} for ${id}...`);
    await execAsync(`npm install ${packages}`, { cwd: appPath });
    console.log(`[plugins] Installed ${id} successfully`);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[plugins] Failed to install ${id}: ${error}`);
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
    return { success: true };
  }

  const appPath = path.join(__dirname, '..', '..', '..', 'release', 'app');
  const packages = manifest.npmPackages.join(' ');

  try {
    console.log(`[plugins] Uninstalling ${packages} for ${id}...`);
    await execAsync(`npm uninstall ${packages}`, { cwd: appPath });
    console.log(`[plugins] Uninstalled ${id} successfully`);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[plugins] Failed to uninstall ${id}: ${error}`);
    return { success: false, error };
  }
}
