/**
 * Page thumbnail grid for the main work area.
 *
 * This is the reference's page-picking surface: every page of the document is
 * rendered as a thumbnail, clicking toggles it, and the current selection is
 * reflected with a tick badge (kept) or a red cross (dropped). It lives in the
 * work area rather than the sidebar because a 300px column cannot show pages
 * legibly.
 *
 * Rendering is incremental — one page at a time into its own data URL — so a
 * long document shows its first pages immediately instead of blocking.
 */
import { useEffect, useRef, useState } from 'react';
import { bytesFor, loadForView } from '@/lib/pdf';
import type { WorkFile } from '@/types';

export type PageMode = 'remove' | 'extract';

interface Props {
  file: WorkFile;
  /** Which mode drives the badge styling and the summary copy. */
  mode: PageMode;
  /** Zero-based indexes that are selected. */
  selected: Set<number>;
  onToggle: (index: number, shiftKey: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

/** Thumbnail box, sized so a row of ~5 fits the reference's canvas. */
const THUMB_W = 128;

export function PageGrid({ file, mode, selected, onToggle, onSelectAll, onSelectNone }: Props) {
  const [urls, setUrls] = useState<string[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const fileId = file.id;

  /* The parent re-creates WorkFile objects as covers resolve, so key the effect
     on the stable id and read the newest object through a ref. */
  const latest = useRef(file);
  latest.current = file;

  useEffect(() => {
    let alive = true;
    setUrls([]);
    setState('loading');

    void (async () => {
      let doc: Awaited<ReturnType<typeof loadForView>> | null = null;
      try {
        const bytes = await bytesFor(latest.current);
        doc = await loadForView(bytes.slice());

        /* Publish each page as soon as it is rendered. */
        for (let i = 1; i <= doc.numPages; i++) {
          if (!alive) return;
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(THUMB_W / base.width, (THUMB_W * 4) / 3 / base.height);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(viewport.width));
          canvas.height = Math.max(1, Math.round(viewport.height));
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          /* Always paint white: documents are white paper regardless of theme. */
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          const url = canvas.toDataURL('image/png');
          if (!alive) return;
          setUrls((prev) => {
            const next = prev.slice();
            next[i - 1] = url;
            return next;
          });
        }
        if (alive) setState('ready');
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

  const total = file.pages ?? urls.length;
  const allSelected = total > 0 && selected.size >= total;

  if (state === 'error') {
    return (
      <p className="mt-6 text-center text-sm text-muted">Could not read this PDF.</p>
    );
  }

  return (
    <div className="mt-2 w-full">
      {/* Toolbar: the reference offers bulk selection plus a running count. */}
      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          disabled={allSelected}
          className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-medium text-ink-2 hover:border-muted disabled:opacity-45"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={onSelectNone}
          disabled={selected.size === 0}
          className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-medium text-ink-2 hover:border-muted disabled:opacity-45"
        >
          Clear
        </button>
        <span className="text-[13px] text-muted">
          {mode === 'remove'
            ? `${selected.size} of ${total} marked for removal`
            : `${selected.size} of ${total} selected`}
        </span>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {Array.from({ length: total }, (_, index) => {
          const isSelected = selected.has(index);
          const url = urls[index];
          const dropped = mode === 'remove' && isSelected;
          return (
            <button
              key={index}
              type="button"
              onClick={(e) => onToggle(index, e.shiftKey)}
              aria-pressed={isSelected}
              aria-label={`Page ${index + 1}${isSelected ? ' selected' : ''}`}
              className={`group relative flex w-[128px] shrink-0 flex-col items-center rounded-lg border bg-card p-2 pb-6 shadow-card transition-colors sm:w-[148px] ${
                isSelected ? 'border-brand' : 'border-transparent hover:border-muted'
              }`}
            >
              {url ? (
                <img
                  src={url}
                  alt=""
                  className={`block h-auto w-full bg-white shadow-[0_0_4px_rgba(0,0,0,0.12)] transition-opacity ${
                    dropped ? 'opacity-35' : ''
                  }`}
                />
              ) : (
                <div className="flex aspect-[3/4] w-full items-center justify-center rounded bg-canvas text-[11px] text-muted">
                  {index + 1}
                </div>
              )}

              {/*
               * Selection badge, matching the reference: a green tick for pages
               * being kept/extracted, a red cross for pages being removed.
               */}
              {isSelected && (
                <span
                  aria-hidden="true"
                  className={`absolute top-1.5 left-1.5 flex h-6 w-6 items-center justify-center rounded-full ${
                    dropped ? 'bg-brand' : 'bg-success'
                  }`}
                >
                  {dropped ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
              )}

              <span
                className={`pointer-events-none absolute inset-x-0 bottom-0 py-1 text-center text-[12px] ${
                  isSelected ? 'font-medium text-brand' : 'text-muted'
                }`}
              >
                {`Page ${index + 1}`}
              </span>
            </button>
          );
        })}
      </div>

      {state === 'loading' && (
        <p className="mt-4 text-center text-sm text-muted">Rendering pages…</p>
      )}
    </div>
  );
}

/** Parse the stored comma-separated one-based selection into zero-based keys. */
export function parseSelection(value: string | boolean | null): Set<number> {
  if (typeof value !== 'string' || !value.trim()) return new Set();
  const out = new Set<number>();
  for (const part of value.split(',')) {
    const n = parseInt(part, 10);
    if (Number.isFinite(n) && n > 0) out.add(n - 1);
  }
  return out;
}

/** Serialise a zero-based selection back to the stored one-based list. */
export function serializeSelection(selected: Set<number>): string {
  return [...selected]
    .sort((a, b) => a - b)
    .map((n) => n + 1)
    .join(',');
}
