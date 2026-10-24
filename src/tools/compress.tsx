/**
 * Compress: rasterise every page at the chosen level's scale/JPEG quality and
 * rebuild the PDF from those images. Same trade-off the online services make —
 * at the strongest setting text becomes an image.
 */
import { PDFDocument, baseName, bytesFor, loadForView, loadPdf, pdfResult } from '@/lib/pdf';
import type { FieldValues, PanelProps, ResultFile, ToolImpl } from '@/types';

/* ------------------------------------------------------------------ levels */

/*
 * `scale` is a pdf.js viewport multiplier rather than a DPI: 1.0 is the page's
 * own size, so the levels double as an effective resolution picker.
 */
const LEVELS = {
  extreme: { scale: 1.0, quality: 0.55 },
  recommended: { scale: 1.6, quality: 0.75 },
  low: { scale: 2.2, quality: 0.9 },
} as const;

type LevelName = keyof typeof LEVELS;

const LEVEL_OPTIONS: Array<{ value: LevelName; title: string; body: string }> = [
  { value: 'extreme', title: 'Extreme compression', body: 'Less quality, high compression' },
  { value: 'recommended', title: 'Recommended compression', body: 'Good quality, good compression' },
  { value: 'low', title: 'Less compression', body: 'High quality, less compression' },
];

function chosenLevel(values: FieldValues): (typeof LEVELS)[LevelName] {
  const raw = values['compress_level'];
  const name = typeof raw === 'string' ? (raw as LevelName) : 'recommended';
  return LEVELS[name] ?? LEVELS.recommended;
}

/** Base64 payload of a canvas data URL, as bytes pdf-lib can embed. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const raw = atob(dataUrl.split(',')[1]);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/* ------------------------------------------------------------------- panel */

function CompressPanel({ values, setValue }: PanelProps) {
  const level = typeof values['compress_level'] === 'string'
    ? (values['compress_level'] as string)
    : 'recommended';
  const keepText = typeof values['compress_text'] === 'boolean'
    ? (values['compress_text'] as boolean)
    : true;

  return (
    <>
      <div className="flex flex-col gap-2">
        {LEVEL_OPTIONS.map((option) => {
          const selected = level === option.value;
          return (
            <label
              key={option.value}
              className={
                selected
                  ? 'relative flex flex-wrap items-start gap-x-3 rounded-lg border border-muted p-3.5 cursor-pointer'
                  : 'relative flex flex-wrap items-start gap-x-3 rounded-lg border border-line p-3.5 cursor-pointer'
              }
            >
              <input
                type="radio"
                name="compress_level"
                className="sr-only"
                value={option.value}
                checked={selected}
                onChange={() => setValue('compress_level', option.value)}
              />
              <span
                className={
                  selected
                    ? 'mt-0.5 h-[22px] w-[22px] shrink-0 rounded-full border-[6px] border-ink-2 bg-surface'
                    : 'mt-0.5 h-[22px] w-[22px] shrink-0 rounded-full border border-muted bg-surface'
                }
              />
              <span className="text-[15px] font-medium text-ink-2">{option.title}</span>
              <span className="mt-0.5 basis-full pl-[34px] text-sm leading-[18px] text-muted">
                {option.body}
              </span>
            </label>
          );
        })}
      </div>

      {/* Legacy renders this toggle but its compressor always rasterises, so it
       * stays a presentation-only control — kept so the panel is unchanged. */}
      <label className="mt-4 flex items-start gap-3 cursor-pointer text-[15px] text-ink-2">
        <input
          type="checkbox"
          className="sr-only"
          checked={keepText}
          onChange={(e) => setValue('compress_text', e.target.checked)}
        />
        <span
          className={
            keepText
              ? 'h-6 w-6 shrink-0 rounded border border-success bg-surface'
              : 'h-6 w-6 shrink-0 rounded border border-muted bg-surface'
          }
        >
          {keepText ? (
            <svg
              viewBox="0 0 24 24"
              className="h-full w-full p-0.5 text-success-dark"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 12.5l5 5L20 6.5" />
            </svg>
          ) : null}
        </span>
        <span>Keep text selectable (slower, larger file)</span>
      </label>
    </>
  );
}

/* --------------------------------------------------------------------- tool */

export const compressTool: ToolImpl = {
  Panel: CompressPanel,

  run: async ({ files, values, setProgress, setStatus }) => {
    const level = chosenLevel(values);
    const results: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const bytes = await bytesFor(f);
      setStatus(`Optimising ${f.name}…`);

      const doc = await loadForView(bytes.slice());
      const out = await PDFDocument.create();

      try {
        for (let p = 1; p <= doc.numPages; p++) {
          setStatus(`Compressing page ${p} of ${doc.numPages}…`);
          const page = await doc.getPage(p);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: level.scale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(viewport.width));
          canvas.height = Math.max(1, Math.round(viewport.height));
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('This browser cannot render PDF pages.');
          /* JPEG has no alpha; flatten onto white so transparent areas do not
           * come back black. */
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;

          const img = await out.embedJpg(dataUrlToBytes(canvas.toDataURL('image/jpeg', level.quality)));
          out
            .addPage([base.width, base.height])
            .drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });

          setProgress((p / doc.numPages) * 100);
        }
      } finally {
        void doc.destroy();
      }

      let resultBytes = await out.save();

      /* Rasterising can make an already-image-heavy file bigger, so hand back
       * the streamlined original in that case. */
      if (resultBytes.length >= bytes.length) {
        const plain = await loadPdf(bytes.slice());
        resultBytes = await plain.save({ useObjectStreams: true });
      }

      results.push(pdfResult(resultBytes, `${baseName(f.name)}_compressed.pdf`));
    }

    return results;
  },
};
