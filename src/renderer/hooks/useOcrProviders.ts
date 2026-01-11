/**
 * useOcrProviders Hook
 *
 * Provides access to OCR provider functionality from the renderer process.
 */

import { useState, useEffect, useCallback } from 'react';

// Types mirrored from main process
export type OcrProviderId = 'google-docai' | 'openrouter' | string;

export interface OcrProviderCapabilities {
  supportsText: boolean;
  supportsTables: boolean;
  supportsBboxes: boolean;
  supportsFigures: boolean;
  supportsHandwriting: boolean;
  supportsMultiLanguage: boolean;
  outputFormats: ('json' | 'markdown' | 'text')[];
  maxPagesPerRequest: number;
}

export type OcrProviderCategory = 'ocr' | 'agent' | 'vlm';

export interface OcrProviderMetadata {
  id: OcrProviderId;
  name: string;
  description: string;
  runtime: 'api' | 'local' | 'python';
  category: OcrProviderCategory;
  capabilities: OcrProviderCapabilities;
  configSchema?: Record<string, unknown>;
  documentationUrl?: string;
  costPerPage?: number;
  isCloud: boolean;
  installInstructions?: string;
  installed?: boolean;
  npmPackages?: string[];
}

export interface OcrProviderConfig {
  apiKey?: string;
  projectId?: string;
  processorId?: string;
  modelId?: string;
  options?: Record<string, unknown>;
}

export interface OcrBoundingBox {
  type: 'text' | 'table' | 'figure' | 'heading' | 'paragraph' | 'line';
  vertices: { x: number; y: number }[];
  text?: string;
  confidence?: number;
  blockId?: string;
}

export interface OcrPageResult {
  pageNumber: number;
  markdown?: string;
  bboxes: OcrBoundingBox[];
  tables?: {
    id: string;
    markdown: string;
    headers?: string[];
    rowCount: number;
    colCount: number;
  }[];
  confidence?: number;
  durationMs?: number;
}

export interface OcrProgress {
  providerId: OcrProviderId;
  phase: 'starting' | 'processing' | 'completed' | 'failed';
  currentPage?: number;
  totalPages?: number;
  message?: string;
  error?: string;
}

export function useOcrProviders() {
  const [providers, setProviders] = useState<OcrProviderMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      const result =
        await window.electron.ipcRenderer.invoke('ocr:list-providers');
      const allProviders: OcrProviderMetadata[] = [];

      if (result.builtIn) {
        for (const p of result.builtIn) {
          allProviders.push({ ...p, installed: true });
        }
      }
      if (result.plugins) {
        for (const p of result.plugins) {
          allProviders.push({
            ...p.metadata,
            installed: p.installed,
            npmPackages: p.npmPackages,
          });
        }
      }

      setProviders(allProviders);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const getConfig = useCallback(
    async (providerId: OcrProviderId): Promise<OcrProviderConfig | null> => {
      return window.electron.ipcRenderer.invoke('ocr:get-config', providerId);
    },
    [],
  );

  const saveConfig = useCallback(
    async (
      providerId: OcrProviderId,
      config: OcrProviderConfig,
    ): Promise<void> => {
      return window.electron.ipcRenderer.invoke(
        'ocr:save-config',
        providerId,
        config,
      );
    },
    [],
  );

  const checkHealth = useCallback(
    async (
      providerId: OcrProviderId,
      config: OcrProviderConfig,
    ): Promise<{ ok: boolean; error?: string; latencyMs?: number }> => {
      return window.electron.ipcRenderer.invoke(
        'ocr:check-health',
        providerId,
        config,
      );
    },
    [],
  );

  const installPlugin = useCallback(
    async (pluginId: string): Promise<{ success: boolean; error?: string }> => {
      setInstalling(pluginId);
      try {
        const result = await window.electron.ipcRenderer.invoke(
          'plugin:install',
          pluginId,
        );
        if (result.success) {
          await fetchProviders();
        }
        return result;
      } finally {
        setInstalling(null);
      }
    },
    [fetchProviders],
  );

  const uninstallPlugin = useCallback(
    async (pluginId: string): Promise<{ success: boolean; error?: string }> => {
      const result = await window.electron.ipcRenderer.invoke(
        'plugin:uninstall',
        pluginId,
      );
      if (result.success) {
        await fetchProviders();
      }
      return result;
    },
    [fetchProviders],
  );

  return {
    providers,
    loading,
    error,
    installing,
    getConfig,
    saveConfig,
    checkHealth,
    installPlugin,
    uninstallPlugin,
    refetch: fetchProviders,
  };
}

// Hook for OCR extraction operations
export function useOcrExtraction(workspacePath: string | null) {
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Listen for progress updates
  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on(
      'ocr:progress',
      (data: unknown) => {
        setProgress(data as OcrProgress);
        const p = data as OcrProgress;
        if (p.phase === 'completed') {
          setExtracting(false);
        } else if (p.phase === 'failed') {
          setExtracting(false);
          setError(p.error ?? 'Extraction failed');
        }
      },
    );

    return unsubscribe;
  }, []);

  // Start extraction
  const extract = useCallback(
    async (
      providerId: OcrProviderId,
      config: OcrProviderConfig,
      options?: { startPage?: number; endPage?: number },
    ) => {
      if (!workspacePath) {
        setError('No workspace path');
        return null;
      }

      setExtracting(true);
      setProgress(null);
      setError(null);

      try {
        const result = await window.electron.ipcRenderer.invoke(
          'ocr:extract-document',
          {
            providerId,
            workspacePath,
            config,
            options,
          },
        );

        if (!result.success) {
          setError(result.error ?? 'Extraction failed');
          return null;
        }

        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Extraction failed';
        setError(msg);
        return null;
      } finally {
        setExtracting(false);
      }
    },
    [workspacePath],
  );

  // Get extraction results
  const getResults = useCallback(
    async (
      providerId: OcrProviderId,
    ): Promise<{
      pages: OcrPageResult[];
      manifest: unknown;
    } | null> => {
      if (!workspacePath) return null;
      return window.electron.ipcRenderer.invoke(
        'ocr:get-results',
        workspacePath,
        providerId,
      );
    },
    [workspacePath],
  );

  // Get bboxes for a specific page
  const getPageBboxes = useCallback(
    async (
      providerId: OcrProviderId,
      pageNumber: number,
    ): Promise<OcrBoundingBox[]> => {
      if (!workspacePath) return [];
      return window.electron.ipcRenderer.invoke(
        'ocr:get-page-bboxes',
        workspacePath,
        providerId,
        pageNumber,
      );
    },
    [workspacePath],
  );

  return {
    extracting,
    progress,
    error,
    extract,
    getResults,
    getPageBboxes,
  };
}

// Utility to convert OCR bboxes (vertices format) to EntityOverlay format
export function convertOcrBboxToEntity(
  bbox: OcrBoundingBox,
  pageNumber: number,
  index: number,
): {
  id: string;
  type: 'table' | 'figure' | 'footnote' | 'summary' | 'paragraph' | 'signature';
  title: string | null;
  bbox: { x: number; y: number; width: number; height: number };
  page: number;
} | null {
  if (!bbox.vertices || bbox.vertices.length < 4) return null;

  // Convert vertices to x/y/width/height
  // Vertices are normalized (0-1) from Google Doc AI
  const xs = bbox.vertices.map((v) => v.x);
  const ys = bbox.vertices.map((v) => v.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  // Map OCR types to entity types
  const typeMap: Record<
    string,
    'table' | 'figure' | 'footnote' | 'summary' | 'paragraph' | 'signature'
  > = {
    table: 'table',
    figure: 'figure',
    paragraph: 'paragraph',
    heading: 'paragraph', // Heading maps to paragraph for now
    text: 'paragraph',
    line: 'paragraph',
  };

  return {
    id: `ocr-p${pageNumber}-${index}`,
    type: typeMap[bbox.type] ?? 'paragraph',
    title: bbox.text?.slice(0, 50) ?? null,
    bbox: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    },
    page: pageNumber,
  };
}
