import type { LayerDefinition } from '../hooks/useAvailableLayers';

const DEFAULT_COLOR = {
  hex: '#64748b',
  border: 'rgba(100, 116, 139, 0.9)',
  fill: 'rgba(100, 116, 139, 0.15)',
};

export function getLayerColor(
  layerId: string,
  layers?: LayerDefinition[],
): { hex: string; border: string; fill: string } {
  if (!layers) return DEFAULT_COLOR;
  const exact = layers.find((l) => l.id === layerId);
  if (exact) return exact.color;
  const suffixMatch = layers.find((l) => l.id.endsWith(`:${layerId}`));
  return suffixMatch?.color ?? DEFAULT_COLOR;
}

export function buildOverlayColors(
  layers?: LayerDefinition[],
): Record<string, { border: string; fill: string; label: string }> {
  const colors: Record<
    string,
    { border: string; fill: string; label: string }
  > = {};

  for (const layer of layers ?? []) {
    const colorEntry = {
      border: layer.color.border,
      fill: layer.color.fill,
      label: layer.color.hex,
    };
    colors[layer.id] = colorEntry;
    const colonIdx = layer.id.indexOf(':');
    if (colonIdx > 0) {
      const suffix = layer.id.slice(colonIdx + 1);
      if (!colors[suffix]) colors[suffix] = colorEntry;
    }
  }

  colors._default = {
    border: DEFAULT_COLOR.border,
    fill: DEFAULT_COLOR.fill,
    label: DEFAULT_COLOR.hex,
  };

  return colors;
}
