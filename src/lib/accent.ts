/**
 * Shared chrome for the image tools.
 * The image family reuses the PDF shell (same work area, same card grid) but
 * paints its primary action blue, as iLoveIMG does. `accentFor(slug)` is the
 * single place that decision lives, so a tool never hard-codes a colour.
 */
import { ALL_TOOL_BY_SLUG } from '@/content/tools';

export function isImageTool(slug: string): boolean {
  return ALL_TOOL_BY_SLUG[slug]?.category.startsWith('image-') ?? false;
}

export function accentFor(slug: string): {
  /** Solid CTA and icon backgrounds. */
  base: string;
  /** Hover/pressed shade. */
  dark: string;
  /** Tinted surface for selection rings and soft chips. */
  soft: string;
  /** Outline ring colour. */
  ring: string;
} {
  if (isImageTool(slug)) {
    return {
      base: 'bg-img',
      dark: 'hover:bg-img-dark',
      soft: 'bg-img-soft',
      ring: 'outline-img',
    };
  }
  return {
    base: 'bg-brand',
    dark: 'hover:bg-brand-dark',
    soft: 'bg-brand-soft',
    ring: 'outline-brand',
  };
}