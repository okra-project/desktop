import { useState, useEffect, useCallback } from 'react';
import type { LayerDefinition } from './useAvailableLayers';

export interface WorkspaceLayer extends LayerDefinition {
  available: boolean;
  pluginId: string;
}

export function useWorkspaceLayers(workspacePath: string | null) {
  const [pluginLayers, setPluginLayers] = useState<LayerDefinition[]>([]);
  const [discoveredTypes, setDiscoveredTypes] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);

  const fetchDiscoveredTypes = useCallback(async () => {
    if (!workspacePath) return;
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'ocr:get-workspace-types',
        workspacePath,
      );
      setDiscoveredTypes(new Set(result?.types ?? []));
    } catch {}
  }, [workspacePath]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const layers = await window.electron.ipcRenderer.invoke(
          'ocr:get-available-layers',
        );
        setPluginLayers(layers ?? []);
        await fetchDiscoveredTypes();
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [fetchDiscoveredTypes]);

  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on(
      'ocr:progress',
      (...args: unknown[]) => {
        const progress = args[0] as { phase?: string } | undefined;
        if (progress?.phase === 'complete') {
          fetchDiscoveredTypes();
        }
      },
    );
    return unsubscribe;
  }, [fetchDiscoveredTypes]);

  const layers: WorkspaceLayer[] = pluginLayers.map((layer) => {
    const pluginId = layer.id.split(':')[0] || 'unknown';
    return {
      ...layer,
      available: discoveredTypes.has(layer.id),
      pluginId,
    };
  });

  return { layers, loading, refresh: fetchDiscoveredTypes };
}
