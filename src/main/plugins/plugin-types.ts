/**
 * OCR Plugin System Types
 *
 * Plugins are optional providers that may have external dependencies.
 * If dependencies are missing, the plugin is simply not loaded (no build failure).
 *
 * ## AI-Native Plugin Philosophy
 *
 * Plugins should be "AI-native" - when merging functionality into the main app,
 * consider exposing additional fields that allow injecting AI capabilities:
 *
 * - `skills?: SkillDefinition[]` - Inject skill definitions the agent can invoke
 * - `mcpTools?: McpToolDefinition[]` - Expose MCP tools for agent use
 * - `codemodeScript?: string` - Provide codemode scripts for agent execution
 *
 * This enables plugins to extend not just the app's functionality, but also
 * the AI agent's capabilities, making the entire system more composable.
 */

import type {
  OcrProviderId,
  OcrProviderConfig,
  OcrProviderMetadata,
  OcrPageResult,
  WorkflowExecutionContext,
  WorkflowNodeResult,
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

  /**
   * Execute as workflow node (called per-page)
   *
   * Only required if metadata.workflowNode is defined.
   * This is the new way for plugins to integrate with the workflow system.
   *
   * @example
   * ```ts
   * async executeWorkflow(ctx) {
   *   const start = Date.now();
   *   ctx.reportProgress(`Processing page ${ctx.pageNumber}`);
   *   const result = await this.extract(ctx.input.pageImage!, ctx.pageNumber, ctx.config);
   *   return { entities: result, markdown: result.markdown, durationMs: Date.now() - start };
   * }
   * ```
   */
  executeWorkflow?(
    context: WorkflowExecutionContext,
  ): Promise<WorkflowNodeResult>;
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
