/**
 * The download screen shown once a tool finishes, mirroring the reference's
 * result page: headline, a back button, the primary download button with round
 * secondary actions beside it, a size comparison, the "Continue to…" strip and
 * a privacy notice.
 */
import { Link } from 'react-router-dom';
import { TOOL_BY_SLUG } from '@/content/tools';
import { prettySize } from '@/lib/pdf';
import type { ResultFile } from '@/types';
import { ICONS } from './Icons';

/** Headline + button copy per tool, worded like the reference download page. */
const RESULT_COPY: Record<string, { title: string; action: string }> = {
  'merge-pdf': { title: 'PDFs have been merged!', action: 'Download merged PDF' },
  'split-pdf': { title: 'PDFs have been split!', action: 'Download split PDFs' },
  'remove-pages': { title: 'Pages have been removed!', action: 'Download PDF' },
  'extract-pages': { title: 'Pages have been extracted!', action: 'Download extracted PDFs' },
  'compress-pdf': { title: 'PDFs have been compressed!', action: 'Download compressed PDF' },
  'repair-pdf': { title: 'PDFs have been repaired!', action: 'Download repaired PDF' },
  'unlock-pdf': { title: 'PDFs have been unlocked!', action: 'Download unlocked PDF' },
  'protect-pdf': { title: 'PDFs have been protected!', action: 'Download protected PDF' },
  'sign-pdf': { title: 'PDFs have been signed!', action: 'Download signed PDF' },
  'rotate-pdf': { title: 'PDFs have been rotated!', action: 'Download rotated PDF' },
  'page-numbers': { title: 'Page numbers have been added!', action: 'Download PDF' },
  'watermark-pdf': { title: 'Watermark has been added!', action: 'Download PDF' },
  'crop-pdf': { title: 'PDFs have been cropped!', action: 'Download cropped PDF' },
  'jpg-to-pdf': { title: 'Images have been converted!', action: 'Download PDF' },
  'pdf-to-jpg': { title: 'PDFs have been converted!', action: 'Download JPGs' },
  'word-to-pdf': { title: 'Documents have been converted!', action: 'Download PDF' },
  'pdf-to-word': { title: 'PDFs have been converted!', action: 'Download Word files' },
  'powerpoint-to-pdf': { title: 'Slides have been converted!', action: 'Download PDF' },
  'pdf-to-powerpoint': { title: 'PDFs have been converted!', action: 'Download slides' },
  'excel-to-pdf': { title: 'Sheets have been converted!', action: 'Download PDF' },
  'pdf-to-excel': { title: 'PDFs have been converted!', action: 'Download Excel files' },
  'html-to-pdf': { title: 'Your PDF is ready!', action: 'Download PDF' },
  'convert-pdf-to-pdfa': { title: 'PDFs have been converted!', action: 'Download PDF/A' },
};

/** The six tools offered in the "Continue to…" strip. */
const CONTINUE: Array<[string, string]> = [
  ['merge-pdf', 'Merge PDF'],
  ['split-pdf', 'Split PDF'],
  ['compress-pdf', 'Compress PDF'],
  ['page-numbers', 'Add page numbers'],
  ['watermark-pdf', 'Add watermark'],
  ['protect-pdf', 'Protect PDF'],
];

interface Props {
  slug: string;
  results: ResultFile[];
  inputBytes: number;
  onDownloadOne: (result: ResultFile) => void;
  onDownloadAll: () => void;
  onBack: () => void;
  onPreview: (result: ResultFile) => void;
}

export function ResultPage({
  slug,
  results,
  inputBytes,
  onDownloadOne,
  onDownloadAll,
  onBack,
  onPreview,
}: Props) {
  const copy = RESULT_COPY[slug] ?? { title: 'Your file is ready!', action: 'Download' };
  const primary = results.length === 1 ? results[0] : null;
  const outputBytes = results.reduce((sum, r) => sum + r.size, 0);

  return (
    <div className="mx-auto w-full max-w-[780px] px-4 pb-16 text-center sm:px-6">
      <h1 className="mt-2 mb-6 text-[22px] leading-[30px] font-semibold text-ink-2 sm:text-[28px]">
        {copy.title}
      </h1>

      <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onBack}
          title="Back to files"
          aria-label="Back to files"
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border-0 bg-[#47474f] text-white shadow-btn hover:bg-[#161616] dark:bg-[#3a3a45] dark:hover:bg-[#4a4a58]"
        >
          <img src={ICONS.arrowLeft} alt="" aria-hidden="true" className="h-[18px] w-[18px] invert" />
        </button>

        <button
          type="button"
          onClick={primary ? () => onDownloadOne(primary) : onDownloadAll}
          /* nowrap keeps the label on one line from tablet up; on a phone the
             button is full width so the shorter text still fits. */
          className="inline-flex min-h-[56px] w-full max-w-[330px] items-center justify-center gap-3 rounded-xl border-0 bg-brand px-6 py-4 text-[18px] leading-6 font-medium whitespace-nowrap text-white shadow-btn transition-colors hover:bg-brand-dark sm:w-auto sm:max-w-none sm:px-10 sm:py-6 sm:text-[24px] sm:leading-7"
          style={{ minWidth: 0 }}
        >
          <img src={ICONS.download} alt="" aria-hidden="true" className="h-[22px] w-[22px] shrink-0" />
          {copy.action}
        </button>

        <div className="flex flex-row gap-2 sm:flex-col">
          <button
            type="button"
            onClick={() => primary && onPreview(primary)}
            disabled={!primary}
            title="Preview"
            aria-label="Preview"
            className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-brand text-white shadow-btn hover:bg-brand-dark disabled:opacity-45"
          >
            <img src={ICONS.eye} alt="" aria-hidden="true" className="h-[18px] w-[18px] invert" />
          </button>
          <button
            type="button"
            onClick={onBack}
            title="Start over"
            aria-label="Start over"
            className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-brand text-white shadow-btn hover:bg-brand-dark"
          >
            <img src={ICONS.rotateLeft} alt="" aria-hidden="true" className="h-[18px] w-[18px] invert" />
          </button>
        </div>
      </div>

      <SizeStats inputBytes={inputBytes} outputBytes={outputBytes} />

      {results.length > 1 && (
        <div className="mx-auto mb-2 max-w-[620px] text-left">
          {results.map((r, i) => (
            <div
              key={`${r.name}-${i}`}
              className="mt-2 flex items-center gap-3 rounded-lg border border-line-soft bg-surface px-3.5 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink" title={r.name}>
                {r.name}
              </span>
              <span className="shrink-0 text-xs text-muted">{prettySize(r.size)}</span>
              <button
                type="button"
                onClick={() => onDownloadOne(r)}
                className="shrink-0 rounded-md border-0 bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Download
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-5 text-sm text-muted">
        Everything was processed locally in this tab — nothing was uploaded.
      </p>

      <div className="mx-auto mt-8 max-w-[780px] rounded-lg bg-surface p-4 text-left shadow-card sm:p-6">
        <h2 className="mb-4 text-[16px] leading-6 font-semibold text-ink-2">Continue to…</h2>
        {/* One column on a phone, three from desktop up. */}
        <ul className="m-0 grid list-none grid-cols-1 gap-x-6 gap-y-1 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {CONTINUE.filter(([s]) => s !== slug).map(([s, label]) => {
            const tool = TOOL_BY_SLUG[s];
            if (!tool) return null;
            return (
              <li key={s} className="min-w-0">
                <Link
                  to={`/${s}`}
                  className="flex items-center gap-3 rounded-lg px-1 py-2 text-sm text-ink-2 no-underline hover:text-brand hover:underline"
                >
                  <img src={tool.icon} alt="" aria-hidden="true" className="h-7 w-7 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <img src={ICONS.chevronRight} alt="" aria-hidden="true" className="h-4 w-4 shrink-0 opacity-50" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mx-auto mt-4 flex max-w-[780px] items-start gap-3 rounded-lg border border-[#9ecdf5] bg-[#f5fbff] px-4 py-3 text-left text-sm leading-5 text-ink-2 dark:border-info-line dark:bg-info-bg">
        <img src={ICONS.infoDoc} alt="" aria-hidden="true" className="mt-0.5 h-[22px] w-[22px] shrink-0" />
        <span>
          Files are never uploaded. Install this site to keep the whole toolkit on your device.{' '}
          <Link to="/" className="text-ink underline">
            Browse all tools
          </Link>
        </span>
      </div>
    </div>
  );
}

/** Before/after size comparison strip. */
function SizeStats({ inputBytes, outputBytes }: { inputBytes: number; outputBytes: number }) {
  if (!inputBytes || !outputBytes) return null;

  const ratio = outputBytes / inputBytes;
  const pct = Math.round(Math.abs(1 - ratio) * 100);
  const smaller = outputBytes < inputBytes;
  const same = pct < 1;

  const label = same ? 'Same size as the original' : `${pct}% ${smaller ? 'smaller' : 'larger'}`;
  const tone = same
    ? 'bg-canvas text-muted'
    : smaller
      ? 'bg-[#e6f9ef] text-success-dark'
      : 'bg-brand-soft text-brand';

  return (
    <div className="mx-auto mb-5 flex w-full max-w-[520px] items-center justify-center gap-4 rounded-lg bg-surface px-5 py-4 shadow-card">
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[11px] tracking-[0.04em] text-muted uppercase">Before</span>
        <span className="text-lg font-semibold text-ink">{prettySize(inputBytes)}</span>
      </div>
      <img src={ICONS.arrowRight} alt="" aria-hidden="true" className="h-[18px] w-[18px] opacity-40" />
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[11px] tracking-[0.04em] text-muted uppercase">After</span>
        <span className="text-lg font-semibold text-ink">{prettySize(outputBytes)}</span>
      </div>
      <span className={`rounded-full px-2.5 py-[3px] text-[13px] font-semibold ${tone}`}>{label}</span>
    </div>
  );
}
