/**
 * Telemetry Handlers - PostHog analytics and BYOK settings
 */

import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { storeService } from '../services/store.service';
import { getHandlerContext } from './index';

/**
 * Send telemetry event to renderer (which forwards to PostHog)
 */
export function sendTelemetryEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  const ctx = getHandlerContext();
  if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
    ctx.mainWindow.webContents.send('telemetry:event', { eventName, properties });
  }
}

export function registerTelemetryHandlers(): void {
  ipcMain.handle('telemetry:get-consent', async () => {
    return storeService.getTelemetryConsent();
  });

  ipcMain.handle('telemetry:set-consent', async (_event, consent: boolean) => {
    storeService.setTelemetryConsent(consent);
    console.error(`[telemetry] Consent set to ${consent}`);
    return { success: true };
  });

  ipcMain.handle('telemetry:get-user-id', async () => {
    let userId = storeService.getTelemetryUserId();
    if (!userId) {
      userId = `desktop_${randomUUID()}`;
      storeService.setTelemetryUserId(userId);
      console.error(
        `[telemetry] Generated new user ID: ${userId.slice(0, 20)}...`,
      );
    }
    return userId;
  });

  // BYOK settings handlers
  ipcMain.handle('byok:get-settings', async () => {
    return storeService.getByokSettings();
  });

  ipcMain.handle(
    'byok:set-settings',
    async (
      _event,
      settings: {
        enabled: boolean;
        anthropicApiKey?: string;
        openrouterApiKey?: string;
        okrapdfApiKey?: string;
      },
    ) => {
      storeService.setByokSettings({
        ...settings,
        lastValidated: new Date().toISOString(),
      });
      console.error(`[byok] Settings updated, enabled=${settings.enabled}`);
      return { success: true };
    },
  );

  // Get global okrapdf API key
  ipcMain.handle('byok:get-okrapdf-key', async () => {
    return storeService.getOkrapdfApiKey();
  });

  ipcMain.handle(
    'byok:validate-key',
    async (_event, provider: 'anthropic' | 'openrouter', apiKey: string) => {
      try {
        if (provider === 'anthropic') {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'Hi' }],
            }),
          });

          if (response.ok || response.status === 400) {
            return { valid: true, provider };
          }

          const errorData = await response.json().catch(() => ({}));
          return {
            valid: false,
            provider,
            error: errorData.error?.message || `HTTP ${response.status}`,
          };
        }

        if (provider === 'openrouter') {
          const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
            headers: { Authorization: `Bearer ${apiKey}` },
          });

          if (response.ok) {
            return { valid: true, provider };
          }

          return { valid: false, provider, error: `HTTP ${response.status}` };
        }

        return { valid: false, provider, error: 'Unknown provider' };
      } catch (error) {
        return {
          valid: false,
          provider,
          error: error instanceof Error ? error.message : 'Validation failed',
        };
      }
    },
  );

  ipcMain.handle('byok:is-enabled', async () => {
    return storeService.hasAnthropicApiKey();
  });

  // Claude status check
  ipcMain.handle('claude:check-status', async () => {
    return { ready: storeService.hasAnthropicApiKey() };
  });
}
