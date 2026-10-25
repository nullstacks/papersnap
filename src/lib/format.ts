/**
 * Pure helpers with NO dependencies.
 *
 * These used to live in `lib/pdf`, which imports pdf-lib and pdf.js at module
 * scope. Because a dozen components imported that module for nothing more than
 * a byte formatter, the whole PDF engine sat on the landing page's critical
 * path: 339.7 kB gzip of code first paint never executes. Anything here is
 * importable from a component without pulling an engine behind it.
 */

/** Format a byte count the way the reference site does. */
export function prettySize(bytes: number): string {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1) return `${bytes} B`;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(2).replace(/\.00$/, '')} MB`;
}

/** Strip the extension so a tool can append its own suffix. */
export function baseName(name: string): string {
  return (name || 'document').replace(/\.[^.]+$/, '');
}

/** Trigger a browser download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* Revoke after the click has been handled. */
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Yield to the event loop so the progress UI can paint between pages. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
}

/**
 * Formats this build can actually decode.
 *
 * `accept="image/*"` used to admit TIFF, HEIC and friends, which then failed to
 * decode with a bare "!" on the card and no explanation. The list below is what
 * every modern browser genuinely decodes through <canvas>.
 */
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|svg)$/i;
const IMAGE_TYPE = /^image\/(jpeg|png|webp|gif|bmp|x-ms-bmp|avif|svg\+xml)$/i;

export function isImage(file: File): boolean {
  if (file.type) return IMAGE_TYPE.test(file.type) || IMAGE_EXT.test(file.name || '');
  return IMAGE_EXT.test(file.name || '');
}

/* ------------------------------------------------------------------ geometry */

const PAGE_SIZES: Record<string, [number, number]> = {
  A0: [2383.94, 3370.39],
  A1: [1683.78, 2383.94],
  A2: [1190.55, 1683.78],
  A3: [841.89, 1190.55],
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  A6: [297.64, 419.53],
  letter: [612, 792],
  legal: [612, 1008],
  tabloid: [792, 1224],
};

export const PAGE_SIZE_OPTIONS = Object.keys(PAGE_SIZES);

export function pageSize(name: string): { width: number; height: number } {
  const [width, height] = PAGE_SIZES[name] ?? PAGE_SIZES.A4;
  return { width, height };
}

/** "#rrggbb" to normalised rgb components. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
