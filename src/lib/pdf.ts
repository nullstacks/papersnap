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

/**
 * Load a document and prove it was really decrypted.
 *
 * `ignoreEncryption: true` makes a *wrong* password succeed silently — the
 * document loads and keeps its /Encrypt dictionary rather than throwing. Tools
 * that must reject a bad password therefore load without that flag, so pdf-lib
 * surfaces its "Password incorrect" error.
 */
export async function loadPdfStrict(bytes: Uint8Array, password?: string) {
  return PDFDocument.load(bytes, {
    updateMetadata: false,
    ...(password ? { password } : {}),
  });
}

/**
 * Load a document for an EDITING tool.
 *
 * `loadPdf` deliberately tolerates encryption so a file card can still show the
 * page count of a protected document. Tools must not: pdf-lib cannot decrypt
 * for them, so an encrypted input copies through as blank pages and the visitor
 * gets a silently corrupted result with no error. This wrapper turns that into
 * a message they can act on.
 */
export async function loadToolPdf(bytes: Uint8Array, name: string) {
  const doc = await loadPdf(bytes);
  if (doc.isEncrypted) {
    throw new Error(
      `"${name}" is password protected. Unlock it first, then run this tool on the unlocked copy.`,
    );
  }
  return doc;
}

/** Open a document for rendering (pdf.js). */
export async function loadForView(bytes: Uint8Array) {
  return pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true })
    .promise;
}

/* ------------------------------------------------------------------ helpers */

/* Pure helpers live in ./format so a component can format a byte count without
 * dragging the whole PDF engine onto the critical path. Re-exported here so the
 * 20-odd tool modules keep their single import site. */
export {
  baseName,
  downloadBlob,
  hexToRgb,
  isImage,
  isPdf,
  nextFrame,
  PAGE_SIZE_OPTIONS,
  pageSize,
  prettySize,
} from './format';

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

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}

/** Build a ResultFile from raw PDF bytes. */
export function pdfResult(bytes: Uint8Array, name: string): ResultFile {
  return { name, blob: pdfBlob(bytes), size: bytes.length };
}


/* Page-range parsing lives in ./ranges: pure string work that has no business
 * importing the PDF engine, and now testable on its own. */
export { parseRangeGroups, parseRanges } from './ranges';

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