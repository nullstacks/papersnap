/**
 * Watermark, blur and background removal: the image tools that repaint the
 * picture rather than only re-encoding it.
 *
 * All three follow the same shape - decode the file, draw it on a canvas, hand
 * the canvas to the engine in src/lib/image, encode the result - so they share
 * one module. Everything happens in the tab: the bytes come from the visitor's
 * File and go back out as a Blob, and nothing is ever uploaded.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  blurRect,
  decodeBlob,
  encode,
  fitInside,
  flatten,
  removeBackground,
  surface,
  watermark,
  FORMAT_EXT,
  withSuffix,
  type Bitmap,
  type OutFormat,
  type WatermarkOptions,
} from '@/lib/image';
import type {
  FieldValues,
  PanelProps,
  ResultFile,
  ToolImpl,
  WorkFile,
  WorkareaProps,
} from '@/types';
import {
  ActionButton,
  CheckboxField,
  ColorField,
  Info,
  Label,
  Note,
  RadioCards,
  SelectField,
  TextArea,
  TextField,
} from '@/components/controls';

/* ------------------------------------------------------------------ shared */

/** Read a string option, falling back when it is absent or empty. */
function str(values: FieldValues, name: string, fallback = ''): string {
  const v = values[name];
  return typeof v === 'string' && v !== '' ? v : fallback;
}

/**
 * Panel-side read that keeps an empty string: a field the visitor cleared has
 * to stay cleared while they retype, so only a genuinely absent value falls
 * back to the default.
 */
function shown(values: FieldValues, name: string, fallback = ''): string {
  const v = values[name];
  return typeof v === 'string' ? v : fallback;
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

/** The lowercase extension of a source file, with jpeg folded onto jpg. */
function extFor(file: WorkFile): string {
  const m = (file.name || '').match(/\.([a-z0-9]+)$/i);
  const ext = (m?.[1] ?? 'jpg').toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

/**
 * The format an output should be written in.
 *
 * GIF is deliberately mapped to PNG: drawing one frame onto a canvas drops the
 * animation, so writing the flattened picture back under a .gif name would
 * claim something the file no longer is.
 */
function formatFor(file: WorkFile): OutFormat {
  const ext = extFor(file);
  if (ext === 'png' || ext === 'webp' || ext === 'bmp') return ext;
  if (ext === 'gif') return 'png';
  return 'jpg';
}

/** Wrap an encoded Blob as a download-ready result. */
function imageResult(blob: Blob, name: string): ResultFile {
  return { name, blob, size: blob.size };
}

/**
 * Range slider with its label and current value.
 *
 * The panels need six of these, and the reference keeps the readout on the
 * label row so the control itself stays the same height everywhere.
 */
function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  readout,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  readout: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between gap-2">
        <label className="option-title mb-0" htmlFor={id}>
          {label}
        </label>
        <span className="text-[13px] tabular-nums text-muted">{readout(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        className="mt-2 w-full cursor-pointer accent-img"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

/* =============================================================== WATERMARK */

/*
 * The engine builds a canvas font string as "<size>px <family>", so the values
 * below are CSS family lists rather than the single names the menu shows. The
 * quoted names keep fonts with spaces resolving.
 *
 * Arial leads the list because it is the face the reference menu opens on.
 */
const WM_FONTS: Array<{ value: string; label: string }> = [
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times' },
];

const WM_POSITIONS: Array<{ value: string; label: string }> = [
  { value: 'center', label: 'Center' },
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'tiled', label: 'Tiled' },
];

/*
 * The chosen logo, cached at module level.
 *
 * Field values have to stay serialisable, so the panel cannot pass a decoded
 * bitmap to run(). A File and its decoded pixels are kept side by side under a
 * key built from the file's own identity: unlike an object URL it needs no
 * cleanup, and re-picking the same logo reuses the pixels already decoded.
 */
const logoFiles = new Map<string, File>();
const logoBitmaps = new Map<string, Bitmap>();

function logoKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

async function logoFor(key: string): Promise<Bitmap | null> {
  const ready = logoBitmaps.get(key);
  if (ready) return ready;
  const file = logoFiles.get(key);
  if (!file) return null;
  const { bmp } = await decodeBlob(file);
  logoBitmaps.set(key, bmp);
  return bmp;
}

/** Pixel width of a decoded bitmap, whichever kind of source it came from. */
function bitmapWidth(img: Bitmap): number {
  return (img as ImageBitmap).width || (img as HTMLImageElement).naturalWidth || 1;
}

function WatermarkPanel({ values, setValue }: PanelProps) {
  const mode = str(values, 'wmMode', 'text') === 'image' ? 'image' : 'text';
  const logoName = str(values, 'wmLogoName');

  const pickLogo = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) {
      setValue('wmLogo', null);
      setValue('wmLogoName', null);
      return;
    }
    const key = logoKey(file);
    logoFiles.set(key, file);
    /*
     * Decode straight away, while the visitor is still adjusting the other
     * options: the bitmap is then ready before the first file runs, and a file
     * that turns out not to be an image is dropped from the cache instead of
     * failing the whole batch later.
     */
    void decodeBlob(file)
      .then(({ bmp }) => logoBitmaps.set(key, bmp))
      .catch(() => logoBitmaps.delete(key));
    setValue('wmLogo', key);
    setValue('wmLogoName', file.name);
  };

  return (
    <div className="flex flex-col gap-1">
      <Info>Watermark will be applied to this images</Info>

      {/*
       * Say what the disabled CTA is waiting for. The button is the only thing
       * the visitor can see outside the sheet on a phone, so a dead-looking
       * action with no explanation reads as a bug.
       */}
      {mode === 'text' && !str(values, 'wmText').trim() ? (
        <Note>Type the watermark text below to enable the button.</Note>
      ) : null}
      {mode === 'image' && !logoName ? (
        <Note>Choose a logo image below to enable the button.</Note>
      ) : null}

      {/*
       * The reference offers the two kinds of mark before anything else, so the
       * mode is a pair of buttons rather than a setting buried in the fields.
       */}
      <div className="mb-3 flex flex-col gap-2">
        <ActionButton onClick={() => setValue('wmMode', 'image')}>ADD IMAGE</ActionButton>
        <ActionButton onClick={() => setValue('wmMode', 'text')}>ADD TEXT</ActionButton>
      </div>

      {mode === 'text' ? (
        <>
          <TextArea
            id="wm-text"
            label="Text"
            rows={3}
            placeholder="Write your text here"
            value={shown(values, 'wmText', '')}
            onChange={(v) => setValue('wmText', v)}
          />
          <SelectField
            id="wm-font"
            label="Font"
            value={str(values, 'wmFont', WM_FONTS[0].value)}
            options={WM_FONTS}
            onChange={(v) => setValue('wmFont', v)}
          />
          <ColorField
            label="Color"
            value={str(values, 'wmColor', '#ffffff')}
            onChange={(v) => setValue('wmColor', v)}
          />
          <Slider
            id="wm-size"
            label="Size"
            value={num(values, 'wmSize', 0.08, 0.02, 0.25)}
            min={0.02}
            max={0.25}
            step={0.005}
            readout={percent}
            onChange={(v) => setValue('wmSize', String(v))}
          />
        </>
      ) : (
        <>
          <div className="mb-3">
            <label className="option-title block" htmlFor="wm-logo">
              Logo
            </label>
            <input
              id="wm-logo"
              type="file"
              accept="image/png,image/jpeg"
              className="block w-full text-sm text-ink-2 file:mr-3 file:h-8 file:rounded file:border-0 file:bg-subtle file:px-3 file:text-sm file:text-ink-2"
              onChange={(event) => pickLogo(event.currentTarget)}
            />
          </div>
          {logoName ? (
            <Note>{logoName} will be stamped over every picture in the batch.</Note>
          ) : (
            <Note>A PNG with a transparent background sits over the picture best.</Note>
          )}
          <Slider
            id="wm-scale"
            label="Scale"
            value={num(values, 'wmScale', 0.2, 0.05, 0.6)}
            min={0.05}
            max={0.6}
            step={0.01}
            readout={percent}
            onChange={(v) => setValue('wmScale', String(v))}
          />
        </>
      )}

      <Slider
        id="wm-opacity"
        label="Opacity"
        value={num(values, 'wmOpacity', 0.35, 0.1, 1)}
        min={0.1}
        max={1}
        step={0.05}
        readout={percent}
        onChange={(v) => setValue('wmOpacity', String(v))}
      />

      <Slider
        id="wm-angle"
        label="Rotation"
        value={num(values, 'wmAngle', -30, -90, 90)}
        min={-90}
        max={90}
        step={1}
        readout={(v) => `${Math.round(v)} deg`}
        onChange={(v) => setValue('wmAngle', String(v))}
      />

      <SelectField
        id="wm-position"
        label="Position"
        value={str(values, 'wmPosition', 'center')}
        options={WM_POSITIONS}
        onChange={(v) => setValue('wmPosition', v)}
      />
    </div>
  );
}

export const watermarkImageTool: ToolImpl = {
  Panel: WatermarkPanel,

  /*
   * A watermark needs something to stamp. Without this the CTA stayed enabled,
   * did nothing, and printed its complaint inside the closed settings sheet —
   * which on a phone looks like a broken button.
   */
  isReady: ({ files, values }) => {
    if (!files.length) return false;
    const mode = str(values, 'wmMode', 'text') === 'image' ? 'image' : 'text';
    if (mode === 'image') return Boolean(str(values, 'wmLogo'));
    return shown(values, 'wmText', '').trim().length > 0;
  },

  async run({ files, values, setProgress, setStatus }) {
    const mode = str(values, 'wmMode', 'text') === 'image' ? 'image' : 'text';
    const text = shown(values, 'wmText', '').trim();
    const color = str(values, 'wmColor', '#ffffff');
    const size = num(values, 'wmSize', 0.08, 0.02, 0.25);
    const opacity = num(values, 'wmOpacity', 0.35, 0.1, 1);
    const angle = num(values, 'wmAngle', -30, -90, 90);
    const position = str(values, 'wmPosition', 'center') as WatermarkOptions['position'];
    const font = str(values, 'wmFont', WM_FONTS[0].value);
    const scale = num(values, 'wmScale', 0.2, 0.05, 0.6);

    let logo: Bitmap | null = null;
    if (mode === 'image') {
      logo = await logoFor(str(values, 'wmLogo'));
      if (!logo) throw new Error('Choose a PNG or JPG logo to stamp first.');
    } else if (!text) {
      throw new Error('Type the text you want to stamp first.');
    }

    const out: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Watermarking ${file.name}...`);
      const { bmp, width, height } = await decodeBlob(file.file);
      const canvas = flatten(bmp, width, height);
      const shorter = Math.min(width, height);

      watermark(canvas, {
        text,
        color,
        opacity,
        size,
        angle,
        position,
        font,
        /* Bold reads as a watermark over a photograph at the low default
           opacity; it is the weight iLoveIMG's own marks use. */
        bold: true,
        logo,
        /*
         * The engine scales a logo by its own pixels, which differs per file.
         * The panel asks for a share of the short edge, so that intent is
         * converted here where the picture's size is finally known.
         */
        logoScale: logo ? (scale * shorter) / bitmapWidth(logo) : 1,
      });

      const format = formatFor(file);
      const blob = await encode(canvas, format, 0.92);
      out.push(imageResult(blob, withSuffix(file.name, '_watermarked', FORMAT_EXT[format])));
      setProgress(((i + 1) / files.length) * 100);
    }

    return out;
  },
};

/* =============================================================== BLUR FACE */

/** A rectangle to hide, in fractions of the picture. */
interface BlurRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BLUR_REGIONS_KEY = 'blurRegions';

/** Detection results, keyed by picture and level, so a re-mount is free. */
const scanCache = new Map<string, BlurRegion[]>();

/** Keep a fraction inside 0..1. */
function unit(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/**
 * Read the region list out of field values.
 *
 * The rectangles live as JSON in a single string so they travel through the
 * same value bag as every other option, and so one set of areas can be applied
 * to a whole batch: they are relative, never pixel coordinates.
 */
function parseRegions(value: string | boolean | null | undefined): BlurRegion[] {
  if (typeof value !== 'string' || !value) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const out: BlurRegion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rect = item as Record<string, unknown>;
    const x = unit(Number(rect.x));
    const y = unit(Number(rect.y));
    /* A box that runs past the edge would be clamped by the engine anyway, but
       trimming it here keeps the sidebar readout honest. */
    const w = Math.min(unit(Number(rect.w)), 1 - x);
    const h = Math.min(unit(Number(rect.h)), 1 - y);
    if (w <= 0 || h <= 0) continue;
    out.push({ x, y, w, h });
  }
  return out;
}

function writeRegions(setValue: PanelProps['setValue'], regions: BlurRegion[]) {
  setValue(BLUR_REGIONS_KEY, regions.length ? JSON.stringify(regions) : '');
}

/** The rectangle spanned by two corners. */
function boxBetween(a: { x: number; y: number }, b: { x: number; y: number }): BlurRegion {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

/**
 * Object URL for a file the visitor picked, revoked when the file changes.
 *
 * The dependency is the underlying File, not the WorkFile: queueing a rotation
 * rebuilds the WorkFile object, and that must not tear the preview down.
 */
function useFileUrl(file: File | undefined): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) {
      setUrl('');
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

type BlurLevel = 'low' | 'recommended' | 'high';

/**
 * Row of equal chips.
 *
 * TileRow cannot carry these three labels: two of them are two words long, and
 * inside the 300px column they would push the row past the sidebar edge. These
 * chips shrink instead, wrapping their text inside their own share of the row.
 */
function ChipRow<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="mb-3 flex gap-2" role="radiogroup">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`min-w-0 flex-1 rounded-lg border px-0.5 py-2 text-[10px] leading-[14px] font-semibold ${
              active
                ? 'border-img bg-img-soft text-img-ink'
                : 'border-line bg-canvas text-muted hover:border-muted'
            }`}
          >
            <span className="block">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
/*
 * The reference prints these as "LOW DETECTION" / "RECOMMENDED" / "HIGH
 * DETECTION" in its 380px column. PaperSnap's options column is 300px wide, so
 * the shared word is dropped and the middle level is named for what it is
 * rather than for being the default.
 */
const BLUR_LEVELS: Array<{ value: BlurLevel; label: string }> = [
  { value: 'low', label: 'Strict' },
  { value: 'recommended', label: 'Standard' },
  { value: 'high', label: 'Broad' },
];

/** The skin test used at each detection level: strict, standard, permissive. */
const SKIN_RULES: Record<BlurLevel, (r: number, g: number, b: number) => boolean> = {
  low: (r, g, b) =>
    r > 110 && g > 55 && b > 30 && r - Math.min(g, b) > 22 && r > b && r > g,
  recommended: (r, g, b) =>
    r > 95 && g > 40 && b > 20 && Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
    Math.abs(r - g) > 15 && r > g && r > b,
  high: (r, g, b) =>
    r > 80 && g > 33 && b > 15 && Math.max(r, g, b) - Math.min(r, g, b) > 10 &&
    r - g > 8 && r > b,
};

/** How much the detected box is grown on every side, as a fraction of itself. */
const FACE_PADDING = 0.08;

/**
 * Find face-shaped patches by colour alone.
 *
 * A face detector proper needs a model file, which this tool will not download,
 * so the automatic pass leans on the one cue a photograph gives for free: skin
 * sits in a narrow band of the RGB range, and a face is a solid blob of it of a
 * plausible size and roughly square. That finds faces, hands and arms, which is
 * exactly the set of things a blur needs to cover, and it costs a single pass
 * over a downscaled copy of the picture.
 *
 * The result is a starting point, not an answer: the areas stay editable.
 */
function detectSkinRegions(
  img: Bitmap,
  width: number,
  height: number,
  level: BlurLevel,
): BlurRegion[] {
  /* Colour statistics survive a heavy downscale, and a small grid keeps the
     flood fill and the memory it needs trivial for a phone photo. */
  const scale = Math.min(1, 260 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const { ctx } = surface(w, h);
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const isSkin = SKIN_RULES[level];
  const mask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    mask[p] = isSkin(data[i], data[i + 1], data[i + 2]) ? 1 : 0;
  }

  /* A blob has to be big enough to be a face and small enough not to be the
     whole picture; the levels move that window rather than the colour test. */
  const total = w * h;
  const minArea = total * (level === 'low' ? 0.006 : level === 'high' ? 0.002 : 0.004);
  const maxArea = total * 0.25;

  const seen = new Uint8Array(w * h);
  const found: Array<BlurRegion & { area: number }> = [];
  const stack: number[] = [];

  for (let start = 0; start < total; start++) {
    if (!mask[start] || seen[start]) continue;

    let count = 0;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    stack.push(start);
    seen[start] = 1;

    while (stack.length) {
      const p = stack.pop() as number;
      const x = p % w;
      const y = (p - x) / w;
      count++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const push = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
        const np = ny * w + nx;
        if (seen[np] || !mask[np]) return;
        seen[np] = 1;
        stack.push(np);
      };
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }

    if (count < minArea || count > maxArea) continue;

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (bw < 3 || bh < 3) continue;
    const aspect = bw / bh;
    if (aspect < 0.4 || aspect > 2.5) continue;
    /* A face fills most of its own box; a stray warm patch does not. */
    if (count / (bw * bh) < 0.35) continue;

    const padX = bw * FACE_PADDING;
    const padY = bh * FACE_PADDING;
    const x = Math.max(0, (minX - padX) / w);
    const y = Math.max(0, (minY - padY) / h);
    found.push({
      x,
      y,
      w: Math.min(1 - x, (bw + padX * 2) / w),
      h: Math.min(1 - y, (bh + padY * 2) / h),
      area: count,
    });
  }

  return found
    .sort((a, b) => b.area - a.area)
    .slice(0, 12)
    .map(({ x, y, w: rw, h: rh }) => ({
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
      w: Math.round(rw * 1000) / 1000,
      h: Math.round(rh * 1000) / 1000,
    }));
}

function BlurPanel({ files, values, setValue }: PanelProps) {
  const regions = parseRegions(values[BLUR_REGIONS_KEY]);
  const mode = str(values, 'blurMode', 'auto') === 'custom' ? 'custom' : 'auto';
  const level = str(values, 'blurLevel', 'recommended') as BlurLevel;
  const first = files[0];
  const [scanning, setScanning] = useState(false);

  /*
   * Scan whenever the picture or the level changes. The results are cached per
   * file and level, so the second mount React makes in development costs
   * nothing and the effect stays free of any "have I already run" bookkeeping -
   * a guard here would leave the spinner up after a cancelled first pass.
   *
   * Editing an area by hand cannot retrigger a scan: the value bag is not a
   * dependency, only the picture and the level are.
   */
  useEffect(() => {
    if (mode !== 'auto' || !first) {
      setScanning(false);
      return;
    }

    const key = `${first.name}:${first.size}:${level}`;
    const cached = scanCache.get(key);
    if (cached) {
      writeRegions(setValue, cached);
      setScanning(false);
      return;
    }

    let cancelled = false;
    setScanning(true);
    void (async () => {
      let found: BlurRegion[] = [];
      try {
        const { bmp, width, height } = await decodeBlob(first.file);
        found = detectSkinRegions(bmp, width, height, level);
      } catch {
        /* An undecodable file is already reported on its card; an empty
           detection here simply leaves the picture to be marked by hand. */
        found = [];
      }
      scanCache.set(key, found);
      if (cancelled) return;
      writeRegions(setValue, found);
      setScanning(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, level, first, setValue]);

  const add = () => {
    /*
     * A default box gives the button something to do before the visitor has
     * touched the picture, and it lands where the previous one ended rather
     * than exactly on top of it, so repeated presses stay legible in the list.
     */
    const step = Math.min(0.3, regions.length * 0.05);
    writeRegions(setValue, [
      ...regions,
      { x: 0.35 + step, y: 0.38 + step, w: 0.3, h: 0.24 },
    ]);
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Kept to two sentences: a five-line callout pushes the mode switch off
          the first screenful of a laptop. */}
      <Info>
        Nothing is uploaded and no model is downloaded: detection looks for
        skin-tone patches on your device. Check the areas it marks and drag over
        anything it missed.
      </Info>

      {/* The CTA is disabled until an area exists; say so where it is read. */}
      {!regions.length ? (
        <Note>Drag over the picture, or press Add blur area, to enable the button.</Note>
      ) : null}

      <RadioCards
        name="blurMode"
        value={mode}
        onChange={(v) => setValue('blurMode', v)}
        options={[
          {
            value: 'auto',
            title: 'Automatic detection',
            body: 'Marks skin-tone areas of a plausible size for you.',
          },
          {
            value: 'custom',
            title: 'Customised detection',
            body: 'Start from nothing and drag your own areas.',
          },
        ]}
      />

      {mode === 'auto' && (
        <>
          <ChipRow value={level} onChange={(v) => setValue('blurLevel', v)} options={BLUR_LEVELS} />

        </>
      )}

      <div className="my-3">
        <TextField
          id="blur-strength"
          label="Blur strength (px)"
          type="number"
          min={2}
          max={80}
          placeholder="18"
          value={shown(values, 'blurStrength', '18')}
          onChange={(v) => setValue('blurStrength', v)}
        />
      </div>

      <div className="mb-3 flex gap-2">
        <ActionButton onClick={add}>Add blur area</ActionButton>
        <ActionButton onClick={() => writeRegions(setValue, [])}>Clear areas</ActionButton>
      </div>

      {scanning && <Note>Scanning the picture for faces...</Note>}

      {regions.length ? (
        <ul className="flex flex-col gap-2">
          {regions.map((rect, index) => (
            <li
              key={index}
              className="flex items-center justify-between gap-2 rounded-md border border-line bg-canvas px-2.5 py-1.5"
            >
              <span className="text-[13px] text-ink-2">
                Region {index + 1} - {percent(rect.w)} x {percent(rect.h)}
              </span>
              <button
                type="button"
                onClick={() => writeRegions(setValue, regions.filter((_, i) => i !== index))}
                className="shrink-0 text-[13px] font-medium text-muted hover:text-ink-2"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !scanning && (
          <Note>
            {mode === 'auto'
              ? 'No face-sized areas were found. Drag a box over the picture instead.'
              : 'Drag a box over the picture to add the first area.'}
          </Note>
        )
      )}
    </div>
  );
}

/**
 * The picture, at a comfortable size, with a drag-to-select overlay.
 *
 * The file cards are hidden for tools that own the work area, so this is the
 * only place the visitor sees the picture - it therefore has to be sharp, and
 * it is drawn from the file itself rather than the 127px card cover.
 */
function BlurWorkarea({ files, values, setValue }: WorkareaProps) {
  const file = files[0];
  const url = useFileUrl(file?.file);
  const regions = parseRegions(values[BLUR_REGIONS_KEY]);
  /*
   * The measured size is tied to the URL it was measured from: keeping only
   * the numbers would leave the frame sized for the previous picture until the
   * new one loads.
   */
  const [natural, setNatural] = useState<{ url: string; width: number; height: number } | null>(
    null,
  );
  const [draft, setDraft] = useState<BlurRegion | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  if (!file) return null;

  /*
   * Fit inside the canvas column, but never enlarge a small picture: the
   * overlay is only as accurate as the pixels under it. The card's own pixel
   * size is used until the preview has loaded, so the frame does not start at
   * full width and then jump.
   */
  const measured = natural && natural.url === url ? natural : null;
  const source =
    measured ?? (file.width && file.height ? { width: file.width, height: file.height } : null);
  const box = source ? fitInside(source.width, source.height, 760, 520) : null;

  const pointOf = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: unit((event.clientX - rect.left) / rect.width),
      y: unit((event.clientY - rect.top) / rect.height),
    };
  };

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const p = pointOf(event);
    origin.current = p;
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Pointer capture is best-effort; the drag still works without it. */
    }
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = origin.current;
    if (!start) return;
    setDraft(boxBetween(start, pointOf(event)));
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = origin.current;
    origin.current = null;
    setDraft(null);
    if (!start) return;
    const rect = boxBetween(start, pointOf(event));
    /* A plain click is not a region: a box the visitor cannot see would only
       sit in the list getting in the way. */
    if (rect.w < 0.02 || rect.h < 0.02) return;
    writeRegions(setValue, [...regions, rect]);
  };

  const cancel = () => {
    origin.current = null;
    setDraft(null);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative select-none overflow-hidden rounded-lg border border-line bg-surface shadow-card"
        style={{
          width: box ? box.width : undefined,
          maxWidth: '100%',
          minHeight: box ? box.height : undefined,
          cursor: 'crosshair',
          touchAction: 'none',
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={cancel}
      >
        <img
          /* Empty until the object URL exists: a bare src="" would fire a
             request for the page itself. */
          src={url || undefined}
          alt={`Preview of ${file.name}`}
          draggable={false}
          className="block h-auto w-full select-none"
          onLoad={(event) =>
            setNatural({
              url,
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
        />

        {regions.map((rect, index) => (
          <div
            key={index}
            className="pointer-events-none absolute rounded-[3px] border-2 border-white/90 bg-img/25"
            style={{
              left: percent(rect.x),
              top: percent(rect.y),
              width: percent(rect.w),
              height: percent(rect.h),
              boxShadow: '0 0 0 1px rgb(0 0 0 / 0.35)',
            }}
          >
            <span className="absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full bg-img text-[11px] font-medium text-white">
              {index + 1}
            </span>
          </div>
        ))}

        {draft && (
          <div
            className="pointer-events-none absolute rounded-[3px] border-2 border-dashed border-img bg-img/15"
            style={{
              left: percent(draft.x),
              top: percent(draft.y),
              width: percent(draft.w),
              height: percent(draft.h),
            }}
          />
        )}
      </div>

      <p className="text-sm leading-[18px] text-muted">
        {regions.length
          ? `${regions.length} area${regions.length === 1 ? '' : 's'} will be blurred in this picture and in every other file in the batch.`
          : 'Drag over the picture to mark an area to hide.'}
      </p>
    </div>
  );
}

export const blurFaceTool: ToolImpl = {
  Panel: BlurPanel,
  Workarea: BlurWorkarea,

  /*
   * Blurring nothing is not a job. The panel explains how to mark an area, and
   * the CTA stays disabled until one exists, rather than failing silently.
   */
  isReady: ({ files, values }) =>
    files.length > 0 && parseRegions(values[BLUR_REGIONS_KEY]).length > 0,

  async run({ files, values, setProgress, setStatus }) {
    const regions = parseRegions(values[BLUR_REGIONS_KEY]);
    const radius = num(values, 'blurStrength', 18, 2, 80);
    if (!regions.length) throw new Error('Mark at least one area to blur first.');

    const out: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Blurring ${file.name}...`);
      const { bmp, width, height } = await decodeBlob(file.file);
      const canvas = flatten(bmp, width, height);

      for (const region of regions) {
        blurRect(
          canvas,
          {
            x: region.x * width,
            y: region.y * height,
            w: region.w * width,
            h: region.h * height,
          },
          radius,
        );
      }

      const format = formatFor(file);
      const blob = await encode(canvas, format, 0.92);
      out.push(imageResult(blob, withSuffix(file.name, '_blurred', FORMAT_EXT[format])));
      setProgress(((i + 1) / files.length) * 100);
    }

    return out;
  },
};

/* ========================================================= REMOVE BACKGROUND */

function RemoveBgPanel({ values, setValue }: PanelProps) {
  const transparent = flag(values, 'bgTransparent', true);
  return (
    <div className="flex flex-col gap-1">
      <Info>
        The background is detected from the colours around the edges of the
        picture.
      </Info>

      <Label>Tolerance</Label>
      <RadioCards
        name="bgTolerance"
        value={str(values, 'bgTolerance', '34')}
        onChange={(v) => setValue('bgTolerance', v)}
        options={[
          { value: '18', title: 'Low', body: 'Cuts only the closest colours, so faint edges survive' },
          { value: '34', title: 'Medium', body: 'Right for most product shots and studio backdrops' },
          { value: '60', title: 'High', body: 'Cuts more, at the risk of eating into the subject' },
        ]}
      />

      <CheckboxField
        label="Keep it transparent"
        checked={transparent}
        onChange={(v) => setValue('bgTransparent', v)}
      />

      <ColorField
        label="Replace with"
        value={str(values, 'bgColor', '#ffffff')}
        onChange={(v) => setValue('bgColor', v)}
      />

      <Note>
        {transparent
          ? 'The cut-out is saved as a PNG so the empty areas stay empty.'
          : 'The cut-out is drawn on the colour above, so the result is a JPG.'}
      </Note>
    </div>
  );
}

export const removeBgTool: ToolImpl = {
  Panel: RemoveBgPanel,

  async run({ files, values, setProgress, setStatus }) {
    const tolerance = num(values, 'bgTolerance', 34, 0, 120);
    const transparent = flag(values, 'bgTransparent', true);
    const color = str(values, 'bgColor', '#ffffff');
    const out: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Removing the background from ${file.name}...`);
      const { bmp, width, height } = await decodeBlob(file.file);

      /* removeBackground reads and writes the canvas in place, so the pixels
         are copied onto a fresh surface first rather than mutating a bitmap. */
      const cut = flatten(bmp, width, height);
      removeBackground(cut, tolerance);

      const blob = transparent
        ? await encode(cut, 'png')
        /* The chosen colour has to be laid down before JPEG flattens the
           transparency onto white, or the colour would be lost. */
        : await encode(flatten(cut, width, height, color), 'jpg', 0.92);

      out.push(imageResult(blob, withSuffix(file.name, '_no_bg', transparent ? 'png' : 'jpg')));
      setProgress(((i + 1) / files.length) * 100);
    }

    return out;
  },
};