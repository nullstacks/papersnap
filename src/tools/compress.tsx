/**
 * Compress: rasterise every page at the chosen level's scale/JPEG quality and
 * rebuild the PDF from those images. Same trade-off the online services make —
 * at the strongest setting text becomes an image.
 */
import { PDFDocument, baseName, bytesFor, loadForView, pdfResult } from '@/lib/pdf';
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

      {/*
       * There used to be a "Keep text selectable (slower, larger file)" checkbox
       * here. It wrote `compress_text`, which no code path read: the compressor
       * always rasterises and cannot preserve a text layer, so ticking it
       * changed nothing and left the visitor believing their PDF still had
       * selectable text. A switch that lies is worse than no switch, so it is
       * gone; the info box above states the real trade-off instead.
       */}
      <div className="mt-4 rounded-lg border border-line bg-canvas px-3 py-2.5 text-left text-[13px] leading-[19px] text-muted">
        Pages are re-encoded as images, so the text layer is replaced. If the result
        would not be smaller, the original file is returned unchanged.
      </div>
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

      let resultBytes: Uint8Array = await out.save();

      /*
       * Rasterising can make an already-image-heavy file bigger. When it does,
       * hand back the ORIGINAL bytes rather than re-saving them.
       *
       * The old fallback re-serialised the input with object streams, which
       * measured as a no-op: 13,977 -> 13,982 bytes and 5,655 -> 5,660, i.e.
       * between 100.0% and 100.1% of the input. The result page then printed
       * "Same size as the original" or, worse, an "N% larger" chip on a tool
       * whose entire job is to make the file smaller. Returning the input
       * untouched is both honest and faster (no second serialisation pass).
       */
      if (resultBytes.length >= bytes.length) {
        resultBytes = bytes;
      }

      results.push(pdfResult(resultBytes, `${baseName(f.name)}_compressed.pdf`));
    }

    return results;
  },
};
