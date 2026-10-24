/**
 * Conversion tools between PDFs and images, both directions, entirely in-tab:
 * pdf.js renders pages (or pulls their embedded bitmaps) to JPEG, and pdf-lib
 * lays images out onto fresh pages for the return trip.
 */
import {
  PDFDocument,
  baseName,
  bytesFor,
  loadForView,
  pageSize,
  pdfjs,
  pdfResult,
} from '@/lib/pdf';
import type { FieldValues, PanelProps, ResultFile, ToolImpl } from '@/types';

const INPUT =
  'h-8 w-full rounded border border-muted bg-surface px-3 text-sm text-ink focus:outline-none focus:border-ink';

const ACTION_BUTTON =
  'flex flex-1 flex-col items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-3 ' +
  'text-[13px] font-medium text-ink-2 hover:border-ink-2 hover:bg-canvas';

const ACTION_BUTTON_ON =
  'flex flex-1 flex-col items-center gap-1.5 rounded-lg border border-ink-2 bg-canvas px-2 py-3 ' +
  'text-[13px] font-medium text-ink';

/** Read a string from the free-form bag, falling back when absent or empty. */
function text(values: FieldValues, name: string, fallback: string): string {
  const v = values[name];
  return typeof v === 'string' && v !== '' ? v : fallback;
}

function flag(values: FieldValues, name: string, fallback: boolean): boolean {
  const v = values[name];
  return typeof v === 'boolean' ? v : fallback;
}

/* --------------------------------------------------------------- controls */

function CheckGlyph() {
  return (
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
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer text-[15px] text-ink-2">
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border bg-surface ${
          checked ? 'border-success' : 'border-muted'
        }`}
      >
        {checked ? <CheckGlyph /> : null}
      </span>
      <span>{label}</span>
    </label>
  );
}

interface RadioOption {
  value: string;
  title: string;
  body: string;
}

function RadioCards({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: RadioOption[];
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <label
            key={option.value}
            className="relative flex flex-wrap items-start gap-x-3 rounded-lg border border-muted p-3.5 cursor-pointer"
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              value={option.value}
              checked={on}
              onChange={() => onChange(option.value)}
            />
            <span
              className={
                on
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
  );
}

/** Segmented chooser used for orientation and margin presets. */
function TileChoice({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      {label ? <div className="option-title">{label}</div> : null}
      <div className="flex gap-2">
        {options.map((option) => {
          const on = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(option.value)}
              className={on ? ACTION_BUTTON_ON : ACTION_BUTTON}
            >
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ PDF -> JPG ============================ */

/*
 * The reference's quality picker labels a pdf.js *scale*, not a compression
 * level: 1 renders at page size, 2 doubles it. The odd ordering (High before
 * Medium) is the legacy list, kept so the options read identically.
 */
const JPG_QUALITY_OPTIONS = [
  { value: '1', label: 'Standard' },
  { value: '2', label: 'High' },
  { value: '1.5', label: 'Medium' },
];

const JPG_MODES: RadioOption[] = [
  {
    value: 'pages',
    title: 'Page to JPG',
    body: 'Every page of the PDF becomes a JPG file.',
  },
  { value: 'extract', title: 'Extract images', body: 'Pull the embedded images out of the PDF.' },
];

function PdfToJpgPanel({ files, values, setValue }: PanelProps) {
  const total = files.reduce((sum, f) => sum + (f.pages ?? 0), 0);
  const mode = text(values, 'jpg_mode', 'pages');

  return (
    <div className="flex flex-col gap-3">
      <RadioCards
        name="jpg_mode"
        value={mode}
        options={JPG_MODES}
        onChange={(next) => setValue('jpg_mode', next)}
      />

      <div>
        <label className="option-title block" htmlFor="jpg-quality">
          Image quality
        </label>
        <select
          id="jpg-quality"
          className={`${INPUT} pr-8 appearance-none cursor-pointer`}
          value={text(values, 'jpg_quality', '2')}
          onChange={(e) => setValue('jpg_quality', e.target.value)}
        >
          {JPG_QUALITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm leading-[18px] text-muted">
        {total ? `${total} image${total === 1 ? '' : 's'} will be created.` : ''}
      </p>
    </div>
  );
}

/** Canvas JPEG as a downloadable result. */
function jpegResult(
  canvas: HTMLCanvasElement,
  quality: number,
  name: string,
): Promise<ResultFile> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No images could be produced from this file.'));
          return;
        }
        resolve({ name, blob, size: blob.size });
      },
      'image/jpeg',
      quality,
    );
  });
}

interface PdfJsImage {
  bitmap?: CanvasImageSource;
  data?: Uint8ClampedArray | Uint8Array;
  width?: number;
  height?: number;
  /** pdf.js 1 = 1-bit, 2 = RGB, 3 = RGBA. */
  kind?: number;
}

/**
 * pdf.js keeps per-page images in `page.objs`, but images shared between pages
 * live in `page.commonObjs` under a "g_"-prefixed id. Reading only one pool
 * silently drops shared logos and letterheads.
 */
function resolvePdfImage(page: pdfjs.PDFPageProxy, id: string): Promise<unknown> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: unknown) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 2500);
    try {
      const pool = String(id).startsWith('g_') ? page.commonObjs : page.objs;
      pool.get(id, (value: unknown) => {
        clearTimeout(timer);
        finish(value);
      });
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

/* ImageData wants four bytes a pixel; pdf.js often hands over three. */
function expandToRgba(img: PdfJsImage): Uint8ClampedArray<ArrayBuffer> | null {
  const { data, width, height } = img;
  if (!data || !width || !height) return null;
  const kind = img.kind ?? (data.length === width * height * 4 ? 3 : 2);

  if (kind === 3 && data.length === width * height * 4) {
    const out = new Uint8ClampedArray(width * height * 4);
    out.set(data);
    return out;
  }
  if (kind === 2 && data.length >= width * height * 3) {
    const out = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < width * height; i++, j += 3) {
      out[i * 4] = data[j];
      out[i * 4 + 1] = data[j + 1];
      out[i * 4 + 2] = data[j + 2];
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  if (kind === 1) {
    /* One byte per pixel after decoding; treat it as greyscale. */
    const out = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const v = data[i] ? 255 : 0;
      out[i * 4] = v;
      out[i * 4 + 1] = v;
      out[i * 4 + 2] = v;
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  return null;
}

async function imageToBlob(img: unknown): Promise<Blob | null> {
  const source = img as PdfJsImage | null;
  if (!source || !source.width || !source.height) return null;

  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (source.bitmap) {
    ctx.drawImage(source.bitmap, 0, 0);
  } else if (source.data) {
    const pixels = expandToRgba(source);
    if (!pixels) return null;
    ctx.putImageData(new ImageData(pixels, source.width, source.height), 0, 0);
  } else {
    return null;
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

export const pdfToJpgTool: ToolImpl = {
  Panel: PdfToJpgPanel,

  run: async ({ files, values, setProgress, setStatus }) => {
    const mode = text(values, 'jpg_mode', 'pages');
    const scale = parseFloat(text(values, 'jpg_quality', '2')) || 2;
    const results: ResultFile[] = [];

    for (const f of files) {
      const bytes = await bytesFor(f);
      const doc = await loadForView(bytes.slice());
      const base = baseName(f.name);

      try {
        if (mode === 'extract') {
          let index = 0;
          for (let p = 1; p <= doc.numPages; p++) {
            setStatus(`Extracting images from page ${p} of ${doc.numPages}…`);
            const page = await doc.getPage(p);
            const ops = await page.getOperatorList();

            for (let i = 0; i < ops.fnArray.length; i++) {
              const fn = ops.fnArray[i];
              const isXObject = fn === pdfjs.OPS.paintImageXObject;
              const isInline = fn === pdfjs.OPS.paintInlineImageXObject;
              if (!isXObject && !isInline) continue;

              try {
                const raw = ops.argsArray[i][0];
                const image = isInline ? raw : await resolvePdfImage(page, String(raw));
                const blob = await imageToBlob(image);
                if (!blob) continue;
                index++;
                results.push({ name: `${base}_image_${index}.jpg`, blob, size: blob.size });
              } catch {
                /* Skip anything stored in a form the browser cannot decode. */
              }
            }
            if (p % 4 === 0) setProgress((p / doc.numPages) * 100);
          }
          continue;
        }

        for (let p = 1; p <= doc.numPages; p++) {
          setStatus(`Rendering page ${p} of ${doc.numPages}…`);
          const page = await doc.getPage(p);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(viewport.width));
          canvas.height = Math.max(1, Math.round(viewport.height));
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('This browser cannot render PDF pages.');
          /* JPEG carries no alpha, so a transparent page would come back black. */
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          results.push(await jpegResult(canvas, 0.94, `${base}_page_${p}.jpg`));
          setProgress((p / doc.numPages) * 100);
        }
      } finally {
        void doc.destroy();
      }
    }

    if (!results.length) throw new Error('No images could be produced from this file.');
    return results;
  },
};

/* ============================ Images -> PDF ============================ */

const IMG_ORIENTATION = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

const IMG_MARGINS = [
  { value: '0', label: 'No margin' },
  { value: '20', label: 'Small' },
  { value: '40', label: 'Big' },
];

const IMG_PAGE_SIZES = [
  { value: 'fit', label: 'Fit (same size as image)' },
  { value: 'A4', label: 'A4' },
  { value: 'letter', label: 'US Letter' },
];

function JpgToPdfPanel({ values, setValue }: PanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <TileChoice
        label="Page orientation"
        value={text(values, 'img_orient', 'portrait')}
        options={IMG_ORIENTATION}
        onChange={(next) => setValue('img_orient', next)}
      />

      <div>
        <label className="option-title block" htmlFor="img-pagesize">
          Page size
        </label>
        <select
          id="img-pagesize"
          className={`${INPUT} pr-8 appearance-none cursor-pointer`}
          value={text(values, 'img_pagesize', 'fit')}
          onChange={(e) => setValue('img_pagesize', e.target.value)}
        >
          {IMG_PAGE_SIZES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <TileChoice
        label="Margin"
        value={text(values, 'img_margin', '0')}
        options={IMG_MARGINS}
        onChange={(next) => setValue('img_margin', next)}
      />

      <CheckRow
        label="Merge all images into one PDF"
        checked={flag(values, 'img_merge', true)}
        onChange={(next) => setValue('img_merge', next)}
      />
    </div>
  );
}

/** Re-encode a format pdf-lib cannot embed (webp/gif/bmp) through a canvas. */
async function reencode(bytes: Uint8Array): Promise<Uint8Array> {
  const bmp = await createImageBitmap(new Blob([bytes as unknown as BlobPart]));
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot decode that image.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
  const raw = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export const jpgToPdfTool: ToolImpl = {
  Panel: JpgToPdfPanel,

  run: async ({ files, values, setProgress }) => {
    const orient = text(values, 'img_orient', 'portrait');
    const sizeName = text(values, 'img_pagesize', 'fit');
    const margin = parseFloat(text(values, 'img_margin', '0')) || 0;
    const merge = flag(values, 'img_merge', true);

    let out = await PDFDocument.create();
    const results: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      /* bytesFor caches, so a cover render and the embed share one read. */
      const bytes = await bytesFor(f);
      const isPng = /\.png$/i.test(f.name) || f.file.type === 'image/png';
      let img;
      try {
        img = isPng ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      } catch {
        img = await out.embedJpg(await reencode(bytes));
      }

      let pageW: number;
      let pageH: number;
      if (sizeName === 'fit') {
        pageW = img.width + margin * 2;
        pageH = img.height + margin * 2;
      } else {
        const s = pageSize(sizeName);
        pageW = orient === 'landscape' ? s.height : s.width;
        pageH = orient === 'landscape' ? s.width : s.height;
      }

      const page = out.addPage([pageW, pageH]);
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2;
      /* Preserve aspect ratio: a single scale factor fits both extents. */
      const k = Math.min(availW / img.width, availH / img.height);
      const w = img.width * k;
      const h = img.height * k;
      page.drawImage(img, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
      setProgress(((i + 1) / files.length) * 95);

      if (!merge) {
        results.push(pdfResult(await out.save(), `${baseName(f.name)}.pdf`));
        out = await PDFDocument.create();
      }
    }

    if (merge) {
      const name = files.length === 1 ? `${baseName(files[0].name)}.pdf` : 'images.pdf';
      results.push(pdfResult(await out.save(), name));
    }

    return results;
  },
};
