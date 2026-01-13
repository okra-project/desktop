/**
 * BrandIcon Component
 *
 * Displays brand icons for plugins and integrations.
 * Supports light/dark variants and automatic theme detection.
 */
import { useMemo } from 'react';
import {
  BrandIconName,
  IconVariant,
  getBrandIconUrl,
  hasDarkVariant,
} from '../lib/brand-icons';

interface BrandIconProps {
  name: BrandIconName;
  size?: number | string;
  variant?: IconVariant | 'auto';
  className?: string;
  alt?: string;
}

export function BrandIcon({
  name,
  size = 24,
  variant = 'auto',
  className = '',
  alt,
}: BrandIconProps) {
  const resolvedVariant = useMemo((): IconVariant => {
    if (variant !== 'auto') return variant;
    // Auto-detect based on system preference
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return 'light';
  }, [variant]);

  const iconUrl = getBrandIconUrl(name, resolvedVariant);

  const sizeStyle = typeof size === 'number' ? `${size}px` : size;

  return (
    <img
      src={iconUrl}
      alt={alt ?? `${name} icon`}
      className={className}
      style={{
        width: sizeStyle,
        height: sizeStyle,
      }}
    />
  );
}

/**
 * BrandIcon with automatic dark mode support via CSS filter
 * Use this when you only have the light variant but need dark mode support
 */
export function BrandIconAdaptive({
  name,
  size = 24,
  className = '',
  alt,
}: Omit<BrandIconProps, 'variant'>) {
  const iconUrl = getBrandIconUrl(name, 'light');
  const hasDark = hasDarkVariant(name);

  const sizeStyle = typeof size === 'number' ? `${size}px` : size;

  return (
    <img
      src={iconUrl}
      alt={alt ?? `${name} icon`}
      className={className}
      style={{
        width: sizeStyle,
        height: sizeStyle,
        // If no dark variant, use CSS filter to invert in dark mode
        // This should be controlled via CSS class in production
        ...(hasDark ? {} : { filter: 'var(--brand-icon-filter, none)' }),
      }}
    />
  );
}

export default BrandIcon;
