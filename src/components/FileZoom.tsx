/**
 * Large in-page preview of an already-selected input file.
 *
 * Kept separate from PreviewDialog (which previews a produced result): this one
 * renders the visitor's own File so they can confirm they picked the right
 * document before running a tool.
 */
import { useEffect, useState } from 'react';
import { isImage, isPdf, prettySize } from '@/lib/format';
import type { WorkFile } from '@/types';
import { ICONS } from './Icons';

export function FileZoom({ entry, onClose }: { entry: WorkFile; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pdf = isPdf(entry.file);
  const image = isImage(entry.file);

  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;

    if (image) {
      const objectUrl = URL.createObjectURL(entry.file);
      revoke = objectUrl;
      setUrl(objectUrl);
    } else if (pdf) {
      /* Blob the cached bytes so the browser's PDF viewer can open them. The
       * engine is imported here rather than at module scope: this component
       * renders on the landing page's graph and must not pull pdf-lib in. */
      void import('@/lib/pdf')
        .then(({ bytesFor }) => bytesFor(entry))
        .then((bytes) => {
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(
            new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
          );
          revoke = objectUrl;
          setUrl(objectUrl);
        })
        .catch((err: unknown) =>
          setError(err instanceof Error ? err.message : 'Could not open this file.'),
        );
    }

    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [entry, pdf, image]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ext = (entry.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'file').toUpperCase();

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${entry.name}`}
    >
      <div className="flex max-h-[92vh] w-full max-w-[960px] flex-col overflow-hidden rounded-xl bg-surface shadow-2xl">
        <header className="flex items-center gap-3 border-b border-line-soft px-4 py-3">
          <span className="rounded bg-canvas px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-muted">
            {ext}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink" title={entry.name}>
            {entry.name}
          </span>
          <span className="shrink-0 text-xs text-muted">
            {prettySize(entry.size)}
            {entry.pages ? ` · ${entry.pages} page${entry.pages === 1 ? '' : 's'}` : ''}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-0 bg-canvas hover:bg-subtle"
          >
            <img src={ICONS.close} alt="" aria-hidden="true" className="h-3 w-3" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-canvas">
          {image && url && (
            <img src={url} alt={entry.name} className="mx-auto block max-h-[78vh] object-contain" />
          )}
          {pdf && url && (
            <iframe src={`${url}#view=FitH`} title={entry.name} className="h-[78vh] w-full border-0" />
          )}
          {error && <p className="p-10 text-center text-sm text-muted">{error}</p>}
          {!image && !pdf && !error && (
            <p className="p-10 text-center text-sm text-muted">
              This file type cannot be previewed here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
