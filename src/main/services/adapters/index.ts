import type {
  SchemaAdapter,
  PluginManifest,
} from '../../../shared/types/index';
import { OkraPageAdapter } from './okra-page.adapter';

const adapters: SchemaAdapter[] = [new OkraPageAdapter()];

export function getAdapter(manifest: PluginManifest): SchemaAdapter | null {
  return adapters.find((a) => a.canHandle(manifest)) ?? null;
}

export function registerAdapter(adapter: SchemaAdapter): void {
  adapters.push(adapter);
}
