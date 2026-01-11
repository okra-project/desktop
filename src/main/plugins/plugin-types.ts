/**
 * OCR Plugin System Types
 *
 * Plugins are optional providers that may have external dependencies.
 * If dependencies are missing, the plugin is simply not loaded (no build failure).
 */

import type {
  OcrProviderId,
  OcrProviderConfig,
  OcrProviderMetadata,
  OcrPageResult,
} from '../providers/ocr-types';

/**
 * Interface that all OCR provider plugins must implement
 */
export interface OcrPlugin {
  /** Unique provider ID */
  id: OcrProviderId;

  /** Provider metadata (capabilities, config schema, etc.) */
  metadata: OcrProviderMetadata;

  /**
   * Extract content from a page image
   */
  extract(
    imageBuffer: Buffer,
    pageNumber: number,
    config: OcrProviderConfig,
  ): Promise<OcrPageResult>;

  /**
   * Verify credentials/connection works
   */
  checkHealth(
    config: OcrProviderConfig,
  ): Promise<{ ok: boolean; error?: string; latencyMs?: number }>;
}

/**
 * Plugin module export shape
 */
export interface OcrPluginModule {
  /** Create plugin instance */
  createPlugin(): OcrPlugin;

  /**
   * Check if plugin dependencies are available.
   * Return null if available, or error message if not.
   */
  checkDependencies(): string | null;
}
