/**
 * Schema Extraction Handlers - IPC handlers for structured data extraction
 */

import { ipcMain } from 'electron';
import { storeService } from '../services/store.service';
import { runSchemaExtraction, runSchemaAssistant } from '../schema-extraction';
import type {
  SchemaDefinition,
  CitationMode,
  SchemaAssistantMessage,
} from '../../shared/types/schema';

export function registerSchemaHandlers(): void {
  ipcMain.handle(
    'schema:run-extraction',
    async (
      _event,
      workspacePath: string,
      schema: SchemaDefinition,
      options?: { pages?: string; citation_mode?: CitationMode },
    ) => {
      const apiKey = storeService.getOpenRouterApiKey();
      if (!apiKey) {
        return {
          success: false,
          error: 'OpenRouter API key not configured. Add it in Settings.',
        };
      }

      try {
        const result = await runSchemaExtraction({
          apiKey,
          workspacePath,
          schema,
          pages: options?.pages,
          citationMode: options?.citation_mode,
        });
        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    },
  );

  ipcMain.handle(
    'schema:run-assistant',
    async (
      _event,
      messages: SchemaAssistantMessage[],
      currentSchema?: SchemaDefinition,
      templateHint?: string,
    ) => {
      const apiKey = storeService.getOpenRouterApiKey();
      if (!apiKey) {
        return {
          success: false,
          error: 'OpenRouter API key not configured. Add it in Settings.',
        };
      }

      try {
        const result = await runSchemaAssistant({
          apiKey,
          messages,
          currentSchema,
          templateHint,
        });
        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    },
  );
}
