import { useState, useEffect } from 'react';

export interface LayerDefinition {
  id: string;
  displayName: string;
  icon: string;
  color: {
    hex: string;
    border: string;
    fill: string;
  };
  category?: 'entity' | 'ocr';
}

export function useAvailableLayers() {
  const [layers, setLayers] = useState<LayerDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLayers() {
      try {
        const result = await window.electron.ipcRenderer.invoke(
          'ocr:get-available-layers',
        );
        setLayers(result ?? []);
      } catch (err) {
        console.error('[useAvailableLayers] Failed to fetch layers:', err);
        setLayers([]);
      } finally {
        setLoading(false);
      }
    }
    fetchLayers();
  }, []);

  return { layers, loading };
}
