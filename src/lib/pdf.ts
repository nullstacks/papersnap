/**
 * PDF engine: the only module that touches pdf-lib and pdf.js directly.
 *
 * Everything runs in the browser tab — bytes come straight from the visitor's
 * File objects and results go back as Blobs. Nothing is uploaded.
 *
 * pdf-lib does structural work (merge, split, rotate, crop, encrypt, metadata);
 * pdf.js does rendering and text extraction.
 */
import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  PDFName,
  type PDFPage,
} from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ResultFile, WorkFile } from '@/types';

/* The worker is emitted by Vite next to the bundle, so its URL already honours
 * whatever base path the site is deployed under (e.g. /repo/ on Pages). */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { PDFDocument, StandardFonts, degrees, rgb, PDFName, pdfjs };
export type { PDFPage };

/* ------------------------------------------------------------------ loading */

/**
 * Load bytes into a pdf-lib document.
 *
 * `ignoreEncryption` lets us open password-protected files far enough to read
 * their page structure; passing `password` actually decrypts them.
 */
export async function loadPdf(bytes: Uint8Array, password?: string) {
  return PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
    ...(password ? { password } : {}),
  });
}

/** Open a document for rendering (pdf.js). */
export async function loadForView(bytes: Uint8Array) {
  return pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true })
    .promise;
}

/* ------------------------------------------------------------------ helpers */

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
}

export function isImage(file: File): boolean {
  return /^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name || '');
}

export async function fileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** Bytes for a work file, reusing the cache written when the cover rendered. */
export async function bytesFor(f: WorkFile): Promise<Uint8Array> {
  if (f.bytes) return f.bytes;
  const bytes = await fileBytes(f.file);
  f.bytes = bytes;
  return bytes;
}

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

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}

/** Build a ResultFile from raw PDF bytes. */
export function pdfResult(bytes: Uint8Array, name: string): ResultFile {
  return { name, blob: pdfBlob(bytes), size: bytes.length };
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

/* ---------------------------------------------------------- page geometry */

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

/* ------------------------------------------------------------ page ranges */

/**
 * Parse a range expression like "1-3,5,8-10" into zero-based page indexes.
 * Out-of-range pages are ignored; an empty expression means every page.
 */
export function parseRanges(expr: string, pageCount: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const add = (n: number) => {
    if (n >= 1 && n <= pageCount && !seen.has(n - 1)) {
      seen.add(n - 1);
      out.push(n - 1);
    }
  };

  const text = String(expr ?? '').trim();
  if (!text) return Array.from({ length: pageCount }, (_, i) => i);

  for (const chunk of text.split(',')) {
    const part = chunk.trim();
    if (!part) continue;

    const span = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (span) {
      const a = Math.min(+span[1], +span[2]);
      const b = Math.max(+span[1], +span[2]);
      for (let n = a; n <= b; n++) add(n);
      continue;
    }
    const single = part.match(/^(\d+)$/);
    if (single) {
      add(+single[1]);
      continue;
    }
    /* "3-" means page 3 to the end; "-4" means 1 through 4. */
    const open = part.match(/^(\d+)\s*-$/);
    if (open) {
      for (let n = +open[1]; n <= pageCount; n++) add(n);
      continue;
    }
    const openStart = part.match(/^-\s*(\d+)$/);
    if (openStart) {
      for (let n = 1; n <= +openStart[1]; n++) add(n);
    }
  }

  if (!out.length) throw new Error('That page range does not match any page.');
  return out;
}

/** Group a range expression into independent chunks, as the split tool needs. */
export function parseRangeGroups(expr: string, pageCount: number): number[][] {
  const text = String(expr ?? '').trim();
  if (!text) return [Array.from({ length: pageCount }, (_, i) => i)];

  const groups: number[][] = [];
  for (const chunk of text.split(',')) {
    const part = chunk.trim();
    if (!part) continue;
    groups.push(parseRanges(part, pageCount));
  }
  return groups.length ? groups : [Array.from({ length: pageCount }, (_, i) => i)];
}

/* ------------------------------------------------------------------ colour */

/** "#rrggbb" to pdf-lib's normalised rgb(). */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

/* ------------------------------------------------------------------ covers */

/**
 * Render page 1 of a PDF as a data URL, sized to the reference file card
 * (127x180). Returns null when the document cannot be rendered.
 */
export async function renderCover(bytes: Uint8Array): Promise<string | null> {
  const doc = await loadForView(bytes.slice());
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(127 / base.width, 180 / base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    /* pdf.js infers the target canvas from canvasContext; passing `canvas`
       explicitly is rejected by the installed RenderParameters type. */
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/png');
  } finally {
    void doc.destroy();
  }
}

/** Render an image file to a card-sized cover. */
export async function renderImageCover(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image decode failed'));
      el.src = url;
    });
    const scale = Math.min(127 / img.naturalWidth, 180 / img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* --------------------------------------------------------------- encryption */

/**
 * Rebuild a document page by page, which re-serialises every object without
 * an /Encrypt dictionary. Used by Unlock when pdf-lib cannot decrypt directly.
 */
export async function rebuildWithoutEncryption(
  bytes: Uint8Array,
  password?: string,
): Promise<Uint8Array> {
  const src = await loadPdf(bytes, password);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, src.getPageIndices());
  for (const p of pages) out.addPage(p);
  return out.save();
}
