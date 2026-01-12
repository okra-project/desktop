/**
 * PDF Utilities - Common PDF file operations
 */

import fs from 'fs';
import path from 'path';

/**
 * Find the PDF file in a workspace directory.
 * Workspaces should have exactly one PDF file.
 */
export function findPdfInWorkspace(workspacePath: string): string | null {
  try {
    const files = fs.readdirSync(workspacePath);
    const pdfFile = files.find((f) => f.toLowerCase().endsWith('.pdf'));
    return pdfFile ? path.join(workspacePath, pdfFile) : null;
  } catch {
    return null;
  }
}

/**
 * Get environment with Claude API config (from provider config or legacy BYOK)
 */
export function getClaudeEnv(
  baseEnv: NodeJS.ProcessEnv,
  getAnthropicApiKey: () => string | null,
): NodeJS.ProcessEnv {
  const apiKey = getAnthropicApiKey();
  if (apiKey) {
    return {
      ...baseEnv,
      ANTHROPIC_API_KEY: apiKey,
    };
  }
  console.error('[config] WARNING: No API key configured');
  return baseEnv;
}
