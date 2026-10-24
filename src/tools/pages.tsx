/*
 * Page-set tools: removing pages and extracting pages into a new document.
 *
 * Remove pages offers two ways to pick the pages that go — a thumbnail grid
 * rendered with pdf.js, and a typed range expression — and the two sources are
 * combined, exactly as the v1 tool did.
 */
import { useEffect, useRef, useState } from 'react';
import {
  PDFDocument,
  baseName,
  bytesFor,
  loadForView,
  loadPdf,
  parseRanges,
  pdfResult,
} from '@/lib/pdf';
import type { PanelProps, ResultFile, ToolImpl, WorkFile } from '@/types';

const INPUT =
  'h-8 w-full rounded border border-muted bg-surface px-3 text-sm text-ink focus:outline-none focus:border-ink';

function str(value: string | boolean | null): string {
  return typeof value === 'string' ? value : '';
}

/** Parse a range expression, returning [] instead of throwing on bad input. */
function rangeList(text: string, pageCount: number): number[] {
  const raw = text.trim();
  if (!raw) return [];
  try {
    return parseRanges(raw, pageCount);
  } catch {
    return [];
  }
}

/** Zero-based indexes stored as a comma-separated list of one-based numbers. */
function parseIndexList(value: string): number[] {
  return value
    .split(',')
    .map((part) => parseInt(part, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => n - 1);
}

/* ============================= REMOVE PAGES ============================= */

interface Thumb {
  /** One-based page number. */
  page: number;
  url: string;
}

const THUMB_MAX_W = 76;
const THUMB_MAX_H = 100;

function RemovePanel({ files, values, setValue }: PanelProps) {
  const file: WorkFile | undefined = files[0];
  const fileId = file ? file.id : -1;
  /* The parent may hand us a fresh object on every render, so the effect keys
   * off the stable id and reads the latest file through a ref. */
  const latest = useRef(file);
  latest.current = file;
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');

  /* Re-render the strip whenever the first file changes. The `alive` flag
   * drops results that arrive after the file was swapped or the panel closed. */
  useEffect(() => {
    setThumbs([]);
    const target = latest.current;
    if (!target) {
      setState('idle');
      return;
    }

    let alive = true;
    setState('loading');

    void (async () => {
      let doc: Awaited<ReturnType<typeof loadForView>> | null = null;
      try {
        const bytes = await bytesFor(target);
        doc = await loadForView(bytes.slice());
        const rendered: Thumb[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          if (!alive) return;
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(THUMB_MAX_W / base.width, THUMB_MAX_H / base.height);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(viewport.width));
          canvas.height = Math.max(1, Math.round(viewport.height));
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          rendered.push({ page: i, url: canvas.toDataURL('image/png') });
        }
        if (!alive) return;
        setThumbs(rendered);
        setState('ready');
      } catch {
        if (alive) setState('error');
      } finally {
        void doc?.destroy();
      }
    })();

    return () => {
      alive = false;
    };
  }, [fileId]);

  const removed = new Set(parseIndexList(str(values.removeTiles)));
  const total = thumbs.length || file?.pages || 0;
  /* Typed ranges count as removals too, so the summary reflects both inputs. */
  const typed = rangeList(str(values.removePages), total || 1);
  const dropCount = new Set([...removed, ...typed]).size;

  const toggle = (page: number) => {
    const next = new Set(removed);
    if (next.has(page - 1)) next.delete(page - 1);
    else next.add(page - 1);
    setValue('removeTiles', [...next].sort((a, b) => a - b).map((n) => n + 1).join(','));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="info-box">
        Type the pages to delete, or click a page below to toggle it off.
      </div>

      <div className="flex flex-col gap-2">
        <label className="option-title" htmlFor="remove-pages">
          Pages to remove
        </label>
        <input
          id="remove-pages"
          className={INPUT}
          placeholder="e.g. 3-4,8"
          value={str(values.removePages)}
          onChange={(event) => setValue('removePages', event.target.value)}
        />
      </div>

      {state === 'loading' && (
        <p className="text-sm leading-[18px] text-muted">Rendering pages…</p>
      )}
      {state === 'error' && (
        <p className="text-sm leading-[18px] text-muted">Could not read this PDF.</p>
      )}

      {thumbs.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {thumbs.map((thumb) => {
            const off = removed.has(thumb.page - 1);
            return (
              <button
                key={thumb.page}
                type="button"
                onClick={() => toggle(thumb.page)}
                aria-pressed={off}
                title={off ? `Keep page ${thumb.page}` : `Remove page ${thumb.page}`}
                className={`relative overflow-hidden rounded border p-1 ${
                  off ? 'border-warn bg-subtle' : 'border-line bg-surface'
                }`}
              >
                <img
                  src={thumb.url}
                  alt={`Page ${thumb.page}`}
                  className={`mx-auto block max-h-[100px] w-auto ${off ? 'opacity-40' : ''}`}
                />
                <span className="mt-1 block text-center text-filetile text-muted">
                  {thumb.page}
                </span>
                {off && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded bg-warn px-1.5 py-0.5 text-[11px] font-medium text-white">
                      Removed
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <p className="text-sm leading-[18px] text-muted">
        {!total
          ? ''
          : dropCount
            ? `${dropCount} of ${total} pages will be removed, leaving ${total - dropCount}.`
            : `All ${total} pages are kept.`}
      </p>
    </div>
  );
}

export const removePagesTool: ToolImpl = {
  Panel: RemovePanel,

  async run({ files, values, setProgress, setStatus }) {
    const text = str(values.removePages).trim();
    const tiles = parseIndexList(str(values.removeTiles));
    const results: ResultFile[] = [];

    for (const file of files) {
      setStatus(`Removing pages from ${file.name}…`);
      const src = await loadPdf(await bytesFor(file));
      const count = src.getPageCount();
      const drop = new Set(rangeList(text, count));
      /* The grid only ever describes the first document, so clamp its indexes
       * to the document being written rather than trust them blindly. */
      for (const index of tiles) if (index < count) drop.add(index);
      if (!drop.size) throw new Error('Choose the pages to remove first.');

      const keep: number[] = [];
      for (let i = 0; i < count; i++) if (!drop.has(i)) keep.push(i);
      if (!keep.length) throw new Error('Every page would be removed — keep at least one.');

      const out = await PDFDocument.create();
      const copies = await out.copyPages(src, keep);
      for (const page of copies) out.addPage(page);
      results.push(pdfResult(await out.save(), `${baseName(file.name)}_pages_removed.pdf`));
      setProgress((results.length / files.length) * 100);
    }

    return results;
  },
};

/* ============================ EXTRACT PAGES ============================ */

function ExtractPanel({ files, values, setValue }: PanelProps) {
  const file = files[0];
  const pages = file?.pages ?? null;
  const text = str(values.extractPages).trim();
  const picked = file && pages ? rangeList(text, pages) : [];

  let note = '';
  if (!file) note = 'Add a PDF to continue.';
  else if (pages) {
    note = picked.length
      ? `${picked.length} of ${pages} pages will be copied into the new file.`
      : `This document has ${pages} pages. Enter a range to pick them.`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="info-box">Build a new PDF that only contains the pages you list.</div>

      <div className="flex flex-col gap-2">
        <label className="option-title" htmlFor="extract-pages">
          Pages to extract
        </label>
        <input
          id="extract-pages"
          className={INPUT}
          placeholder="e.g. 1-3,7"
          value={str(values.extractPages)}
          onChange={(event) => setValue('extractPages', event.target.value)}
        />
      </div>

      <p className="text-sm leading-[18px] text-muted">{note}</p>
    </div>
  );
}

export const extractPagesTool: ToolImpl = {
  Panel: ExtractPanel,

  async run({ files, values, setProgress, setStatus }) {
    const text = str(values.extractPages).trim();
    if (!text) throw new Error('Enter the pages to extract, for example 1-3,7.');

    const results: ResultFile[] = [];
    for (const file of files) {
      setStatus(`Extracting pages from ${file.name}…`);
      const src = await loadPdf(await bytesFor(file));
      const picked = rangeList(text, src.getPageCount());
      if (!picked.length) throw new Error('That page range does not match any page.');

      const out = await PDFDocument.create();
      const copies = await out.copyPages(src, picked);
      for (const page of copies) out.addPage(page);
      results.push(pdfResult(await out.save(), `${baseName(file.name)}_extracted.pdf`));
      setProgress((results.length / files.length) * 100);
    }

    return results;
  },
};
