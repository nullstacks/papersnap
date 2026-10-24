/**
 * The download screen shown once a tool finishes, mirroring the reference's
 * result page: headline, a back button, the primary download button with round
 * secondary actions beside it, a size comparison, the "Continue to…" strip and
 * a privacy notice.
 */
import { Link } from 'react-router-dom';
import { ALL_TOOL_BY_SLUG as TOOL_BY_SLUG } from '@/content/tools';
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

/* ------------- image family, worded like the reference ------------- */
const IMAGE_RESULT_COPY: Record<string, { title: string; action: string }> = {
  'compress-image': { title: 'Your IMAGES have been compressed!', action: 'Download compressed IMAGES' },
  'resize-image': { title: 'Your IMAGES have been resized!', action: 'Download resized IMAGES' },
  'crop-image': { title: 'Your IMAGES have been cropped!', action: 'Download cropped IMAGES' },
  'convert-to-jpg': { title: 'Your IMAGES have been converted to JPG!', action: 'Download JPG IMAGES' },
  'photo-editor': { title: 'Your IMAGE has been edited!', action: 'Download IMAGE' },
  'upscale-image': { title: 'Your images have been upscaled', action: 'Download upscaled IMAGES' },
  'remove-background': { title: 'Your IMAGES have no background!', action: 'Download IMAGES' },
  'meme-generator': { title: 'Your MEME is ready!', action: 'Download MEME' },
  'rotate-image': { title: 'Your IMAGES have been rotated!', action: 'Download rotated IMAGES' },
  'jpg-to-image': { title: 'Your IMAGES have been converted!', action: 'Download IMAGES' },
  'html-to-image': { title: 'Your IMAGE is ready!', action: 'Download IMAGE' },
  'watermark-image': { title: 'Your IMAGES have been watermarked!', action: 'Download watermarked IMAGES' },
  'blur-face': { title: 'Your IMAGES have been blurred!', action: 'Download blurred IMAGES' },
};

/**
 * Tools where a before/after size comparison is meaningless.
 *
 * A meme, a watermark or a blurred photo is not an optimisation: reporting that
 * the output is "19% larger" would be true and entirely unhelpful, so those
 * results go straight from the download button to the next-step card.
 */
const NO_SIZE_STATS = new Set([
  'meme-generator',
  'watermark-image',
  'blur-face',
  'photo-editor',
  'remove-background',
  'html-to-image',
  'sign-pdf',
  'page-numbers',
]);

/** "Continue to..." suggestions per tool, in the reference's own order. */
const CONTINUE_BY_TOOL: Record<string, Array<[string, string]>> = {
  'compress-image': [
    ['resize-image', 'Resize IMAGE'],
    ['rotate-image', 'Rotate IMAGE'],
    ['watermark-image', 'Watermark IMAGE'],
  ],
  'resize-image': [
    ['compress-image', 'Compress IMAGE'],
    ['crop-image', 'Crop IMAGE'],
    ['rotate-image', 'Rotate IMAGE'],
    ['jpg-to-image', 'Convert from JPG'],
    ['watermark-image', 'Watermark IMAGE'],
  ],
  'upscale-image': [
    ['resize-image', 'Resize IMAGE'],
    ['crop-image', 'Crop IMAGE'],
    ['compress-image', 'Compress IMAGE'],
    ['watermark-image', 'Watermark IMAGE'],
  ],
  'watermark-image': [
    ['compress-image', 'Compress IMAGE'],
    ['resize-image', 'Resize IMAGE'],
    ['rotate-image', 'Rotate IMAGE'],
  ],
  'blur-face': [
    ['crop-image', 'Crop IMAGE'],
    ['compress-image', 'Compress IMAGE'],
    ['watermark-image', 'Watermark IMAGE'],
  ],
  'remove-background': [
    ['crop-image', 'Crop IMAGE'],
    ['resize-image', 'Resize IMAGE'],
    ['compress-image', 'Compress IMAGE'],
  ],
  'meme-generator': [
    ['crop-image', 'Crop IMAGE'],
    ['resize-image', 'Resize IMAGE'],
    ['compress-image', 'Compress IMAGE'],
  ],
  'photo-editor': [
    ['compress-image', 'Compress IMAGE'],
    ['resize-image', 'Resize IMAGE'],
    ['crop-image', 'Crop IMAGE'],
  ],
  'jpg-to-image': [
    ['compress-image', 'Compress IMAGE'],
    ['resize-image', 'Resize IMAGE'],
    ['convert-to-jpg', 'Convert to JPG'],
  ],
  'html-to-image': [
    ['compress-image', 'Compress IMAGE'],
    ['resize-image', 'Resize IMAGE'],
    ['crop-image', 'Crop IMAGE'],
  ],
  'rotate-image': [
    ['crop-image', 'Crop IMAGE'],
    ['resize-image', 'Resize IMAGE'],
    ['compress-image', 'Compress IMAGE'],
  ],
  'convert-to-jpg': [
    ['compress-image', 'Compress IMAGE'],
    ['resize-image', 'Resize IMAGE'],
    ['rotate-image', 'Rotate IMAGE'],
  ],
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
  /** Image tools paint the download CTA blue and show the size ring. */
  family?: 'pdf' | 'image';
  results: ResultFile[];
  inputBytes: number;
  onDownloadOne: (result: ResultFile) => void;
  onDownloadAll: () => void;
  /** Return to the files, keeping them queued and the options intact. */
  onBack: () => void;
  /**
   * Throw everything away and start again at the upload screen.
   *
   * Distinct from onBack on purpose: the reference's round "start over" button
   * clears the workspace, while the arrow beside the download keeps the files so
   * a visitor can tweak a setting and re-run without re-uploading.
   */
  onStartOver: () => void;
  onPreview: (result: ResultFile) => void;
}

export function ResultPage({
  slug,
  family = 'pdf',
  results,
  inputBytes,
  onDownloadOne,
  onDownloadAll,
  onBack,
  onStartOver,
  onPreview,
}: Props) {
  const copy = RESULT_COPY[slug] ??
    IMAGE_RESULT_COPY[slug] ??
    { title: 'Your file is ready!', action: 'Download' };
  const continueList = CONTINUE_BY_TOOL[slug] ?? CONTINUE;
  const primaryBg = family === 'image' ? 'bg-img hover:bg-img-dark' : 'bg-brand hover:bg-brand-dark';
  const primary = results.length === 1 ? results[0] : null;
  const outputBytes = results.reduce((sum, r) => sum + r.size, 0);

  return (
    <div className="mx-auto w-full max-w-[780px] px-4 pb-16 text-center sm:px-6">
      <h1 className="mt-2 mb-6 text-[22px] leading-[30px] font-semibold text-ink-2 sm:text-[28px]">
        {copy.title}
      </h1>

      {/* The row must be free to grow: a fixed-width button wrapped the longer
          labels ("Download merged PDF") onto two lines. */}
      <div className="mb-6 flex w-full flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={onBack}
          title="Back to files"
          aria-label="Back to files"
          className="order-2 flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border-0 bg-[#47474f] text-white shadow-btn hover:bg-[#161616] dark:bg-[#3a3a45] dark:hover:bg-[#4a4a58] sm:order-1"
        >
          <img src={ICONS.arrowLeft} alt="" aria-hidden="true" className="h-[18px] w-[18px] invert" />
        </button>

        <button
          type="button"
          onClick={primary ? () => onDownloadOne(primary) : onDownloadAll}
          /* nowrap from tablet up keeps the label on one line; on a phone the
             button is full width, which the shorter line still fits. */
          className={`order-1 inline-flex min-h-[56px] w-full max-w-[360px] items-center justify-center gap-3 rounded-xl border-0 px-6 py-4 text-[18px] leading-6 font-medium whitespace-nowrap text-white shadow-btn transition-colors sm:order-2 sm:w-auto sm:max-w-none sm:px-10 sm:py-6 sm:text-[24px] sm:leading-7 ${primaryBg}`}
        >
          <img src={ICONS.download} alt="" aria-hidden="true" className="h-[22px] w-[22px] shrink-0" />
          {copy.action}
        </button>

        <div className="order-3 flex flex-row gap-2 sm:flex-col">
          {/* A run that produced several files gets an explicit download-all:
              the primary button already does it, but on a split or an extract
              the visitor is looking at a list of files, and a second obvious
              affordance beside it removes any doubt about what that button
              will hand them. */}
          {results.length > 1 && (
            <button
              type="button"
              onClick={onDownloadAll}
              title={`Download all ${results.length} files`}
              aria-label={`Download all ${results.length} files`}
              className={`flex h-9 w-9 items-center justify-center rounded-full border-0 text-white shadow-btn ${primaryBg}`}
            >
              <img src={ICONS.download} alt="" aria-hidden="true" className="h-[18px] w-[18px] invert" />
            </button>
          )}
          <button
            type="button"
            onClick={() => primary && onPreview(primary)}
            disabled={!primary}
            title="Preview"
            aria-label="Preview"
            className={`flex h-9 w-9 items-center justify-center rounded-full border-0 text-white shadow-btn disabled:opacity-45 ${primaryBg}`}
          >
            <img src={ICONS.eye} alt="" aria-hidden="true" className="h-[18px] w-[18px] invert" />
          </button>
          <button
            type="button"
            onClick={onStartOver}
            title="Start over"
            aria-label="Start over"
            className={`flex h-9 w-9 items-center justify-center rounded-full border-0 text-white shadow-btn ${primaryBg}`}
          >
            <img src={ICONS.rotateLeft} alt="" aria-hidden="true" className="h-[18px] w-[18px] invert" />
          </button>
        </div>
      </div>

      {!NO_SIZE_STATS.has(slug) && (
        <SizeStats inputBytes={inputBytes} outputBytes={outputBytes} family={family} />
      )}

      {results.length > 1 && (
        <div className="mx-auto mb-2 max-w-[620px] text-left">
          <div className="mb-1 flex items-center justify-between gap-3 px-1">
            <span className="text-[13px] font-medium text-muted">
              {results.length} files ready
            </span>
            <button
              type="button"
              onClick={onDownloadAll}
              className={`rounded-md border-0 px-3 py-1.5 text-[13px] font-semibold text-white ${primaryBg}`}
            >
              Download all
            </button>
          </div>
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
                className={`shrink-0 rounded-md border-0 px-3 py-1.5 text-sm font-semibold text-white ${primaryBg}`}
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
        <h2 className="mb-4 text-[20px] leading-7 font-semibold text-ink-2">Continue to...</h2>
        {/* One column on a phone, three from desktop up. */}
        <ul className="m-0 grid list-none grid-cols-1 gap-x-6 gap-y-1 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {continueList.filter(([s]) => s !== slug).map(([s, label]) => {
            const tool = TOOL_BY_SLUG[s];
            /* A hidden tool must not be suggested either. */
            if (!tool || tool.hidden) return null;
            return (
              <li key={s} className="min-w-0">
                <Link
                  to={`/${s}`}
                  className={`flex items-center gap-3 rounded-lg px-1 py-2 text-sm text-ink-2 no-underline hover:underline ${family === 'image' ? 'hover:text-img' : 'hover:text-brand'}`}
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

/**
 * Before/after comparison.
 *
 * Image tools get the reference's ring gauge and a plain "before ➜ after" line;
 * PDF tools keep the compact chip strip. The ring is a conic gradient, which
 * needs no SVG and stays crisp at any size.
 */
function SizeStats({
  inputBytes,
  outputBytes,
  family = 'pdf',
}: {
  inputBytes: number;
  outputBytes: number;
  family?: 'pdf' | 'image';
}) {
  if (!inputBytes || !outputBytes) return null;

  if (family === 'image') return <ImageSizeRing inputBytes={inputBytes} outputBytes={outputBytes} />;

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
/** The ring gauge the image result page shows next to the saved percentage. */
function ImageSizeRing({ inputBytes, outputBytes }: { inputBytes: number; outputBytes: number }) {
  const ratio = outputBytes / inputBytes;
  const saved = Math.round(Math.abs(1 - ratio) * 100);
  const smaller = outputBytes <= inputBytes;
  const ring = Math.max(0, Math.min(360, (saved / 100) * 360));
  const tone = smaller ? 'var(--color-img)' : 'var(--color-brand)';
  const word = smaller ? 'smaller' : 'larger';

  return (
    <div className="mx-auto mb-5 flex w-full max-w-[560px] flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
      <div
        className="relative grid h-[100px] w-[100px] shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(${tone} ${ring}deg, #e6e6ee ${ring}deg)` }}
        role="img"
        aria-label={`${saved}% ${word}`}
      >
        <div className="grid h-[80px] w-[80px] place-items-center rounded-full bg-surface text-center leading-none">
          <div>
            <div className="text-[20px] leading-none font-semibold text-ink-2">{saved}%</div>
            <div className="mt-1 text-[9px] font-medium tracking-[0.06em] text-muted uppercase">{word}</div>
          </div>
        </div>
      </div>
      <div className="text-center sm:text-left">
        <p className="text-[17px] leading-6 font-semibold text-ink-2">
          Your images are now {saved}% {word}!
        </p>
        <p className="mt-1 text-[16px] leading-6 text-body">
          {prettySize(inputBytes)} <span className="text-muted">➜</span> {prettySize(outputBytes)}
        </p>
      </div>
    </div>
  );
}