/**
 * Stamping tools: a drawn signature (captured on a React canvas pad) and a
 * text/image watermark. Both draw with pdf-lib directly onto the existing
 * pages, so the original content stays untouched underneath.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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

/* ------------------------------------------------------------------ helpers */

const INPUT =
  'h-8 w-full rounded border border-muted bg-surface px-3 text-sm text-ink focus:outline-none focus:border-ink';

const SMALL_BUTTON =
  'inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 hover:border-ink-2 hover:bg-canvas';

function text(values: FieldValues, name: string, fallback = ''): string {
  const v = values[name];
  return typeof v === 'string' && v ? v : fallback;
}

/**
 * Panel-side read that keeps an empty string: a field the user cleared must stay
 * cleared while they retype, so only a genuinely absent value falls back.
 */
function rawText(values: FieldValues, name: string, fallback = ''): string {
  const v = values[name];
  return typeof v === 'string' ? v : fallback;
}

/** Data URL payload as bytes, for embedding an image the panel captured. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const raw = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function RadioCards({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: Array<{ value: string; title: string; body: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((option) => {
        const selected = value === option.value;
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
              name={name}
              className="sr-only"
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
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
  );
}

/* ============================ SIGNATURE PAD ============================ */

const SIGN_PAD_WIDTH = 280;
const SIGN_PAD_HEIGHT = 140;

/**
 * Draw-your-signature canvas.
 *
 * The strokes live only in the canvas bitmap; the panel's job is to hand the
 * finished drawing to `run` as a PNG data URL in field values, so execution
 * never needs to reach back into the DOM.
 */
function SignaturePad({
  signature,
  onChange,
}: {
  signature: string;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const hasStrokesRef = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  /*
   * The bitmap is not part of `values`, so remounting the panel (a tool reset,
   * for instance) would blank the pad while the captured PNG still lives in
   * field values. Repaint it once from there so what the user sees matches
   * what `run` will stamp.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* Start from white paper so the canvas never reflects the UI theme. */
    paintSheet(ctx, canvas.width, canvas.height);

    if (!signature) return;
    const img = new Image();
    img.onload = () => {
      paintSheet(ctx, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      hasStrokesRef.current = true;
      setHasStrokes(true);
    };
    img.src = signature;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Pointer coordinates are in CSS pixels; scale them into the bitmap so the
   * drawing lines up at any display width. */
  const pointOf = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = ev.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) * (canvas.width / rect.width),
      y: (ev.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const strokeSettings = (ctx: CanvasRenderingContext2D) => {
    /*
     * The pad mirrors what will be stamped onto the page: dark ink on white
     * paper. It must not follow the UI theme — in dark mode a themed canvas
     * background made the near-black stroke invisible.
     */
    ctx.strokeStyle = '#1b1b1f';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  /** Paint the white sheet the signature is drawn on. */
  const paintSheet = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  };

  const commit = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokesRef.current) {
      onChange(null);
      return;
    }
    onChange(canvas.toDataURL('image/png'));
  };

  const handleDown = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    ev.preventDefault();
    const canvas = ev.currentTarget;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawingRef.current = true;
    lastRef.current = pointOf(ev);
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch {
      /* Pointer capture is best-effort; drawing still works without it. */
    }

    strokeSettings(ctx);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    /* A dot on tap: a zero-length line is not rendered. */
    ctx.lineTo(lastRef.current.x + 0.01, lastRef.current.y + 0.01);
    ctx.stroke();

    hasStrokesRef.current = true;
    setHasStrokes(true);
  };

  const handleMove = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastRef.current) return;
    ev.preventDefault();
    const ctx = ev.currentTarget.getContext('2d');
    if (!ctx) return;

    const p = pointOf(ev);
    strokeSettings(ctx);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  };

  const stop = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    commit();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) paintSheet(ctx, canvas.width, canvas.height);
    drawingRef.current = false;
    lastRef.current = null;
    hasStrokesRef.current = false;
    setHasStrokes(false);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={SIGN_PAD_WIDTH}
        height={SIGN_PAD_HEIGHT}
        /* bg-white is deliberate: this is the paper the signature is drawn on,
           and it matches the image that gets stamped into the PDF. */
        className="block h-auto w-full cursor-crosshair rounded-lg border border-line bg-white"
        style={{ touchAction: 'none' }}
        role="img"
        aria-label="Signature drawing area"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <button type="button" className={SMALL_BUTTON} onClick={clear}>
          Clear
        </button>
        <span className="text-right text-[12px] leading-4 text-muted">
          {hasStrokes || signature ? 'Signature captured' : 'Draw in the box above'}
        </span>
      </div>
    </div>
  );
}

/* ============================ SIGN PDF ============================ */

const SIGN_WHERE = [
  { value: 'last', title: 'Last page', body: 'Sign the end of the document.' },
  { value: 'every', title: 'Every page', body: 'Repeat on all pages.' },
  { value: 'first', title: 'First page', body: 'Sign the cover page.' },
];

function SignPanel({ values, setValue }: PanelProps) {
  return (
    <>
      <div className="info-box">
        Draw your signature with the mouse, a finger or a stylus, then stamp it on
        the document.
      </div>

      <div className="option-title">Signature</div>
      <SignaturePad
        signature={text(values, 'signature')}
        onChange={(dataUrl) => setValue('signature', dataUrl)}
      />

      <div className="mt-4">
        <label className="option-title" htmlFor="sign-name">
          Signer name
        </label>
        <input
          id="sign-name"
          type="text"
          className={INPUT}
          value={rawText(values, 'sign_name')}
          onChange={(e) => setValue('sign_name', e.target.value)}
        />
      </div>

      <div className="mt-4">
        <div className="option-title">Place on</div>
        <RadioCards
          name="sign_where"
          value={text(values, 'sign_where', 'last')}
          options={SIGN_WHERE}
          onChange={(v) => setValue('sign_where', v)}
        />
      </div>

      <div className="mt-4">
        <label className="option-title" htmlFor="sign-y">
          Y position %
        </label>
        <input
          id="sign-y"
          type="number"
          min={0}
          max={100}
          className={INPUT}
          value={rawText(values, 'sign_y', '12')}
          onChange={(e) => setValue('sign_y', e.target.value)}
        />
      </div>
    </>
  );
}

export const signTool: ToolImpl = {
  Panel: SignPanel,

  run: async ({ files, values, setProgress, setStatus }) => {
    const name = text(values, 'sign_name').trim();
    const where = text(values, 'sign_where', 'last');
    const yPct = Math.min(100, Math.max(0, parseFloat(text(values, 'sign_y')) || 12));
    const signature = text(values, 'signature');

    if (!signature && !name) {
      throw new Error('Draw a signature or type a signer name first.');
    }

    const png = signature ? dataUrlToBytes(signature) : null;
    const date = new Date().toLocaleDateString();
    const results: ResultFile[] = [];

    for (const f of files) {
      setStatus(`Signing ${f.name}…`);
      const doc = await loadPdf(await bytesFor(f));
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const image = png ? await doc.embedPng(png) : null;
      const pages = doc.getPages();

      const targets =
        where === 'every'
          ? pages.map((_, i) => i)
          : where === 'first'
            ? [0]
            : [pages.length - 1];

      for (const idx of targets) {
        if (idx < 0 || idx >= pages.length) continue;
        const page = pages[idx];
        const { width, height } = page.getSize();
        const baseY = (yPct / 100) * height;

        if (image) {
          const w = Math.min(width * 0.34, 190);
          const h = (image.height / image.width) * w;
          page.drawImage(image, { x: 48, y: baseY, width: w, height: h });
        }

        const label = [name, date].filter(Boolean).join('  ·  ');
        if (label) {
          page.drawText(label, {
            x: 48,
            y: Math.max(6, baseY - 14),
            size: 10,
            font,
            color: rgb(0.25, 0.25, 0.3),
          });
        }

        page.drawLine({
          start: { x: 48, y: Math.max(4, baseY - 6) },
          end: { x: 48 + Math.min(width * 0.34, 190), y: Math.max(4, baseY - 6) },
          thickness: 0.7,
          color: rgb(0.6, 0.6, 0.64),
        });
      }

      const bytes = await doc.save();
      results.push(pdfResult(bytes, `${baseName(f.name)}_signed.pdf`));
      setProgress((results.length / files.length) * 100);
    }

    return results;
  },
};

/* ============================ WATERMARK ============================ */

const WM_POSITIONS = [
  { value: 'center', title: 'Center', body: 'One mark in the middle of the page.' },
  { value: 'diagonal', title: 'Diagonal', body: 'A single rotated mark across the page.' },
  { value: 'tile', title: 'Tiled', body: 'Repeat the mark over the whole page.' },
];

function WatermarkPanel({ values, setValue }: PanelProps) {
  const type = text(values, 'wm_type', 'text');

  const pickImage = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) {
      setValue('wm_image', null);
      return;
    }
    /* Field values are serialisable, so the image is carried as a data URL. */
    const reader = new FileReader();
    reader.onload = () => setValue('wm_image', typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  return (
    <>
      <div className="option-title">Type</div>
      <RadioCards
        name="wm_type"
        value={type}
        options={[
          { value: 'text', title: 'Text', body: 'Stamp a caption across the page.' },
          { value: 'image', title: 'Image', body: 'Stamp a PNG or JPG logo.' },
        ]}
        onChange={(v) => setValue('wm_type', v)}
      />

      {type === 'text' ? (
        <div className="mt-4">
          <label className="option-title" htmlFor="wm-text">
            Text
          </label>
          <input
            id="wm-text"
            type="text"
            className={INPUT}
            value={rawText(values, 'wm_text', 'CONFIDENTIAL')}
            onChange={(e) => setValue('wm_text', e.target.value)}
          />
        </div>
      ) : (
        <div className="mt-4">
          <label className="option-title" htmlFor="wm-file">
            Image
          </label>
          <input
            id="wm-file"
            type="file"
            accept="image/png,image/jpeg"
            className="block w-full text-sm text-ink-2 file:mr-3 file:h-8 file:rounded file:border-0 file:bg-subtle file:px-3 file:text-sm file:text-ink-2"
            onChange={(e) => pickImage(e.currentTarget)}
          />
        </div>
      )}

      <div className="mt-4">
        <div className="option-title">Position</div>
        <RadioCards
          name="wm_pos"
          value={text(values, 'wm_pos', 'center')}
          options={WM_POSITIONS}
          onChange={(v) => setValue('wm_pos', v)}
        />
      </div>

      <div className="mt-4 flex gap-3">
        <div className="flex-1">
          <label className="option-title" htmlFor="wm-size">
            Size
          </label>
          <input
            id="wm-size"
            type="number"
            min={8}
            max={200}
            className={INPUT}
            value={rawText(values, 'wm_size', '48')}
            onChange={(e) => setValue('wm_size', e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="option-title" htmlFor="wm-opacity">
            Opacity %
          </label>
          <input
            id="wm-opacity"
            type="number"
            min={1}
            max={100}
            className={INPUT}
            value={rawText(values, 'wm_opacity', '18')}
            onChange={(e) => setValue('wm_opacity', e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="option-title" htmlFor="wm-colour">
          Colour
        </label>
        <input
          id="wm-colour"
          type="color"
          className="h-8 w-14 rounded border border-muted bg-surface"
          value={rawText(values, 'wm_color', '#e5322d')}
          onChange={(e) => setValue('wm_color', e.target.value)}
        />
      </div>
    </>
  );
}

export const watermarkTool: ToolImpl = {
  Panel: WatermarkPanel,

  run: async ({ files, values, setProgress }) => {
    const type = text(values, 'wm_type', 'text');
    const pos = text(values, 'wm_pos', 'center');
    const size = Math.max(8, parseFloat(text(values, 'wm_size')) || 48);
    const opacity = Math.min(100, Math.max(1, parseFloat(text(values, 'wm_opacity')) || 18)) / 100;
    const colour = hexToRgb(text(values, 'wm_color', '#e5322d'));
    const label = text(values, 'wm_text', 'CONFIDENTIAL');
    const imageData = text(values, 'wm_image');

    if (type === 'image' && !imageData) {
      throw new Error('Choose an image to use as the watermark.');
    }

    const imageBytes = type === 'image' ? dataUrlToBytes(imageData) : null;
    const isPng = imageData.startsWith('data:image/png');
    const results: ResultFile[] = [];

    for (const f of files) {
      const doc = await loadPdf(await bytesFor(f));
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      let image: Awaited<ReturnType<typeof doc.embedPng>> | null = null;

      if (imageBytes) {
        try {
          image = isPng ? await doc.embedPng(imageBytes) : await doc.embedJpg(imageBytes);
        } catch {
          throw new Error('That image could not be embedded. Use a PNG or JPG file.');
        }
      }

      for (const page of doc.getPages()) {
        const { width, height } = page.getSize();

        /* Every position reduction ends up here: draw the image or the text
         * centred on (x, y), optionally rotated. */
        const draw = (x: number, y: number, rotate: number) => {
          if (image) {
            const w = size * 4;
            const h = (image.height / image.width) * w;
            page.drawImage(image, {
              x: x - w / 2,
              y: y - h / 2,
              width: w,
              height: h,
              opacity,
              rotate: degrees(rotate),
            });
            return;
          }
          const w = font.widthOfTextAtSize(label, size);
          page.drawText(label, {
            x: x - (rotate ? w / 2 : 0),
            y: y - size / 2,
            size,
            font,
            color: rgb(colour.r, colour.g, colour.b),
            opacity,
            rotate: degrees(rotate),
          });
        };

        if (pos === 'center') {
          const w = image ? size * 4 : font.widthOfTextAtSize(label, size);
          draw((width - w) / 2 + w / 2, height / 2, 0);
        } else if (pos === 'diagonal') {
          draw(width / 2, height / 2, 45);
        } else {
          const stepX = width / 2.2;
          const stepY = height / 5;
          for (let y = stepY; y < height; y += stepY) {
            for (let x = stepX; x < width; x += stepX) draw(x, y, 30);
          }
        }
      }

      const bytes = await doc.save();
      results.push(pdfResult(bytes, `${baseName(f.name)}_watermarked.pdf`));
      setProgress((results.length / files.length) * 100);
    }

    return results;
  },
};
