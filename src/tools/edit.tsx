/**
 * Edit tools: rotate, page numbers and crop.
 *
 * Rotation is the odd one out — the angle is queued on the file card
 * (`WorkFile.rotation`), so the panel does not own it. The panel nudges those
 * queued values in place and asks the shell to re-evaluate readiness, and `run`
 * bakes each queued angle into the page's own /Rotate.
 */
import {
  StandardFonts,
  baseName,
  bytesFor,
  degrees,
  hexToRgb,
  loadPdf,
  pdfResult,
  rgb,
} from '@/lib/pdf';
import type { FieldValues, PanelProps, ResultFile, ToolImpl } from '@/types';

const INPUT =
  'h-8 w-full rounded border border-muted bg-surface px-3 text-sm text-ink focus:outline-none focus:border-ink';

/** Read a string from the free-form bag, falling back when it is absent/empty. */
function text(values: FieldValues, name: string, fallback: string): string {
  const v = values[name];
  return typeof v === 'string' && v !== '' ? v : fallback;
}

/** Numeric read that keeps NaN, so callers can keep the legacy `|| default`. */
function num(values: FieldValues, name: string): number {
  const v = values[name];
  return typeof v === 'string' ? parseFloat(v) : NaN;
}

/**
 * What an input should display. Unlike `text`, an emptied field stays empty —
 * otherwise the fallback would immediately refill it and the visitor could
 * never clear a default.
 */
function shown(values: FieldValues, name: string, fallback: string): string {
  const v = values[name];
  return typeof v === 'string' ? v : fallback;
}

function RotateGlyph({ left }: { left?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {left ? (
        <>
          <path d="M3 12a9 9 0 1 0 2.64-6.36" />
          <path d="M3 3v6h6" />
        </>
      ) : (
        <>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </>
      )}
    </svg>
  );
}

const ACTION_BUTTON =
  'flex flex-1 flex-col items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-3 ' +
  'text-[13px] font-medium text-ink-2 hover:border-ink-2 hover:bg-canvas';

/* ================================ ROTATE ================================ */

function RotatePanel({ files, setValue, requestUpdate }: PanelProps) {
  /*
   * These WorkFile objects are the ones the shell holds, so writing `rotation`
   * in place is the same contract its own card button uses — the covers turn
   * and the CTA gate both follow, once the shell re-renders.
   *
   * The shell's readiness memo keys off the files array's identity, which an
   * in-place mutation does not change; mirroring the queued total into the
   * values bag makes that memo recompute. Nothing reads it back.
   */
  const publish = () => {
    setValue('rot_queue', files.map((f) => f.rotation).join(','));
    requestUpdate();
  };

  const queue = (delta: number) => {
    for (const f of files) f.rotation = (((f.rotation + delta) % 360) + 360) % 360;
    publish();
  };

  const resetAll = () => {
    for (const f of files) f.rotation = 0;
    publish();
  };

  const rotated = files.filter((f) => f.rotation).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="info-box">
        Mouse over PDF file below and a rotate icon will appear, click on the arrows to rotate PDFs.
      </div>

      <div>
        <div className="option-title">Rotation</div>
        <div className="flex gap-2">
          <button type="button" onClick={() => queue(90)} className={ACTION_BUTTON}>
            <RotateGlyph />
            <span>Right</span>
          </button>
          <button type="button" onClick={() => queue(-90)} className={ACTION_BUTTON}>
            <RotateGlyph left />
            <span>Left</span>
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={resetAll}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink-2 hover:border-ink-2 hover:bg-canvas"
        >
          Reset all
        </button>
      </div>

      <p className="text-sm leading-[18px] text-muted">
        {rotated
          ? `${rotated} file${rotated === 1 ? '' : 's'} will be rotated.`
          : 'No rotation applied yet.'}
      </p>
    </div>
  );
}

export const rotateTool: ToolImpl = {
  Panel: RotatePanel,

  /* Rotating by nothing would emit an identical file, so gate the CTA. */
  isReady: ({ files }) => files.some((f) => f.rotation),

  run: async ({ files, setProgress }) => {
    const results: ResultFile[] = [];

    for (const f of files) {
      if (!f.rotation) continue;
      const doc = await loadPdf(await bytesFor(f));
      /* The queued angle adds to whatever /Rotate the page already carries;
       * pdf-lib uses a signed angle, hence the wrap back into 0..359. */
      doc
        .getPages()
        .forEach((page) =>
          page.setRotation(degrees((page.getRotation().angle + f.rotation) % 360)),
        );
      results.push(pdfResult(await doc.save(), `${baseName(f.name)}_rotated.pdf`));
      setProgress((results.length / files.length) * 100);
    }

    if (!results.length) throw new Error('Rotate a file first, then press the button.');
    return results;
  },
};

/* ============================= PAGE NUMBERS ============================= */

const POS_ROWS = ['top', 'middle', 'bottom'] as const;
const POS_COLS = ['left', 'center', 'right'] as const;

/** The reference's 3x3 picker: nine dots on a miniature page. */
function PagePositionGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="grid h-[72px] w-[72px] grid-rows-3 gap-0 rounded border border-line bg-surface p-1"
      role="radiogroup"
      aria-label="Position"
    >
      {POS_ROWS.map((row) => (
        <div key={row} className="flex items-center justify-between">
          {POS_COLS.map((col) => {
            const key = `${row}-${col}`;
            const active = key === value;
            return (
              <button
                key={col}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${row} ${col}`}
                onClick={() => onChange(key)}
                className={`h-3 w-3 rounded-full ${active ? 'bg-brand' : 'bg-line hover:bg-muted'}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

const NUMBER_FORMATS = [
  { value: 'n', label: '1, 2, 3…' },
  { value: 'n_of_m', label: '1 of N' },
  { value: 'page_n', label: 'Page 1' },
];

function PageNumbersPanel({ values, setValue }: PanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div>
          <div className="option-title">Position:</div>
          <PagePositionGrid
            value={text(values, 'pn_pos', 'bottom-right')}
            onChange={(next) => setValue('pn_pos', next)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <label className="option-title block" htmlFor="pn-format">
            Format:
          </label>
          <select
            id="pn-format"
            className={`select-field cursor-pointer ${INPUT}`}
            value={text(values, 'pn_format', 'n')}
            onChange={(e) => setValue('pn_format', e.target.value)}
          >
            {NUMBER_FORMATS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <label className="option-title block" htmlFor="pn-size">
            Font size
          </label>
          <input
            id="pn-size"
            type="number"
            min={6}
            max={48}
            className={INPUT}
            value={shown(values, 'pn_size', '11')}
            onChange={(e) => setValue('pn_size', e.target.value)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <label className="option-title block" htmlFor="pn-margin">
            Margin
          </label>
          <input
            id="pn-margin"
            type="number"
            min={0}
            max={120}
            className={INPUT}
            value={shown(values, 'pn_margin', '24')}
            onChange={(e) => setValue('pn_margin', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="option-title block" htmlFor="pn-start">
          First number:
        </label>
        <input
          id="pn-start"
          type="number"
          min={1}
          className={INPUT}
          value={shown(values, 'pn_start', '1')}
          onChange={(e) => setValue('pn_start', e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="option-title mb-0">Colour</span>
        <input
          type="color"
          aria-label="Colour"
          className="h-8 w-11 shrink-0 cursor-pointer rounded border border-muted bg-surface p-0.5"
          value={text(values, 'pn_color', '#333333')}
          onChange={(e) => setValue('pn_color', e.target.value)}
        />
      </div>
    </div>
  );
}

export const pageNumbersTool: ToolImpl = {
  Panel: PageNumbersPanel,

  run: async ({ files, values, setProgress, setStatus }) => {
    /* The picker preselects bottom-right, so `run` uses the same default: the
     * values bag only ever holds what the visitor actually touched. */
    const pos = text(values, 'pn_pos', 'bottom-right');
    const format = text(values, 'pn_format', 'n');
    const size = Math.max(6, num(values, 'pn_size') || 11);
    const margin = Math.max(0, num(values, 'pn_margin') || 24);
    const start = Math.max(1, parseInt(text(values, 'pn_start', '1'), 10) || 1);
    const colour = hexToRgb(text(values, 'pn_color', '#333333'));
    const results: ResultFile[] = [];

    for (const f of files) {
      setStatus(`Numbering ${f.name}…`);
      const doc = await loadPdf(await bytesFor(f));
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages();

      pages.forEach((page, i) => {
        const n = start + i;
        let label = String(n);
        if (format === 'n_of_m') label = `${n} of ${start + pages.length - 1}`;
        else if (format === 'page_n') label = `Page ${n}`;

        const { width, height } = page.getSize();
        const w = font.widthOfTextAtSize(label, size);
        let x = (width - w) / 2;
        let y = margin;
        if (pos.includes('left')) x = margin;
        if (pos.includes('right')) x = width - w - margin;
        if (pos.startsWith('top')) y = height - margin - size;
        page.drawText(label, {
          x,
          y,
          size,
          font,
          color: rgb(colour.r, colour.g, colour.b),
        });
      });

      results.push(pdfResult(await doc.save(), `${baseName(f.name)}_numbered.pdf`));
      setProgress((results.length / files.length) * 100);
    }

    return results;
  },
};

/* ================================= CROP ================================= */

/**
 * One side's margin in points. An absent field means the panel's own default
 * of 24 (so the tool is usable immediately); an emptied field means "trim
 * nothing here", which is what the legacy number reader produced.
 */
function cropMargin(values: FieldValues, name: string): number {
  const raw = values[name];
  if (typeof raw !== 'string') return 24;
  const n = parseFloat(raw);
  return Math.max(0, Number.isFinite(n) ? n : 0);
}

function CropPanel({ values, setValue }: PanelProps) {
  const side = (name: string, label: string) => (
    <div className="min-w-0 flex-1">
      <label className="option-title block" htmlFor={`crop-${label}`}>
        {label}
      </label>
      <input
        id={`crop-${label}`}
        type="number"
        min={0}
        step={1}
        className={INPUT}
        value={shown(values, name, '24')}
        onChange={(e) => setValue(name, e.target.value)}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="info-box">
        Trim equal margins off every page. Values are in points, where 72 points make an inch.
      </div>

      <div className="option-title">Crop margins (points)</div>

      <div className="flex gap-2">
        {side('cropTop', 'Top')}
        {side('cropBottom', 'Bottom')}
      </div>
      <div className="flex gap-2">
        {side('cropLeft', 'Left')}
        {side('cropRight', 'Right')}
      </div>

      <p className="text-sm leading-[18px] text-muted">
        Every page is trimmed by the same amounts.
      </p>
    </div>
  );
}

export const cropTool: ToolImpl = {
  Panel: CropPanel,

  run: async ({ files, values, setProgress, setStatus }) => {
    const top = cropMargin(values, 'cropTop');
    const bottom = cropMargin(values, 'cropBottom');
    const left = cropMargin(values, 'cropLeft');
    const right = cropMargin(values, 'cropRight');
    if (!top && !bottom && !left && !right) throw new Error('Enter at least one margin to crop.');

    const results: ResultFile[] = [];

    for (const f of files) {
      setStatus(`Cropping ${f.name}…`);
      const doc = await loadPdf(await bytesFor(f));
      doc.getPages().forEach((page) => {
        /* Shrinking the box can drop a margin past the page edge on very small
         * pages, so each side is clamped and the extents keep a 1pt minimum. */
        const { width, height } = page.getSize();
        const x = Math.min(left, width - 1);
        const y = Math.min(bottom, height - 1);
        const w = Math.max(1, width - left - right);
        const h = Math.max(1, height - top - bottom);
        page.setCropBox(x, y, w, h);
        page.setMediaBox(x, y, w, h);
      });
      results.push(pdfResult(await doc.save(), `${baseName(f.name)}_cropped.pdf`));
      setProgress((results.length / files.length) * 100);
    }

    return results;
  },
};