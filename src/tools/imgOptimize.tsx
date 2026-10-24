/**
 * Image optimisation tools: Compress, Resize and Upscale.
 *
 * All three share the same shape — decode, redraw, re-encode — so they live in
 * one module and share the result-naming conventions. Nothing is uploaded;
 * each file is read from its Blob and written back as a new Blob.
 */
import {
  decodeBlob,
  encode,
  resize,
  sharpen,
  withSuffix,
  type OutFormat,
  FORMAT_EXT,
} from '@/lib/image';
import { prettySize } from '@/lib/pdf';
import type { FieldValues, PanelProps, ResultFile, ToolImpl, WorkFile } from '@/types';
import { CheckboxField, Info, Label, RadioCards, TextField } from '@/components/controls';

/* ------------------------------------------------------------------ shared */

/** Read a string option with a fallback. */
function str(values: FieldValues, name: string, fallback = ''): string {
  const v = values[name];
  return typeof v === 'string' && v !== '' ? v : fallback;
}

/** Read a boolean option with a fallback. */
function flag(values: FieldValues, name: string, fallback = false): boolean {
  const v = values[name];
  return typeof v === 'boolean' ? v : fallback;
}

/** Read a number option, clamped, with a fallback. */
function num(values: FieldValues, name: string, fallback: number, min: number, max: number): number {
  const raw = values[name];
  const n = typeof raw === 'string' ? parseFloat(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** The output extension for a source file, defaulting to the source's own. */
function extFor(file: WorkFile, preferred?: OutFormat): string {
  if (preferred) return FORMAT_EXT[preferred];
  const m = (file.name || '').match(/\.([a-z0-9]+)$/i);
  const ext = (m?.[1] ?? 'jpg').toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

/** An output format the browser can actually encode for this source. */
function formatFor(file: WorkFile, preferred?: OutFormat): OutFormat {
  if (preferred) return preferred;
  const ext = extFor(file);
  if (ext === 'png' || ext === 'webp' || ext === 'gif' || ext === 'bmp') return ext as OutFormat;
  return 'jpg';
}

/** Wrap an encoded Blob as a ResultFile. */
function imageResult(blob: Blob, name: string): ResultFile {
  return { name, blob, size: blob.size };
}

/* ================================================================ COMPRESS */

/**
 * Compression levels, as iLoveIMG offers them implicitly through its single
 * "best quality" pass. We expose the three states the PDF side already uses so
 * the two halves feel consistent, and default to the middle.
 */
const COMPRESS_LEVELS = {
  extreme: { scale: 0.55, quality: 0.55, label: 'Extreme compression' },
  recommended: { scale: 0.8, quality: 0.72, label: 'Recommended compression' },
  low: { scale: 1, quality: 0.88, label: 'Less compression' },
} as const;

type CompressLevel = keyof typeof COMPRESS_LEVELS;

function CompressPanel({ values, files, setValue }: PanelProps) {
  const level = str(values, 'level', 'recommended') as CompressLevel;
  const convert = flag(values, 'convertToJpg', false);
  return (
    <div className="flex flex-col gap-1">
      <Info>
        All images will be compressed with the best quality and filesize ratio.
      </Info>

      <Label>Compression level</Label>
      <RadioCards
        name="level"
        value={level}
        onChange={(v) => setValue('level', v)}
        options={[
          { value: 'extreme', title: 'Extreme', body: 'Smallest file, visibly softer' },
          { value: 'recommended', title: 'Recommended', body: 'Good quality, good compression' },
          { value: 'low', title: 'Less compression', body: 'Highest quality, larger file' },
        ]}
      />

      <CheckboxField
        label="Convert to JPG (removes transparency)"
        checked={convert}
        onChange={(v) => setValue('convertToJpg', v)}
      />

      {files.length > 0 && (
        <p className="mt-1 text-[13px] leading-[18px] text-muted">
          {files.length} image{files.length === 1 ? '' : 's'} ·{' '}
          {prettySize(files.reduce((sum, f) => sum + f.size, 0))} in total
        </p>
      )}
    </div>
  );
}

export const compressImageTool: ToolImpl = {
  Panel: CompressPanel,

  async run({ files, values, setProgress, setStatus }) {
    const levelName = str(values, 'level', 'recommended') as CompressLevel;
    const level = COMPRESS_LEVELS[levelName] ?? COMPRESS_LEVELS.recommended;
    const toJpg = flag(values, 'convertToJpg', false);
    const out: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Compressing ${file.name}…`);
      const { bmp, width, height } = await decodeBlob(file.file);
      const format: OutFormat = toJpg ? 'jpg' : formatFor(file);
      const scaled = resize(bmp, width * level.scale, height * level.scale);
      let blob = await encode(scaled, format, level.quality);

      /* Never hand back a file that got bigger — the visitor asked for less. */
      if (blob.size >= file.size && !toJpg) {
        const untouched = await encode(resize(bmp, width, height), format, 0.96);
        if (untouched.size < blob.size) blob = untouched;
        else blob = file.file;
      }

      out.push(imageResult(blob, withSuffix(file.name, '_compressed', format === 'jpg' ? 'jpg' : extFor(file))));
      setProgress(((i + 1) / files.length) * 100);
    }
    return out;
  },
};

/* ================================================================== RESIZE */

function ResizePanel({ values, files, setValue }: PanelProps) {
  const mode = str(values, 'mode', 'pixels');
  const first = files[0];
  const keepRatio = flag(values, 'keepRatio', true);

  /*
   * The pixel fields start empty and show the first picture's size as their
   * placeholder, so an untouched form means "keep this size" rather than
   * silently resizing to a number nobody typed.
   */

  return (
    <div className="flex flex-col gap-1">
      <Info>
        Resize JPG, PNG, SVG or GIF by defining new height and width pixels. Change
        image dimensions in bulk.
      </Info>

      <Label>Resize options</Label>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {[
          ['pixels', 'By pixels'],
          ['percent', 'By percentage'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setValue('mode', value)}
            aria-pressed={mode === value}
            className={`rounded-lg border-2 px-2 py-2.5 text-[14px] font-medium ${
              mode === value
                ? 'border-img bg-img-soft text-img-ink'
                : 'border-line bg-surface text-muted hover:border-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'pixels' ? (
        <>
          <p className="mb-2 text-[13px] leading-[18px] text-muted">
            Resize all images to an exact size of
          </p>
          <div className="mb-3 flex gap-2">
            <div className="min-w-0 flex-1">
              <label className="option-title block" htmlFor="resize-w">
                Width (px):
              </label>
              <input
                id="resize-w"
                type="number"
                min={1}
                className="h-9 w-full rounded border border-muted bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none"
                placeholder={first?.width ? String(first.width) : 'Auto'}
                value={str(values, 'width')}
                onChange={(e) => setValue('width', e.target.value)}
              />
            </div>
            <div className="min-w-0 flex-1">
              <label className="option-title block" htmlFor="resize-h">
                Height (px):
              </label>
              <input
                id="resize-h"
                type="number"
                min={1}
                className="h-9 w-full rounded border border-muted bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none"
                placeholder={first?.height ? String(first.height) : 'Auto'}
                value={str(values, 'height')}
                onChange={(e) => setValue('height', e.target.value)}
              />
            </div>
          </div>
        </>
      ) : (
        <TextField
          id="resize-percent"
          label="Percentage:"
          type="number"
          min={1}
          max={400}
          placeholder="100"
          value={str(values, 'percent')}
          onChange={(v) => setValue('percent', v)}
        />
      )}

      <CheckboxField
        label="Maintain aspect ratio"
        checked={keepRatio}
        onChange={(v) => setValue('keepRatio', v)}
      />
      <CheckboxField
        label="Do not enlarge if smaller"
        checked={flag(values, 'noEnlarge', false)}
        onChange={(v) => setValue('noEnlarge', v)}
      />
    </div>
  );
}

export const resizeImageTool: ToolImpl = {
  Panel: ResizePanel,

  /*
   * Ready as soon as a file is loaded: with the fields untouched the run falls
   * back to the picture's own dimensions, which is a valid (identity) resize and
   * matches how the reference keeps its CTA live for a single upload.
   */
  isReady: ({ files, values }) => {
    if (!files.length) return false;
    if (str(values, 'mode', 'pixels') === 'percent') {
      const p = parseFloat(str(values, 'percent', '100'));
      return Number.isFinite(p) && p > 0;
    }
    const rawW = str(values, 'width');
    const rawH = str(values, 'height');
    if (!rawW && !rawH) return true;
    const w = parseFloat(rawW);
    const h = parseFloat(rawH);
    return (Number.isFinite(w) && w > 0) || (Number.isFinite(h) && h > 0);
  },

  async run({ files, values, setProgress, setStatus }) {
    const mode = str(values, 'mode', 'pixels');
    const keepRatio = flag(values, 'keepRatio', true);
    const noEnlarge = flag(values, 'noEnlarge', false);
    const out: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Resizing ${file.name}…`);
      const { bmp, width, height } = await decodeBlob(file.file);

      let targetW: number;
      let targetH: number;
      if (mode === 'percent') {
        const pct = num(values, 'percent', 100, 1, 400) / 100;
        targetW = width * pct;
        targetH = height * pct;
      } else {
        const reqW = parseFloat(str(values, 'width') || String(width));
        const reqH = parseFloat(str(values, 'height') || String(height));
        const hasW = Number.isFinite(reqW) && reqW > 0;
        const hasH = Number.isFinite(reqH) && reqH > 0;
        if (hasW && hasH && !keepRatio) {
          targetW = reqW;
          targetH = reqH;
        } else if (hasW && hasH) {
          /* Keep the ratio, fitting inside the requested box. */
          const scale = Math.min(reqW / width, reqH / height);
          targetW = width * scale;
          targetH = height * scale;
        } else if (hasW) {
          targetW = reqW;
          targetH = (height / width) * reqW;
        } else {
          targetH = reqH;
          targetW = (width / height) * reqH;
        }
      }

      if (noEnlarge) {
        targetW = Math.min(targetW, width);
        targetH = Math.min(targetH, height);
      }

      const format = formatFor(file);
      const canvas = resize(bmp, targetW, targetH);
      const blob = await encode(canvas, format, 0.94);
      out.push(imageResult(blob, withSuffix(file.name, '_resized', extFor(file, format))));
      setProgress(((i + 1) / files.length) * 100);
    }
    return out;
  },
};

/* ================================================================= UPSCALE */

function UpscalePanel({ values, setValue }: PanelProps) {
  return (
    <div className="flex flex-col gap-1">
      <Info>
        Enlarge your images with a progressive resample and a light sharpen pass.
        The result is smoother than a plain stretch, but it cannot invent detail
        that was never in the original.
      </Info>

      <Label>Upscale factor</Label>
      <RadioCards
        name="factor"
        value={str(values, 'factor', '2')}
        onChange={(v) => setValue('factor', v)}
        options={[
          { value: '2', title: '2x', body: 'Double the width and height' },
          { value: '4', title: '4x', body: 'Four times the size — slower' },
        ]}
      />

      <CheckboxField
        label="Sharpen after enlarging"
        checked={flag(values, 'sharpen', true)}
        onChange={(v) => setValue('sharpen', v)}
      />
    </div>
  );
}

export const upscaleImageTool: ToolImpl = {
  Panel: UpscalePanel,

  async run({ files, values, setProgress, setStatus }) {
    const factor = str(values, 'factor', '2') === '4' ? 4 : 2;
    const doSharpen = flag(values, 'sharpen', true);
    const out: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Upscaling ${file.name}…`);
      const { bmp, width, height } = await decodeBlob(file.file);

      /* Cap the long edge so a 4x pass on a phone camera file cannot exhaust
         memory and kill the tab. */
      const cap = 6000;
      const wanted = { w: width * factor, h: height * factor };
      const shrink = Math.min(1, cap / Math.max(wanted.w, wanted.h));
      const canvas = resize(bmp, wanted.w * shrink, wanted.h * shrink);
      if (doSharpen) sharpen(canvas, 0.5);

      const format = formatFor(file);
      const blob = await encode(canvas, format, 0.95);
      out.push(imageResult(blob, withSuffix(file.name, '_upscaled', extFor(file, format))));
      setProgress(((i + 1) / files.length) * 100);
    }
    return out;
  },
};