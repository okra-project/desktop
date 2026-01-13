import path from 'path';
import type {
  SchemaAdapter,
  PluginManifest,
  IndexedBbox,
  OkraPageJson,
  EntityType,
  NormalizedBbox,
} from '../../../shared/types/index';

function verticesToBbox(
  vertices: Array<{ x: number; y: number }>,
): NormalizedBbox {
  const xs = vertices.map((v) => v.x);
  const ys = vertices.map((v) => v.y);
  return {
    xMin: Math.min(...xs),
    yMin: Math.min(...ys),
    xMax: Math.max(...xs),
    yMax: Math.max(...ys),
  };
}

function normalizeType(type: unknown): EntityType {
  if (typeof type !== 'string') return 'unknown';
  return type.toLowerCase();
}

export class OkraPageAdapter implements SchemaAdapter {
  schemaId = 'okra-page-v1';

  canHandle(manifest: PluginManifest): boolean {
    return (
      manifest.schema === 'okra-page-v1' ||
      manifest.plugin === 'openrouter-vlm' ||
      manifest.plugin === 'openrouter'
    );
  }

  extract(
    filePath: string,
    content: unknown,
    manifest: PluginManifest,
    documentId: string,
    documentName: string,
  ): IndexedBbox[] {
    const page = content as OkraPageJson;
    if (!page.bboxes || !Array.isArray(page.bboxes)) {
      return [];
    }

    const plugin = manifest.plugin || path.basename(path.dirname(filePath));

    return page.bboxes.map((bbox, idx) => ({
      id: `${documentId}:${plugin}:p${page.pageNumber}:${idx}`,
      documentId,
      documentName,
      pageNumber: page.pageNumber,
      source: {
        plugin,
        filePath,
      },
      type: normalizeType(bbox.type),
      text: bbox.text || '',
      bbox: verticesToBbox(bbox.vertices),
    }));
  }
}
