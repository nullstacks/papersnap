/**
 * Preview dialog for a produced file.
 *
 * PDFs and images render inline from an object URL; anything else falls back to
 * a message plus a download action. The URL is revoked on close so repeated
 * previews do not leak memory.
 */
import { useEffect, useState } from 'react';
import { downloadBlob, prettySize } from '@/lib/pdf';
import type { ResultFile } from '@/types';
import { ICONS } from './Icons';

export function PreviewDialog({ result, onClose }: { result: ResultFile; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const isPdf = /\.pdf$/i.test(result.name);
  const isImage = /\.(jpe?g|png|webp|gif)$/i.test(result.name);
  const previewable = isPdf || isImage;

  useEffect(() => {
    if (!previewable) return;
    const objectUrl = URL.createObjectURL(result.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [result, previewable]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ext = (result.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'file').toUpperCase();

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Preview"
    >
      <div className="flex max-h-[90vh] w-full max-w-[900px] flex-col overflow-hidden rounded-xl bg-surface shadow-2xl">
        <header className="flex items-center gap-3 border-b border-line-soft px-4 py-3">
          <span className="rounded bg-canvas px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-muted">
            {ext}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink" title={result.name}>
            {result.name}
          </span>
          <span className="shrink-0 text-xs text-muted">{prettySize(result.size)}</span>
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
          {isPdf && url && (
            <iframe src={`${url}#view=FitH`} title={result.name} className="h-[70vh] w-full border-0" />
          )}
          {isImage && url && (
            <img src={url} alt={result.name} className="mx-auto block max-h-[70vh] object-contain" />
          )}
          {!previewable && (
            <div className="flex flex-col items-center gap-3 p-16 text-muted">
              <img src={ICONS.files} alt="" aria-hidden="true" className="h-8 w-8 opacity-50" />
              <p className="text-sm">This file type cannot be previewed here.</p>
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-line-soft px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-canvas"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => downloadBlob(result.blob, result.name)}
            className="rounded-md border-0 bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Download
          </button>
        </footer>
      </div>
    </div>
  );
}
