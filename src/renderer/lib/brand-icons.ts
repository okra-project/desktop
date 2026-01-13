/**
 * Brand Icons Registry
 *
 * Static brand icons bundled from Simple Icons and n8n.
 * Used by plugins to display provider logos.
 *
 * Usage:
 *   import { BrandIcon, getBrandIconUrl } from '@/lib/brand-icons';
 *   <img src={getBrandIconUrl('openai')} />
 *   <img src={getBrandIconUrl('openai', 'dark')} />
 */

// All available brand icon names
export const BRAND_ICONS = [
  // AI/ML Providers
  'openai',
  'anthropic',
  'gemini',
  'groq',
  'mistral',
  'ollama',
  'huggingface',

  // Cloud Providers
  'google',
  'googlecloud',
  'aws-s3',
  'aws-lambda',
  'aws-textract',

  // Cloud Storage
  'googledrive',
  'dropbox',
  'box',
  'icloud',

  // Document/Productivity
  'googledocs',
  'googlesheets',
  'notion',
  'evernote',

  // Dev Tools
  'github',
  'gitlab',
  'docker',
  'python',

  // Communication
  'slack',
  'discord',
  'gmail',

  // Data/Analytics
  'postgresql',
  'mongodb',
  'elasticsearch',
  'airtable',
] as const;

export type BrandIconName = (typeof BRAND_ICONS)[number];

export type IconVariant = 'light' | 'dark';

/**
 * Icons that have dark variants available
 */
const ICONS_WITH_DARK_VARIANT = new Set<BrandIconName>([
  'openai',
  'anthropic',
  'google',
  'googlecloud',
  'googledrive',
  'googledocs',
  'googlesheets',
  'dropbox',
  'box',
  'icloud',
  'notion',
  'evernote',
  'github',
  'gitlab',
  'docker',
  'python',
  'slack',
  'discord',
  'gmail',
  'postgresql',
  'mongodb',
  'elasticsearch',
  'airtable',
  'ollama',
  'huggingface',
]);

/**
 * Get the URL/path to a brand icon
 */
export function getBrandIconUrl(
  name: BrandIconName,
  variant: IconVariant = 'light'
): string {
  const suffix = variant === 'dark' && ICONS_WITH_DARK_VARIANT.has(name) ? '.dark' : '';
  return `brand-icons/${name}${suffix}.svg`;
}

/**
 * Check if an icon has a dark variant
 */
export function hasDarkVariant(name: BrandIconName): boolean {
  return ICONS_WITH_DARK_VARIANT.has(name);
}

/**
 * Icon reference format used in plugin schemas (n8n-style)
 */
export type PluginIconRef =
  | `file:${string}` // file:openai.svg
  | { light: `file:${string}`; dark: `file:${string}` }; // { light: 'file:openai.svg', dark: 'file:openai.dark.svg' }

/**
 * Parse a plugin icon reference to get the actual icon path
 */
export function resolvePluginIcon(
  ref: PluginIconRef,
  variant: IconVariant = 'light'
): string {
  if (typeof ref === 'string') {
    // Simple file reference: "file:openai.svg"
    return `brand-icons/${ref.replace('file:', '')}`;
  }
  // Object with light/dark variants
  const file = variant === 'dark' ? ref.dark : ref.light;
  return `brand-icons/${file.replace('file:', '')}`;
}

/**
 * Category groupings for UI display
 */
export const ICON_CATEGORIES = {
  'AI Providers': ['openai', 'anthropic', 'gemini', 'groq', 'mistral', 'ollama', 'huggingface'],
  'Cloud': ['google', 'googlecloud', 'aws-s3', 'aws-lambda', 'aws-textract'],
  'Storage': ['googledrive', 'dropbox', 'box', 'icloud'],
  'Documents': ['googledocs', 'googlesheets', 'notion', 'evernote'],
  'Development': ['github', 'gitlab', 'docker', 'python'],
  'Communication': ['slack', 'discord', 'gmail'],
  'Databases': ['postgresql', 'mongodb', 'elasticsearch', 'airtable'],
} as const;
