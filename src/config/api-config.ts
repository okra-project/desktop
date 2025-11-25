/**
 * OkraPDF API Configuration
 * This file contains the pre-configured API key for OkraPDF Desktop
 * Users do not need to provide their own API key
 */

export const API_CONFIG = {
  // Pre-configured Anthropic API key - users don't need their own
  ANTHROPIC_API_KEY: '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',

  // Application info
  APP_NAME: 'OkraPDF Desktop',
  APP_VERSION: '1.0.0',
};

// Initialize API key in environment
export function initializeAPIConfig(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = API_CONFIG.ANTHROPIC_API_KEY;
  }
}
