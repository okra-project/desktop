/**
 * OkraPDF API Configuration
 *
 * This app uses "Bring Your Own Agent" (BYOA) - users use their own Claude Code CLI
 * authentication or provide their own API key. No bundled API key.
 */

export const API_CONFIG = {
  // Application info
  APP_NAME: 'OkraPDF Desktop',
  APP_VERSION: '1.0.0',

  // OkraPDF API base URL
  OKRAPDF_API_BASE: process.env.OKRAPDF_API_URL || 'https://app.okrapdf.com',
};

// Initialize configuration - no API key bundled (BYOA model)
export function initializeAPIConfig(): void {
  // BYOA: We do NOT set ANTHROPIC_API_KEY here
  // The Claude Agent SDK will use:
  // 1. User's Claude Code CLI authentication (if installed)
  // 2. User-provided API key (via settings)
  // 3. Environment variable ANTHROPIC_API_KEY (if set by user)
  // Use stderr to avoid polluting JSON stream when SDK spawns process
  console.error('[config] BYOA mode - using user\'s own Claude subscription');
}
