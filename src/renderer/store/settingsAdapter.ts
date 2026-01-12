import { z } from 'zod';
import type {
  SettingsAdapter,
  OcrProviderId,
  OcrProviderConfig,
  ByokSettings,
  ValidationResult,
} from '@okrapdf/redux';

const ByokSettingsSchema = z
  .object({
    enabled: z.boolean(),
    anthropicApiKey: z.string().nullable(),
    openrouterApiKey: z.string().nullable(),
  })
  .nullable();

const ProviderConfigSchema = z
  .object({
    apiKey: z.string().optional(),
    projectId: z.string().optional(),
    processorId: z.string().optional(),
    modelId: z.string().optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .nullable();

const ListProvidersResponseSchema = z.object({
  builtIn: z.array(z.object({ id: z.string() })).optional(),
  plugins: z
    .array(
      z.object({
        metadata: z.object({ id: z.string() }).optional(),
      }),
    )
    .optional(),
});

const HealthCheckResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  latencyMs: z.number().optional(),
});

function validateIpc<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context: string,
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[IPC Validation Error] ${context}:`, result.error.format());
    console.error(
      '[IPC Validation Error] Received:',
      JSON.stringify(data, null, 2),
    );
    throw new Error(
      `IPC validation failed for ${context}: ${result.error.message}`,
    );
  }
  return result.data;
}

export const electronSettingsAdapter: SettingsAdapter = {
  async loadByokSettings(): Promise<ByokSettings> {
    const raw = await window.electron.ipcRenderer.invoke('byok:get-settings');
    const settings = validateIpc(ByokSettingsSchema, raw, 'byok:get-settings');
    return (
      settings || {
        enabled: false,
        anthropicApiKey: null,
        openrouterApiKey: null,
      }
    );
  },

  async loadProviderConfig(
    providerId: OcrProviderId,
  ): Promise<OcrProviderConfig | null> {
    const raw = await window.electron.ipcRenderer.invoke(
      'ocr:get-config',
      providerId,
    );
    return validateIpc(
      ProviderConfigSchema,
      raw,
      `ocr:get-config(${providerId})`,
    );
  },

  async saveProviderConfig(
    providerId: OcrProviderId,
    config: OcrProviderConfig,
  ): Promise<void> {
    await window.electron.ipcRenderer.invoke(
      'ocr:save-config',
      providerId,
      config,
    );
  },

  async validateApiKey(
    provider: string,
    apiKey: string,
  ): Promise<ValidationResult> {
    const result = await window.electron.ipcRenderer.invoke(
      'byok:validate-key',
      provider,
      apiKey,
    );
    return result as ValidationResult;
  },

  async testProviderHealth(
    providerId: OcrProviderId,
    config: OcrProviderConfig,
  ): Promise<ValidationResult> {
    const raw = await window.electron.ipcRenderer.invoke(
      'ocr:check-health',
      providerId,
      config,
    );
    const result = validateIpc(
      HealthCheckResponseSchema,
      raw,
      `ocr:check-health(${providerId})`,
    );
    return {
      provider: providerId,
      valid: result.ok,
      error: result.error,
      latencyMs: result.latencyMs,
    };
  },

  async listProviders(): Promise<{ id: OcrProviderId }[]> {
    const raw = await window.electron.ipcRenderer.invoke('ocr:list-providers');
    const result = validateIpc(
      ListProvidersResponseSchema,
      raw,
      'ocr:list-providers',
    );
    const allProviders: { id: OcrProviderId }[] = [];
    if (result.builtIn) {
      for (const p of result.builtIn) {
        allProviders.push({ id: p.id as OcrProviderId });
      }
    }
    if (result.plugins) {
      for (const p of result.plugins) {
        if (p.metadata?.id) {
          allProviders.push({ id: p.metadata.id as OcrProviderId });
        }
      }
    }
    return allProviders;
  },
};
