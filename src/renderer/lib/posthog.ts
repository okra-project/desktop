import posthog from 'posthog-js';

const POSTHOG_KEY = process.env.POSTHOG_KEY || '';
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
const POSTHOG_ENABLED = Boolean(POSTHOG_KEY);

let isInitialized = false;
let telemetryConsent: boolean | null = null;
let userId: string | null = null;

export async function initPostHog(): Promise<void> {
  if (isInitialized || !POSTHOG_ENABLED) return;

  telemetryConsent = await window.electron.ipcRenderer.invoke('telemetry:get-consent');
  userId = await window.electron.ipcRenderer.invoke('telemetry:get-user-id');

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: 'memory',
    opt_out_capturing_by_default: true,
    person_profiles: 'identified_only',
    sanitize_properties: (properties) => {
      ['$pathname', '$initial_pathname', '$current_url', '$initial_current_url', '$host', '$initial_host']
        .forEach((key) => { if (properties[key]) properties[key] = null; });
      return properties;
    },
  });

  if (userId) posthog.identify(userId);
  posthog.register({ app_type: 'desktop', app_platform: process.platform });
  if (telemetryConsent === true) posthog.opt_in_capturing();

  window.electron.ipcRenderer.on('telemetry:event', (data: unknown) => {
    const { eventName, properties } = data as { eventName: string; properties?: Record<string, unknown> };
    capture(eventName, properties);
  });

  isInitialized = true;
}

export function capture(eventName: string, properties?: Record<string, unknown>): void {
  if (!POSTHOG_ENABLED || telemetryConsent !== true) return;
  posthog.capture(eventName, properties);
}

export async function setTelemetryConsent(consent: boolean): Promise<void> {
  telemetryConsent = consent;
  await window.electron.ipcRenderer.invoke('telemetry:set-consent', consent);
  if (!POSTHOG_ENABLED) return;
  if (consent) posthog.opt_in_capturing();
  else posthog.opt_out_capturing();
}

export function getTelemetryConsent(): boolean | null {
  return telemetryConsent;
}

export function hasBeenAskedForConsent(): boolean {
  return telemetryConsent !== null;
}

export function trackDocumentOpened(properties: { documentId: string; documentName?: string; source: 'library' | 'local' }): void {
  capture('document_opened', properties);
}

export function trackAgentQuery(properties: { queryLength: number; hasFiles: boolean }): void {
  capture('agent_query', properties);
}

export function trackFileDownloaded(properties: { fileType: string; fileSize: number }): void {
  capture('file_downloaded', properties);
}

export function trackError(error: Error, context?: Record<string, unknown>): void {
  capture('error_occurred', { error_message: error.message, error_name: error.name, ...context });
}
