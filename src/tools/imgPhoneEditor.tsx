/**
 * Photo editor: a full-screen, tabbed editor for one picture.
 *
 * The layout follows iLoveIMG's editor - a rail of tabs on the left, the picture
 * in the middle, the active tab's controls on the right - but the edits are not
 * burnt into the preview. Every operation is recorded as a small serialisable
 * op, the preview replays that list onto a canvas whenever it changes, and run()
 * replays the same list against the bytes of the original file. That is what
 * makes the saved file match what the visitor saw rather than being a screenshot
 * of it. Nothing is uploaded: the picture is decoded from its File and written
 * back out as a Blob.
 */
import { useEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  NEUTRAL,
  applyAdjustments,
  crop,
  decodeBlob,
  decodeBytes,
  encode,
  flatten,
  resize,
  surface,
  transform,
  withSuffix,
  FORMAT_EXT,
  type Bitmap,
  type OutFormat,
} from '@/lib/image';
import type { FieldValues, PanelProps, ResultFile, ToolImpl, WorkFile, WorkareaProps } from '@/types';
import {
  ActionButton,
  CheckboxField,
  Info,
  Label,
  Note,
  RadioCards,
  SelectField,
} from '@/components/controls';

/* ------------------------------------------------------------------ shared */

/** Read a string option, falling back when it is absent or empty. */
function str(values: FieldValues, name: string, fallback = ''): string {
  const v = values[name];
  return typeof v === 'string' && v !== '' ? v : fallback;
}

/** Read a number option, clamped, with a fallback. */
function num(values: FieldValues, name: string, fallback: number, min: number, max: number): number {
  const raw = values[name];
  const n = typeof raw === 'string' ? parseFloat(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Keep a fraction inside the picture. */
function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/** Where the recorded op list lives in the sidebar's value bag. */
const OPS_KEY = 'editorOps';

/**
 * The long edge, in editor units, that every recorded length is expressed
 * against.
 *
 * The preview runs on a reduced copy of the picture and the export runs on the
 * full-size one, so anything that has to line up between the two - brush width,
 * text size, border thickness - is stored against this edge and multiplied back
 * up when the op is replayed.
 */
const UNIT_EDGE = 1000;

/** Pixels per editor unit on a canvas of this size. */
function unitScale(width: number, height: number): number {
  return UNIT_EDGE / Math.max(1, Math.max(width, height));
}

/**
 * The longest edge the preview is built at.
 *
 * A 40 MP phone photo repainted on every slider step would make the editor
 * crawl. The cap only affects the preview: the ops are relative, so the saved
 * file is still produced from the original pixels.
 */
const PREVIEW_EDGE = 1400;

/* --------------------------------------------------------------- the ops */

type FrameStyle = 'none' | 'thin' | 'thick' | 'rounded' | 'polaroid' | 'dashed';
type ShapeKind = 'rect' | 'ellipse' | 'line';
type MergeLayout = 'side' | 'stack' | 'overlay';

/**
 * One recorded edit.
 *
 * Positions are fractions of the picture and lengths are editor units, so an
 * op means the same thing on the reduced preview as it does on the original.
 * The two exceptions are called out where they appear.
 */
type Op =
  | {
      kind: 'adjust';
      brightness: number;
      contrast: number;
      saturation: number;
      warmth: number;
      grayscale: number;
      sepia: number;
    }
  /* Absolute pixels by design: RESIZE asks for a size, not a proportion. */
  | { kind: 'resize'; width: number; height: number }
  | { kind: 'crop'; x: number; y: number; w: number; h: number }
  | { kind: 'rotate'; quarter: 1 | -1 }
  | { kind: 'flip'; axis: 'h' | 'v' }
  | { kind: 'tilt'; angle: number }
  | { kind: 'brush'; color: string; size: number; points: number[] }
  | {
      kind: 'text';
      text: string;
      font: string;
      size: number;
      color: string;
      bold: boolean;
      italic: boolean;
      x: number;
      y: number;
    }
  | {
      kind: 'shape';
      shape: ShapeKind;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      stroke: number;
      fill: boolean;
    }
  | { kind: 'sticker'; glyph: string; size: number; x: number; y: number }
  | { kind: 'frame'; style: FrameStyle; color: string }
  | { kind: 'corners'; radius: number }
  | { kind: 'background'; color: string; margin: number }
  | { kind: 'merge'; src: string; layout: MergeLayout; scale: number };

type TextOp = Extract<Op, { kind: 'text' }>;
type ShapeOp = Extract<Op, { kind: 'shape' }>;
type BrushOp = Extract<Op, { kind: 'brush' }>;

/** Ops that a tab keeps editing in place instead of stacking a new copy. */
type SlotName = 'adjust' | 'frame' | 'corners' | 'background' | 'merge';

type Slots = Record<SlotName, number>;

const EMPTY_SLOTS: Slots = { adjust: -1, frame: -1, corners: -1, background: -1, merge: -1 };

/**
 * Extra pictures chosen for MERGE.
 *
 * Field values have to stay serialisable, so the op carries a token and the
 * decoded bitmap lives here, next to it. The map is module-level because both
 * the preview and run() need the same pixels.
 */
const mergeSources = new Map<string, Bitmap>();

function sourceKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/** Decode a merge picture once and return the token that refers to it. */
async function keepSource(file: File): Promise<string> {
  const key = sourceKey(file);
  if (!mergeSources.has(key)) {
    const { bmp } = await decodeBlob(file);
    mergeSources.set(key, bmp);
  }
  return key;
}

/**
 * A picture opened from the editor's own top bar.
 *
 * The page owns the file list and a work area cannot write to it, so the editor
 * keeps the swapped picture here instead. It is stamped with the upload it
 * belongs to, and the work area clears it on the way out, so a picture opened in
 * one visit can never be picked up by the next.
 */
let swapped: { uploadId: number; entry: WorkFile } | null = null;

/** Width of a decoded bitmap, whichever kind of source it came from. */
function bitmapWidth(img: Bitmap): number {
  return (img as ImageBitmap).width || (img as HTMLImageElement).naturalWidth || 1;
}

function bitmapHeight(img: Bitmap): number {
  return (img as ImageBitmap).height || (img as HTMLImageElement).naturalHeight || 1;
}

/* ------------------------------------------------------------ the drawing */

/** Copy a canvas so an op can paint on it without spoiling the pristine base. */
function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, ctx } = surface(source.width, source.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/** A rounded-rectangle path, drawn by hand because older Safari lacks roundRect. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/**
 * Brush a recorded stroke onto a canvas.
 *
 * Points are fractions of the picture, so they scale with the canvas; the brush
 * width is a length in editor units, so it scales with k. Keeping those two
 * apart is what makes a stroke painted on the preview land in the same place at
 * the same relative thickness in the export.
 */
function paintBrush(
  ctx: CanvasRenderingContext2D,
  op: BrushOp,
  width: number,
  height: number,
  k: number,
) {
  const pts = op.points;
  if (pts.length < 2) return;
  const strokeWidth = Math.max(1, op.size * k);
  const px = (i: number) => pts[i] * width;
  const py = (i: number) => pts[i] * height;
  ctx.save();
  ctx.strokeStyle = op.color;
  ctx.fillStyle = op.color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 2) {
    /* A tap is a dot: a zero-length path is left unstroked by some browsers. */
    ctx.beginPath();
    ctx.arc(px(0), py(1), strokeWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(px(0), py(1));
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(px(i), py(i + 1));
    ctx.stroke();
  }
  ctx.restore();
}

/** Lay a text layer onto a canvas. */
function paintText(
  ctx: CanvasRenderingContext2D,
  op: TextOp,
  width: number,
  height: number,
  k: number,
) {
  const px = Math.max(6, Math.round(op.size * k));
  ctx.save();
  ctx.fillStyle = op.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${op.italic ? 'italic ' : ''}${op.bold ? '700' : '400'} ${px}px ${op.font}`;
  /* Split on real newlines so a multi-line caption keeps its breaks. */
  const lines = op.text.split(/\r?\n/);
  const step = px * 1.25;
  const cx = op.x * width;
  const cy = op.y * height;
  lines.forEach((line, i) => {
    ctx.fillText(line, cx, cy + (i - (lines.length - 1) / 2) * step);
  });
  ctx.restore();
}

/** Draw a dragged shape, in the same two units the brush uses. */
function paintShape(
  ctx: CanvasRenderingContext2D,
  op: ShapeOp,
  width: number,
  height: number,
  k: number,
) {
  const x1 = op.x1 * width;
  const y1 = op.y1 * height;
  const x2 = op.x2 * width;
  const y2 = op.y2 * height;
  ctx.save();
  ctx.strokeStyle = op.color;
  ctx.fillStyle = op.color;
  ctx.lineWidth = Math.max(1, op.stroke * k);
  ctx.lineCap = 'round';
  if (op.shape === 'line') {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    if (op.shape === 'rect') {
      ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else {
      ctx.ellipse(
        (x1 + x2) / 2,
        (y1 + y2) / 2,
        Math.max(0.5, Math.abs(x2 - x1) / 2),
        Math.max(0.5, Math.abs(y2 - y1) / 2),
        0,
        0,
        Math.PI * 2,
      );
    }
    if (op.fill) ctx.fill();
    else ctx.stroke();
  }
  ctx.restore();
}

/** Paint one of the six border treatments, returning a new canvas when it grows. */
function paintFrame(
  canvas: HTMLCanvasElement,
  style: FrameStyle,
  color: string,
): HTMLCanvasElement {
  if (style === 'none') return canvas;
  const w = canvas.width;
  const h = canvas.height;
  const short = Math.min(w, h);
  const ink = color || '#ffffff';
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  if (style === 'rounded') {
    /* A rounded frame has to cut the corners away, which means transparency
       rather than paint - the checkerboard shows through, exactly as it does
       in the reference. */
    const { canvas: out, ctx: octx } = surface(w, h);
    octx.drawImage(canvas, 0, 0);
    octx.globalCompositeOperation = 'destination-in';
    roundRectPath(octx, 0, 0, w, h, short * 0.07);
    octx.fill();
    return out;
  }

  if (style === 'polaroid') {
    /* The classic print: an even margin with a deep shelf at the foot. */
    const side = Math.round(short * 0.05);
    const top = side;
    const bottom = Math.round(short * 0.18);
    const { canvas: out, ctx: octx } = surface(w + side * 2, h + top + bottom);
    octx.fillStyle = ink;
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, side, top);
    return out;
  }

  const width = style === 'thin' ? Math.max(2, short * 0.012) : Math.max(4, short * 0.05);
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = width;
  if (style === 'dashed') {
    const inset = Math.max(width, short * 0.05);
    ctx.setLineDash([width * 2, width * 1.4]);
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  } else {
    ctx.strokeRect(width / 2, width / 2, w - width, h - width);
  }
  ctx.restore();
  return canvas;
}

/** Fill the frame behind the picture, optionally with a margin around it. */
function paintBackground(canvas: HTMLCanvasElement, color: string, margin: number): HTMLCanvasElement {
  const pad = Math.max(0, Math.min(0.45, margin));
  const x = Math.round(canvas.width * pad);
  const y = Math.round(canvas.height * pad);
  const { canvas: out, ctx } = surface(canvas.width + x * 2, canvas.height + y * 2);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, x, y);
  return out;
}

/** Composite the second picture chosen for MERGE. */
function paintMerge(canvas: HTMLCanvasElement, op: Extract<Op, { kind: 'merge' }>): HTMLCanvasElement {
  const extra = mergeSources.get(op.src);
  if (!extra) return canvas;
  const ew = bitmapWidth(extra);
  const eh = bitmapHeight(extra);

  if (op.layout === 'side') {
    const scale = canvas.height / eh;
    const w = Math.max(1, Math.round(ew * scale));
    const { canvas: out, ctx } = surface(canvas.width + w, canvas.height);
    ctx.drawImage(canvas, 0, 0);
    ctx.drawImage(extra as CanvasImageSource, canvas.width, 0, w, canvas.height);
    return out;
  }

  if (op.layout === 'stack') {
    const scale = canvas.width / ew;
    const h = Math.max(1, Math.round(eh * scale));
    const { canvas: out, ctx } = surface(canvas.width, canvas.height + h);
    ctx.drawImage(canvas, 0, 0);
    ctx.drawImage(extra as CanvasImageSource, 0, canvas.height, canvas.width, h);
    return out;
  }

  /* Overlay puts the second picture in the bottom-right corner, where a badge
     or a signature usually sits. */
  const { canvas: out, ctx } = surface(canvas.width, canvas.height);
  ctx.drawImage(canvas, 0, 0);
  const share = Math.max(0.1, Math.min(0.9, op.scale));
  const w = canvas.width * share;
  const h = (eh / ew) * w;
  const pad = Math.min(canvas.width, canvas.height) * 0.04;
  ctx.drawImage(extra as CanvasImageSource, canvas.width - w - pad, canvas.height - h - pad, w, h);
  return out;
}

/** Apply a single op, returning the canvas the next one should read. */
function applyOp(canvas: HTMLCanvasElement, op: Op): HTMLCanvasElement {
  switch (op.kind) {
    case 'adjust':
      return applyAdjustments(canvas, {
        ...NEUTRAL,
        brightness: op.brightness,
        contrast: op.contrast,
        saturation: op.saturation,
        warmth: op.warmth,
        grayscale: op.grayscale,
        sepia: op.sepia,
      });

    case 'resize':
      return resize(canvas, Math.max(1, op.width), Math.max(1, op.height));

    case 'crop': {
      const w = Math.max(1, Math.round(op.w * canvas.width));
      const h = Math.max(1, Math.round(op.h * canvas.height));
      const x = Math.max(0, Math.min(canvas.width - w, Math.round(op.x * canvas.width)));
      const y = Math.max(0, Math.min(canvas.height - h, Math.round(op.y * canvas.height)));
      return crop(canvas, { x, y, w, h });
    }

    case 'rotate':
      return transform(canvas, canvas.width, canvas.height, {
        rotate: op.quarter === 1 ? 90 : 270,
      });

    case 'flip':
      return transform(canvas, canvas.width, canvas.height, {
        flipH: op.axis === 'h',
        flipV: op.axis === 'v',
      });

    case 'tilt': {
      /* A free angle has to grow the canvas, or the corners of the picture are
         cut off. The wedges it leaves behind stay transparent. */
      const rad = (op.angle * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const w = Math.round(canvas.width * cos + canvas.height * sin);
      const h = Math.round(canvas.width * sin + canvas.height * cos);
      const { canvas: out, ctx } = surface(w, h);
      ctx.translate(w / 2, h / 2);
      ctx.rotate(rad);
      ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
      return out;
    }

    case 'brush': {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        paintBrush(
          ctx,
          op,
          canvas.width,
          canvas.height,
          unitScale(canvas.width, canvas.height),
        );
      }
      return canvas;
    }

    case 'text': {
      const ctx = canvas.getContext('2d');
      if (ctx) paintText(ctx, op, canvas.width, canvas.height, unitScale(canvas.width, canvas.height));
      return canvas;
    }

    case 'shape': {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        paintShape(
          ctx,
          op,
          canvas.width,
          canvas.height,
          unitScale(canvas.width, canvas.height),
        );
      }
      return canvas;
    }

    case 'sticker': {
      const ctx = canvas.getContext('2d');
      if (!ctx) return canvas;
      const px = Math.max(8, op.size * unitScale(canvas.width, canvas.height));
      ctx.save();
      /* The emoji fonts are named explicitly: the generic sans fallback draws a
         blank box on Windows, where there is no default colour emoji family. */
      ctx.font = `${px}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(op.glyph, op.x * canvas.width, op.y * canvas.height);
      ctx.restore();
      return canvas;
    }

    case 'frame':
      return paintFrame(canvas, op.style, op.color);

    case 'corners': {
      const radius = Math.max(0, op.radius) * unitScale(canvas.width, canvas.height);
      if (radius < 1) return canvas;
      const { canvas: out, ctx } = surface(canvas.width, canvas.height);
      ctx.drawImage(canvas, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      roundRectPath(ctx, 0, 0, canvas.width, canvas.height, radius);
      ctx.fill();
      return out;
    }

    case 'background':
      return paintBackground(canvas, op.color, op.margin);

    case 'merge':
      return paintMerge(canvas, op);
  }
}

/** Replay a whole op list from a pristine base. */
function applyOps(base: HTMLCanvasElement, ops: Op[]): HTMLCanvasElement {
  let canvas = cloneCanvas(base);
  for (const op of ops) canvas = applyOp(canvas, op);
  return canvas;
}

/* ------------------------------------------------------------- the values */

/** Read the recorded op list out of the sidebar values. */
function parseOps(value: string | boolean | null | undefined): Op[] {
  if (typeof value !== 'string' || !value) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  /* The list travels through a plain value bag, so anything unrecognised is
     dropped rather than crashed on. */
  return raw.filter(
    (item): item is Op =>
      Boolean(item) && typeof item === 'object' && typeof (item as { kind?: unknown }).kind === 'string',
  );
}

/**
 * Decode, replay and encode one picture.
 *
 * Shared by the sidebar run and the editor's own Save button so both hand back
 * identical bytes.
 */
async function renderEdited(
  file: WorkFile,
  ops: Op[],
  format: OutFormat,
  quality: number,
  longEdge: number,
): Promise<Blob> {
  const decoded = file.bytes
    ? await decodeBytes(file.bytes, file.file.type || 'image/png')
    : await decodeBlob(file.file);

  /* The same ceiling the upscaler uses: past this a phone photo can exhaust
     the tab's memory mid-replay. */
  const cap = 6000;
  const shrink = Math.min(1, cap / Math.max(decoded.width, decoded.height));
  const base = flatten(
    decoded.bmp,
    Math.round(decoded.width * shrink),
    Math.round(decoded.height * shrink),
  );
  let canvas = applyOps(base, ops);

  if (longEdge > 0) {
    const scale = longEdge / Math.max(canvas.width, canvas.height);
    canvas = resize(canvas, canvas.width * scale, canvas.height * scale);
  }

  return encode(canvas, format, quality);
}

/**
 * Hand a Blob to the browser as a download.
 *
 * Done here rather than through src/lib/pdf, which carries pdf.js with it and
 * has no business in an image editor's chunk.
 */
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  /* Revoking in the same tick races the download on Safari, so the URL is
     released on a later task instead. */
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/* ------------------------------------------------------------ the reducer */

type Zoom = 'fit' | '0.5' | '0.75' | '1' | '1.5' | '2';

type TabId =
  | 'light'
  | 'resize'
  | 'crop'
  | 'transform'
  | 'draw'
  | 'text'
  | 'shapes'
  | 'stickers'
  | 'frame'
  | 'corners'
  | 'background'
  | 'merge';

interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  grayscale: number;
  sepia: number;
}

interface TextLook {
  font: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

interface EditorState {
  tab: TabId;
  zoom: Zoom;
  /** The recorded edits, in the order they were made. */
  ops: Op[];
  past: Op[][];
  future: Op[][];
  slots: Slots;
  adjust: Adjustments;
  cropBox: CropBox;
  /** Locked crop ratio, or null for a free one. */
  aspect: number | null;
  brushColor: string;
  brushSize: number;
  /** Index of the text layer the right column is editing, or -1. */
  textIndex: number;
  text: TextLook;
  shapeKind: ShapeKind;
  shapeColor: string;
  shapeStroke: number;
  shapeFill: boolean;
  stickerSize: number;
  glyph: string;
  frameStyle: FrameStyle;
  frameColor: string;
  cornerRadius: number;
  bgColor: string;
  bgMargin: number;
  mergeScale: number;
  mergeName: string;
}

const FONTS: Array<{ value: string; label: string }> = [
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times' },
  { value: 'Impact, "Arial Black", sans-serif', label: 'Impact' },
];

/**
 * The sticker shelf.
 *
 * Written as escapes so the module stays inside the codebase's ASCII rule; the
 * glyphs themselves are ordinary characters once the browser reads them.
 */
const STICKERS: string[] = [
  '\u{1F600}', '\u{1F602}', '\u{1F60D}', '\u{1F60E}', '\u{1F973}', '\u{1F62D}',
  '\u{1F621}', '\u{1F914}', '\u{1F44D}', '\u{1F44E}', '\u{1F44F}', '\u{1F64C}',
  '\u{2764}\u{FE0F}', '\u{1F525}', '\u{2B50}', '\u{1F4AF}', '\u{1F389}', '\u{2705}',
  '\u{274C}', '\u{1F4A1}', '\u{1F4CC}', '\u{1F680}', '\u{1F33B}', '\u{1F355}',
];

const FREE_TEXT: TextLook = {
  font: FONTS[0].value,
  size: 48,
  color: '#ffffff',
  bold: true,
  italic: false,
};

const INITIAL: EditorState = {
  tab: 'light',
  zoom: 'fit',
  ops: [],
  past: [],
  future: [],
  slots: EMPTY_SLOTS,
  adjust: { brightness: 1, contrast: 1, saturation: 1, warmth: 0, grayscale: 0, sepia: 0 },
  cropBox: { x: 0, y: 0, w: 1, h: 1 },
  aspect: null,
  brushColor: '#e5322d',
  brushSize: 14,
  textIndex: -1,
  text: FREE_TEXT,
  shapeKind: 'rect',
  shapeColor: '#2f7bf0',
  shapeStroke: 8,
  shapeFill: false,
  stickerSize: 90,
  glyph: STICKERS[0],
  frameStyle: 'none',
  frameColor: '#ffffff',
  cornerRadius: 0,
  bgColor: '#ffffff',
  bgMargin: 0,
  mergeScale: 0.32,
  mergeName: '',
};

/**
 * Rebuild the slot table from an op list.
 *
 * Undo and redo move every index, so the table is derived rather than carried:
 * a stored index would silently start pointing at a different edit.
 */
function reindex(ops: Op[]): Slots {
  const slots: Slots = { ...EMPTY_SLOTS };
  ops.forEach((op, i) => {
    if (op.kind === 'adjust' || op.kind === 'frame' || op.kind === 'corners') slots[op.kind] = i;
    else if (op.kind === 'background' || op.kind === 'merge') slots[op.kind] = i;
  });
  return slots;
}

/** Append an op and open a new undo step. */
function push(state: EditorState, op: Op): EditorState {
  const ops = [...state.ops, op];
  return {
    ...state,
    ops,
    past: [...state.past, state.ops].slice(-40),
    future: [],
    slots: reindex(ops),
  };
}

/**
 * Write a slotted op.
 *
 * A tab that keeps revisiting the same decision - the filter stack, the frame,
 * the background - replaces its own op instead of stacking another one, so a
 * visitor dragging the brightness slider ends up with one edit rather than
 * fifty. The undo step is opened only the first time.
 */
function slot(state: EditorState, name: SlotName, op: Op, openStep = true): EditorState {
  const at = state.slots[name];
  if (at >= 0 && at < state.ops.length) {
    const ops = [...state.ops];
    ops[at] = op;
    return { ...state, ops, slots: reindex(ops) };
  }
  const ops = [...state.ops, op];
  return {
    ...state,
    ops,
    past: openStep ? [...state.past, state.ops].slice(-40) : state.past,
    future: [],
    slots: reindex(ops),
  };
}

/** Replace one op in place, without opening an undo step (drag updates). */
function replace(state: EditorState, index: number, op: Op): EditorState {
  if (index < 0 || index >= state.ops.length) return state;
  const ops = [...state.ops];
  ops[index] = op;
  return { ...state, ops };
}

/** The index of the op the drag handlers are currently growing. */
function lastIndex(state: EditorState): number {
  return state.ops.length - 1;
}

type Action =
  | { type: 'tab'; tab: TabId }
  | { type: 'zoom'; zoom: Zoom }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' }
  | { type: 'adjust'; key: keyof Adjustments; value: number }
  | { type: 'commitAdjust' }
  | { type: 'cropBox'; patch: Partial<CropBox> }
  | { type: 'cropAspect'; aspect: number | null }
  | { type: 'commitCrop' }
  | { type: 'resize'; width: number; height: number }
  | { type: 'rotate'; quarter: 1 | -1 }
  | { type: 'flip'; axis: 'h' | 'v' }
  | { type: 'tilt'; angle: number }
  | { type: 'brush'; color?: string; size?: number }
  | { type: 'strokeStart'; points: number[] }
  | { type: 'strokeExtend'; points: number[] }
  | { type: 'clearStrokes' }
  | { type: 'textAdd' }
  | { type: 'textSelect'; index: number }
  | { type: 'textPatch'; patch: Partial<TextOp> }
  | { type: 'textDelete' }
  | { type: 'shape'; patch: Partial<ShapeOp> }
  | { type: 'shapeStart'; op: ShapeOp }
  | { type: 'shapeExtend'; x2: number; y2: number }
  | { type: 'glyph'; glyph: string }
  | { type: 'stickerSize'; size: number }
  | { type: 'placeSticker'; x: number; y: number }
  | { type: 'moveSticker'; index: number; x: number; y: number }
  | { type: 'frame'; style: FrameStyle }
  | { type: 'frameColor'; color: string }
  | { type: 'corners'; radius: number }
  | { type: 'background'; color?: string; margin?: number }
  | { type: 'mergeSource'; src: string; name: string }
  | { type: 'mergeLayout'; layout: MergeLayout }
  | { type: 'mergeScale'; scale: number };

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'tab':
      return { ...state, tab: action.tab };

    case 'zoom':
      return { ...state, zoom: action.zoom };

    case 'undo': {
      if (!state.past.length) return state;
      const ops = state.past[state.past.length - 1];
      return {
        ...state,
        ops,
        past: state.past.slice(0, -1),
        future: [state.ops, ...state.future].slice(0, 40),
        slots: reindex(ops),
        textIndex: -1,
      };
    }

    case 'redo': {
      if (!state.future.length) return state;
      const ops = state.future[0];
      return {
        ...state,
        ops,
        past: [...state.past, state.ops].slice(-40),
        future: state.future.slice(1),
        slots: reindex(ops),
        textIndex: -1,
      };
    }

    case 'reset':
      return { ...INITIAL, zoom: state.zoom, tab: state.tab };

    case 'adjust':
      return { ...state, adjust: { ...state.adjust, [action.key]: action.value } };

    case 'commitAdjust':
      return slot(state, 'adjust', { kind: 'adjust', ...state.adjust });

    case 'cropBox':
      return { ...state, cropBox: { ...state.cropBox, ...action.patch } };

    case 'cropAspect': {
      const { x, y, w, h } = state.cropBox;
      if (action.aspect === null) return { ...state, aspect: null };
      /*
       * Keep the box where it is and make it match the ratio: the visitor has
       * already aimed it at something, so moving the centre would be rude.
       */
      const cx = x + w / 2;
      const cy = y + h / 2;
      let nextW = w;
      let nextH = w / action.aspect;
      if (nextH > 1) {
        nextH = 1;
        nextW = action.aspect;
      }
      if (nextW > 1) {
        nextW = 1;
        nextH = 1 / action.aspect;
      }
      return {
        ...state,
        aspect: action.aspect,
        cropBox: {
          x: clamp01(cx - nextW / 2),
          y: clamp01(cy - nextH / 2),
          w: nextW,
          h: nextH,
        },
      };
    }

    case 'commitCrop': {
      const box = state.cropBox;
      if (box.w < 0.02 || box.h < 0.02) return state;
      if (box.w > 0.985 && box.h > 0.985) return state;
      /* The box goes back to the full frame: the picture underneath is now the
         cropped one, so leaving the old rectangle on screen would frame an area
         that no longer means what it did. */
      return { ...push(state, { kind: 'crop', ...box }), cropBox: { x: 0, y: 0, w: 1, h: 1 } };
    }

    case 'resize':
      return push(state, {
        kind: 'resize',
        width: Math.max(1, Math.round(action.width)),
        height: Math.max(1, Math.round(action.height)),
      });

    case 'rotate':
      return push(state, { kind: 'rotate', quarter: action.quarter });

    case 'flip':
      return push(state, { kind: 'flip', axis: action.axis });

    case 'tilt':
      if (!action.angle) return state;
      return push(state, { kind: 'tilt', angle: action.angle });

    case 'brush':
      return {
        ...state,
        brushColor: action.color ?? state.brushColor,
        brushSize: action.size ?? state.brushSize,
      };

    case 'strokeStart':
      return push(state, {
        kind: 'brush',
        color: state.brushColor,
        size: state.brushSize,
        points: action.points,
      });

    case 'strokeExtend': {
      const at = lastIndex(state);
      const op = state.ops[at];
      if (!op || op.kind !== 'brush') return state;
      return replace(state, at, { ...op, points: [...op.points, ...action.points] });
    }

    case 'clearStrokes':
      if (!state.ops.some((op) => op.kind === 'brush')) return state;
      return {
        ...state,
        ops: state.ops.filter((op) => op.kind !== 'brush'),
        past: [...state.past, state.ops].slice(-40),
        future: [],
        slots: reindex(state.ops.filter((op) => op.kind !== 'brush')),
      };

    case 'textAdd': {
      const op: TextOp = { kind: 'text', text: 'Text', ...state.text, x: 0.5, y: 0.5 };
      const next = push(state, op);
      return { ...next, textIndex: next.ops.length - 1 };
    }

    case 'textSelect':
      return { ...state, textIndex: action.index };

    case 'textPatch': {
      const op = state.ops[state.textIndex];
      if (!op || op.kind !== 'text') return state;
      const merged = { ...op, ...action.patch };
      /*
       * The right column mirrors the selected layer, so a patch coming from the
       * look controls is also the new default for the next layer.
       */
      const look: Partial<TextLook> = {};
      if (action.patch.font !== undefined) look.font = action.patch.font;
      if (action.patch.size !== undefined) look.size = action.patch.size;
      if (action.patch.color !== undefined) look.color = action.patch.color;
      if (action.patch.bold !== undefined) look.bold = action.patch.bold;
      if (action.patch.italic !== undefined) look.italic = action.patch.italic;
      return { ...replace(state, state.textIndex, merged), text: { ...state.text, ...look } };
    }

    case 'textDelete': {
      if (state.textIndex < 0) return state;
      const ops = state.ops.filter((_, i) => i !== state.textIndex);
      return {
        ...state,
        ops,
        textIndex: -1,
        past: [...state.past, state.ops].slice(-40),
        future: [],
        slots: reindex(ops),
      };
    }

    case 'shape':
      return {
        ...state,
        shapeKind: action.patch.shape ?? state.shapeKind,
        shapeColor: action.patch.color ?? state.shapeColor,
        shapeStroke: action.patch.stroke ?? state.shapeStroke,
        shapeFill: action.patch.fill ?? state.shapeFill,
      };

    case 'shapeStart':
      return push(state, action.op);

    case 'shapeExtend': {
      const at = lastIndex(state);
      const op = state.ops[at];
      if (!op || op.kind !== 'shape') return state;
      return replace(state, at, { ...op, x2: action.x2, y2: action.y2 });
    }

    case 'glyph':
      return { ...state, glyph: action.glyph };

    case 'stickerSize':
      return { ...state, stickerSize: action.size };

    case 'placeSticker':
      return push(state, {
        kind: 'sticker',
        glyph: state.glyph,
        size: state.stickerSize,
        x: action.x,
        y: action.y,
      });

    case 'moveSticker': {
      const op = state.ops[action.index];
      if (!op || op.kind !== 'sticker') return state;
      return replace(state, action.index, { ...op, x: action.x, y: action.y });
    }

    case 'frame':
      /*
       * "None" clears the treatment instead of recording a no-op, so the op
       * list keeps describing only what actually happens to the picture.
       */
      if (action.style === 'none') {
        const kept = state.ops.filter((op) => op.kind !== 'frame');
        if (kept.length === state.ops.length) return { ...state, frameStyle: 'none' };
        return {
          ...state,
          frameStyle: 'none',
          ops: kept,
          past: [...state.past, state.ops].slice(-40),
          future: [],
          slots: reindex(kept),
        };
      }
      return {
        ...slot({ ...state, frameStyle: action.style }, 'frame', {
          kind: 'frame',
          style: action.style,
          color: state.frameColor,
        }),
      };

    case 'frameColor': {
      const next = { ...state, frameColor: action.color };
      if (state.frameStyle === 'none') return next;
      return slot(next, 'frame', { kind: 'frame', style: state.frameStyle, color: action.color });
    }

    case 'corners': {
      const next = { ...state, cornerRadius: action.radius };
      if (action.radius <= 0) {
        const kept = state.ops.filter((op) => op.kind !== 'corners');
        if (kept.length === state.ops.length) return next;
        return {
          ...next,
          ops: kept,
          past: [...state.past, state.ops].slice(-40),
          future: [],
          slots: reindex(kept),
        };
      }
      return slot(next, 'corners', { kind: 'corners', radius: action.radius });
    }

    case 'background': {
      const next = {
        ...state,
        bgColor: action.color ?? state.bgColor,
        bgMargin: action.margin ?? state.bgMargin,
      };
      return slot(next, 'background', {
        kind: 'background',
        color: next.bgColor,
        margin: next.bgMargin,
      });
    }

    case 'mergeSource': {
      /* A different second picture keeps the layout and size already chosen:
         the visitor is swapping the picture, not undoing their setup. */
      const at = state.slots.merge;
      const existing = state.ops[at];
      const layout = existing && existing.kind === 'merge' ? existing.layout : 'overlay';
      const scale = existing && existing.kind === 'merge' ? existing.scale : state.mergeScale;
      return slot({ ...state, mergeName: action.name, mergeScale: scale }, 'merge', {
        kind: 'merge',
        src: action.src,
        layout,
        scale,
      });
    }

    case 'mergeLayout': {
      const at = state.slots.merge;
      const op = state.ops[at];
      if (!op || op.kind !== 'merge') return state;
      return replace(state, at, { ...op, layout: action.layout });
    }

    case 'mergeScale': {
      const next = { ...state, mergeScale: action.scale };
      const at = state.slots.merge;
      const op = state.ops[at];
      if (!op || op.kind !== 'merge') return next;
      return replace(next, at, { ...op, scale: action.scale });
    }
  }
}
/* ------------------------------------------------------------- the widgets */

/** Range slider with its label and readout on one row, as the panels use. */
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

/**
 * Number input that keeps what the visitor typed.
 *
 * A directly controlled field would rewrite "0." to "0" on the first keystroke,
 * so the text is held locally and only a parseable value is reported upward.
 */
function NumberBox({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] leading-[14px] text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = Number(event.target.value);
          if (event.target.value !== '' && Number.isFinite(next)) onChange(next);
        }}
        className="h-8 w-full rounded border border-muted bg-surface px-2 text-sm text-ink focus:border-ink focus:outline-none"
      />
    </label>
  );
}

/** A row of small labelled choices, used where a full radio card is too tall. */
function Segments<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={
              'rounded-md border px-2 py-1 text-[12px] font-medium ' +
              (active
                ? 'border-img bg-img-soft text-img-ink'
                : 'border-line bg-surface text-muted hover:border-muted')
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Section heading inside the editor's right-hand column. */
function ColumnTitle({ children }: { children: string }) {
  return <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">{children}</h3>;
}

/** Small grey caption. */
function Hint({ children }: { children: string }) {
  return <p className="mt-1 text-[12px] leading-[17px] text-muted">{children}</p>;
}

/* -------------------------------------------------------------- the tabs */

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'light', label: 'Filter & light' },
  { id: 'resize', label: 'Resize' },
  { id: 'crop', label: 'Crop' },
  { id: 'transform', label: 'Transform' },
  { id: 'draw', label: 'Draw' },
  { id: 'text', label: 'Text' },
  { id: 'shapes', label: 'Shapes' },
  { id: 'stickers', label: 'Stickers' },
  { id: 'frame', label: 'Frame' },
  { id: 'corners', label: 'Corners' },
  { id: 'background', label: 'Background' },
  { id: 'merge', label: 'Merge' },
];

const strokeStyle = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** One glyph per tab, drawn inline so it follows the rail's colour. */
function TabIcon({ id }: { id: TabId }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" {...strokeStyle}>
      {id === 'light' && (
        <>
          <path d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="7" cy="18" r="2" fill="currentColor" stroke="none" />
        </>
      )}
      {id === 'resize' && (
        <>
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </>
      )}
      {id === 'crop' && (
        <>
          <path d="M6.13 1 6 16a2 2 0 0 0 2 2h15" />
          <path d="M1 6.13 16 6a2 2 0 0 1 2 2v15" />
        </>
      )}
      {id === 'transform' && (
        <>
          <path d="M23 4v6h-6" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </>
      )}
      {id === 'draw' && (
        <>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
        </>
      )}
      {id === 'text' && (
        <>
          <path d="M4 7V4h16v3" />
          <path d="M9 20h6" />
          <path d="M12 4v16" />
        </>
      )}
      {id === 'shapes' && (
        <>
          <rect x="3" y="3" width="8" height="8" rx="1" />
          <circle cx="17" cy="17" r="4.5" />
        </>
      )}
      {id === 'stickers' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 14.5a4 4 0 0 0 7 0" />
          <path d="M9 9.5h.01M15 9.5h.01" />
        </>
      )}
      {id === 'frame' && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <rect x="7" y="9" width="10" height="6" rx="1" />
        </>
      )}
      {id === 'corners' && <rect x="3" y="3" width="18" height="18" rx="6" />}
      {id === 'background' && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </>
      )}
      {id === 'merge' && (
        <>
          <rect x="2" y="7" width="12" height="12" rx="2" />
          <rect x="10" y="4" width="12" height="12" rx="2" />
        </>
      )}
    </svg>
  );
}

/* ------------------------------------------------------- the right column */

const ASPECTS: Array<{ key: string; label: string; ratio: number | null }> = [
  { key: 'free', label: 'Free', ratio: null },
  { key: '1-1', label: '1:1', ratio: 1 },
  { key: '4-3', label: '4:3', ratio: 4 / 3 },
  { key: '3-2', label: '3:2', ratio: 3 / 2 },
  { key: '16-9', label: '16:9', ratio: 16 / 9 },
  { key: '9-16', label: '9:16', ratio: 9 / 16 },
];

const FRAMES: Array<{ style: FrameStyle; label: string }> = [
  { style: 'none', label: 'None' },
  { style: 'thin', label: 'Thin' },
  { style: 'thick', label: 'Thick' },
  { style: 'rounded', label: 'Rounded' },
  { style: 'polaroid', label: 'Polaroid' },
  { style: 'dashed', label: 'Dashed' },
];

const SHAPES: Array<{ value: ShapeKind; label: string }> = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'line', label: 'Line' },
];

const MERGE_LAYOUTS: Array<{ value: MergeLayout; label: string }> = [
  { value: 'side', label: 'Side by side' },
  { value: 'stack', label: 'Vertical' },
  { value: 'overlay', label: 'Overlay' },
];

const pct = (value: number) => Math.round(value * 100) + '%';

/**
 * The column for FILTER & LIGHT.
 *
 * The preview reads the sliders live, while the recorded op is rewritten on
 * every step by the slotted commit, so dragging a slider leaves one edit behind
 * rather than a few hundred.
 */
function LightColumn({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: (action: Action) => void;
}) {
  const set = (key: keyof Adjustments) => (value: number) => {
    dispatch({ type: 'adjust', key, value });
    dispatch({ type: 'commitAdjust' });
  };

  const reset = () => {
    dispatch({ type: 'adjust', key: 'brightness', value: 1 });
    dispatch({ type: 'adjust', key: 'contrast', value: 1 });
    dispatch({ type: 'adjust', key: 'saturation', value: 1 });
    dispatch({ type: 'adjust', key: 'warmth', value: 0 });
    dispatch({ type: 'adjust', key: 'grayscale', value: 0 });
    dispatch({ type: 'adjust', key: 'sepia', value: 0 });
    dispatch({ type: 'commitAdjust' });
  };

  const a = state.adjust;
  return (
    <div>
      <ColumnTitle>Filter &amp; light</ColumnTitle>
      <Slider
        id="ed-brightness"
        label="Brightness"
        value={a.brightness}
        min={0.4}
        max={1.8}
        step={0.01}
        readout={pct}
        onChange={set('brightness')}
      />
      <Slider
        id="ed-contrast"
        label="Contrast"
        value={a.contrast}
        min={0.4}
        max={1.8}
        step={0.01}
        readout={pct}
        onChange={set('contrast')}
      />
      <Slider
        id="ed-saturation"
        label="Saturation"
        value={a.saturation}
        min={0}
        max={2}
        step={0.01}
        readout={pct}
        onChange={set('saturation')}
      />
      <Slider
        id="ed-warmth"
        label="Warmth"
        value={a.warmth}
        min={-60}
        max={60}
        step={1}
        readout={(v) => (v > 0 ? '+' : '') + Math.round(v)}
        onChange={set('warmth')}
      />
      <Slider
        id="ed-grayscale"
        label="Grayscale"
        value={a.grayscale}
        min={0}
        max={1}
        step={0.01}
        readout={pct}
        onChange={set('grayscale')}
      />
      <Slider
        id="ed-sepia"
        label="Sepia"
        value={a.sepia}
        min={0}
        max={1}
        step={0.01}
        readout={pct}
        onChange={set('sepia')}
      />
      <div className="mt-1 mb-2">
        <ActionButton onClick={reset}>Reset filters</ActionButton>
      </div>
      <Hint>The filters stay editable: drag a slider again and the same edit is rewritten.</Hint>
    </div>
  );
}

/**
 * The column for RESIZE.
 *
 * The fields start at the size the recorded chain currently produces, and the
 * component is keyed on that size, so applying a resize re-seeds the fields
 * with the numbers that are now true instead of leaving stale ones on screen.
 */
function ResizeColumn({
  size,
  dispatch,
}: {
  size: { width: number; height: number };
  dispatch: (action: Action) => void;
}) {
  const [width, setWidth] = useState(String(size.width));
  const [height, setHeight] = useState(String(size.height));
  const [ratio, setRatio] = useState(true);

  const apply = () => {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return;
    dispatch({ type: 'resize', width: w, height: h });
  };

  const byPercent = (share: number) => {
    dispatch({
      type: 'resize',
      width: Math.round(size.width * share),
      height: Math.round(size.height * share),
    });
  };

  return (
    <div>
      <ColumnTitle>Resize</ColumnTitle>
      <p className="mb-2 text-[12px] leading-[17px] text-muted">
        Current size: {size.width} x {size.height} px
      </p>
      <div className="mb-2 flex gap-2">
        <NumberBox
          label="Width (px)"
          value={Number(width)}
          min={1}
          onChange={(next) => {
            setWidth(String(Math.round(next)));
            if (ratio) setHeight(String(Math.max(1, Math.round((next * size.height) / size.width))));
          }}
        />
        <NumberBox
          label="Height (px)"
          value={Number(height)}
          min={1}
          onChange={(next) => {
            setHeight(String(Math.round(next)));
            if (ratio) setWidth(String(Math.max(1, Math.round((next * size.width) / size.height))));
          }}
        />
      </div>
      <CheckboxField label="Maintain aspect ratio" checked={ratio} onChange={setRatio} />
      <Label>Quick sizes</Label>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[0.25, 0.5, 0.75, 1.5, 2].map((share) => (
          <button
            key={share}
            type="button"
            onClick={() => byPercent(share)}
            className="rounded-md border border-line bg-surface px-2 py-1 text-[12px] font-medium text-muted hover:border-muted hover:text-ink-2"
          >
            {share * 100}%
          </button>
        ))}
      </div>
      <ActionButton onClick={apply}>Apply size</ActionButton>
      <Hint>Shrinking is permanent for that export, so keep the original if you may need it again.</Hint>
    </div>
  );
}

/** The column for CROP. */
function CropColumn({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: (action: Action) => void;
}) {
  const box = state.cropBox;
  const active =
    state.aspect === null
      ? 'free'
      : (ASPECTS.find((item) => item.ratio === state.aspect) ?? ASPECTS[0]).key;

  return (
    <div>
      <ColumnTitle>Crop</ColumnTitle>
      <Label>Aspect ratio</Label>
      <Segments
        value={active}
        onChange={(key) => {
          const found = ASPECTS.find((item) => item.key === key);
          dispatch({ type: 'cropAspect', aspect: found ? found.ratio : null });
        }}
        options={ASPECTS.map((item) => ({ value: item.key, label: item.label }))}
      />
      <Label>Crop box (percent of the picture)</Label>
      <div className="mb-2 flex gap-2">
        <NumberBox
          label="X"
          value={Math.round(box.x * 100)}
          min={0}
          max={100}
          onChange={(v) => dispatch({ type: 'cropBox', patch: { x: clamp01(v / 100) } })}
        />
        <NumberBox
          label="Y"
          value={Math.round(box.y * 100)}
          min={0}
          max={100}
          onChange={(v) => dispatch({ type: 'cropBox', patch: { y: clamp01(v / 100) } })}
        />
      </div>
      <div className="mb-3 flex gap-2">
        <NumberBox
          label="Width"
          value={Math.round(box.w * 100)}
          min={1}
          max={100}
          onChange={(v) => dispatch({ type: 'cropBox', patch: { w: clamp01(v / 100) } })}
        />
        <NumberBox
          label="Height"
          value={Math.round(box.h * 100)}
          min={1}
          max={100}
          onChange={(v) => dispatch({ type: 'cropBox', patch: { h: clamp01(v / 100) } })}
        />
      </div>
      <ActionButton onClick={() => dispatch({ type: 'commitCrop' })}>Apply crop</ActionButton>
      <Hint>The dashed frame on the picture shows what the crop will keep.</Hint>
    </div>
  );
}

/** The column for TRANSFORM. */
function TransformColumn({ dispatch }: { dispatch: (action: Action) => void }) {
  const [angle, setAngle] = useState(0);
  return (
    <div>
      <ColumnTitle>Transform</ColumnTitle>
      <div className="mb-2 flex gap-2">
        <ActionButton onClick={() => dispatch({ type: 'rotate', quarter: -1 })}>
          Rotate left
        </ActionButton>
        <ActionButton onClick={() => dispatch({ type: 'rotate', quarter: 1 })}>
          Rotate right
        </ActionButton>
      </div>
      <div className="mb-3 flex gap-2">
        <ActionButton onClick={() => dispatch({ type: 'flip', axis: 'h' })}>Flip H</ActionButton>
        <ActionButton onClick={() => dispatch({ type: 'flip', axis: 'v' })}>Flip V</ActionButton>
      </div>
      <Label>Straighten</Label>
      <Slider
        id="ed-tilt"
        label="Angle"
        value={angle}
        min={-45}
        max={45}
        step={1}
        readout={(v) => (v > 0 ? '+' : '') + v + ' deg'}
        onChange={setAngle}
      />
      <ActionButton onClick={() => dispatch({ type: 'tilt', angle })}>Apply rotation</ActionButton>
      <Hint>A free angle grows the canvas to keep every corner; the new wedges stay transparent.</Hint>
    </div>
  );
}

/** The column for DRAW. */
function DrawColumn({ state, dispatch }: { state: EditorState; dispatch: (action: Action) => void }) {
  return (
    <div>
      <ColumnTitle>Draw</ColumnTitle>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="option-title mb-0">Brush colour</span>
        <input
          type="color"
          aria-label="Brush colour"
          value={state.brushColor}
          onChange={(event) => dispatch({ type: 'brush', color: event.target.value })}
          className="h-8 w-11 shrink-0 cursor-pointer rounded border border-muted bg-surface p-0.5"
        />
      </div>
      <Slider
        id="ed-brush"
        label="Brush size"
        value={state.brushSize}
        min={2}
        max={60}
        step={1}
        readout={(v) => v + ' px'}
        onChange={(value) => dispatch({ type: 'brush', size: value })}
      />
      <div className="mb-2">
        <ActionButton onClick={() => dispatch({ type: 'clearStrokes' })}>Clear brush strokes</ActionButton>
      </div>
      <Hint>Drag on the picture to paint. Each stroke is recorded as one edit.</Hint>
    </div>
  );
}

/** The column for TEXT. */
function TextColumn({ state, dispatch }: { state: EditorState; dispatch: (action: Action) => void }) {
  const index = state.textIndex;
  const picked = index >= 0 ? state.ops[index] : undefined;
  const layer = picked && picked.kind === 'text' ? picked : null;
  const look = layer ?? state.text;
  const layers = state.ops
    .map((op, i) => ({ op, i }))
    .filter((entry): entry is { op: TextOp; i: number } => entry.op.kind === 'text');

  return (
    <div>
      <ColumnTitle>Text</ColumnTitle>
      <div className="mb-3">
        <ActionButton onClick={() => dispatch({ type: 'textAdd' })}>Add a text layer</ActionButton>
      </div>

      {layer ? (
        <>
          <label className="option-title block" htmlFor="ed-text-body">
            Content
          </label>
          <textarea
            id="ed-text-body"
            rows={2}
            value={layer.text}
            onChange={(event) => dispatch({ type: 'textPatch', patch: { text: event.target.value } })}
            className="mb-3 w-full resize-y rounded border border-muted bg-surface px-3 py-2 text-sm leading-relaxed text-ink focus:border-ink focus:outline-none"
          />
          <label className="option-title block" htmlFor="ed-text-font">
            Font
          </label>
          <select
            id="ed-text-font"
            value={look.font}
            onChange={(event) => dispatch({ type: 'textPatch', patch: { font: event.target.value } })}
            className="mb-3 h-8 w-full cursor-pointer rounded border border-muted bg-surface px-2 text-sm text-ink focus:border-ink focus:outline-none"
          >
            {FONTS.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
          <Slider
            id="ed-text-size"
            label="Size"
            value={look.size}
            min={10}
            max={220}
            step={1}
            readout={(v) => v + ' pt'}
            onChange={(value) => dispatch({ type: 'textPatch', patch: { size: value } })}
          />
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="option-title mb-0">Colour</span>
            <input
              type="color"
              aria-label="Text colour"
              value={look.color}
              onChange={(event) => dispatch({ type: 'textPatch', patch: { color: event.target.value } })}
              className="h-8 w-11 shrink-0 cursor-pointer rounded border border-muted bg-surface p-0.5"
            />
          </div>
          <CheckboxField
            label="Bold"
            checked={look.bold}
            onChange={(value) => dispatch({ type: 'textPatch', patch: { bold: value } })}
          />
          <CheckboxField
            label="Italic"
            checked={look.italic}
            onChange={(value) => dispatch({ type: 'textPatch', patch: { italic: value } })}
          />
          <Slider
            id="ed-text-x"
            label="Horizontal"
            value={Math.round(layer.x * 100)}
            min={0}
            max={100}
            step={1}
            readout={(v) => v + '%'}
            onChange={(value) => dispatch({ type: 'textPatch', patch: { x: value / 100 } })}
          />
          <Slider
            id="ed-text-y"
            label="Vertical"
            value={Math.round(layer.y * 100)}
            min={0}
            max={100}
            step={1}
            readout={(v) => v + '%'}
            onChange={(value) => dispatch({ type: 'textPatch', patch: { y: value / 100 } })}
          />
          <div className="mb-2">
            <ActionButton onClick={() => dispatch({ type: 'textDelete' })}>Delete this layer</ActionButton>
          </div>
          <Hint>Drag the layer on the picture to move it.</Hint>
        </>
      ) : layers.length ? (
        <>
          <Hint>Pick a layer to edit it.</Hint>
          <ul className="mt-2 flex flex-col gap-1.5">
            {layers.map((entry) => (
              <li key={entry.i}>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'textSelect', index: entry.i })}
                  className="w-full truncate rounded-md border border-line bg-surface px-2 py-1.5 text-left text-[13px] text-ink-2 hover:border-muted"
                >
                  {entry.op.text || 'Empty layer'}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Hint>A text layer is drawn over the picture; add as many as the picture needs.</Hint>
      )}
    </div>
  );
}

/** The column for SHAPES. */
function ShapesColumn({ state, dispatch }: { state: EditorState; dispatch: (action: Action) => void }) {
  return (
    <div>
      <ColumnTitle>Shapes</ColumnTitle>
      <Segments
        value={state.shapeKind}
        onChange={(value) => dispatch({ type: 'shape', patch: { shape: value } })}
        options={SHAPES}
      />
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="option-title mb-0">Colour</span>
        <input
          type="color"
          aria-label="Shape colour"
          value={state.shapeColor}
          onChange={(event) => dispatch({ type: 'shape', patch: { color: event.target.value } })}
          className="h-8 w-11 shrink-0 cursor-pointer rounded border border-muted bg-surface p-0.5"
        />
      </div>
      <Slider
        id="ed-shape-stroke"
        label="Stroke width"
        value={state.shapeStroke}
        min={1}
        max={40}
        step={1}
        readout={(v) => v + ' px'}
        onChange={(value) => dispatch({ type: 'shape', patch: { stroke: value } })}
      />
      <CheckboxField
        label="Fill the shape"
        checked={state.shapeFill}
        onChange={(value) => dispatch({ type: 'shape', patch: { fill: value } })}
      />
      <Hint>Drag on the picture to draw. A line ignores the fill setting.</Hint>
    </div>
  );
}

/** The column for STICKERS. */
function StickersColumn({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: (action: Action) => void;
}) {
  return (
    <div>
      <ColumnTitle>Stickers</ColumnTitle>
      <div className="mb-3 grid grid-cols-6 gap-1">
        {STICKERS.map((glyph, i) => (
          <button
            key={i}
            type="button"
            aria-label={'Sticker ' + (i + 1)}
            aria-pressed={state.glyph === glyph}
            onClick={() => {
              /*
               * Choosing a sticker drops it on the spot: the visitor has already
               * pointed at the one they want, and a second click on the picture
               * to confirm would be a step for nothing.
               */
              dispatch({ type: 'glyph', glyph });
              dispatch({ type: 'placeSticker', x: 0.5, y: 0.5 });
            }}
            className={
              'flex h-9 items-center justify-center rounded-md border text-[18px] leading-none ' +
              (state.glyph === glyph
                ? 'border-img bg-img-soft'
                : 'border-line bg-surface hover:border-muted')
            }
          >
            {glyph}
          </button>
        ))}
      </div>
      <Slider
        id="ed-sticker-size"
        label="Sticker size"
        value={state.stickerSize}
        min={20}
        max={300}
        step={2}
        readout={(v) => v + ' pt'}
        onChange={(value) => dispatch({ type: 'stickerSize', size: value })}
      />
      <Hint>Click anywhere on the picture to drop another copy of the selected sticker.</Hint>
    </div>
  );
}

/** The column for FRAME. */
function FrameColumn({ state, dispatch }: { state: EditorState; dispatch: (action: Action) => void }) {
  return (
    <div>
      <ColumnTitle>Frame</ColumnTitle>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {FRAMES.map((frame) => {
          const active = state.frameStyle === frame.style;
          return (
            <button
              key={frame.style}
              type="button"
              aria-pressed={active}
              onClick={() => dispatch({ type: 'frame', style: frame.style })}
              className={
                'rounded-lg border px-2 py-3 text-[13px] font-medium ' +
                (active
                  ? 'border-img bg-img-soft text-img-ink'
                  : 'border-line bg-surface text-muted hover:border-muted')
              }
            >
              {frame.label}
            </button>
          );
        })}
      </div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="option-title mb-0">Frame colour</span>
        <input
          type="color"
          aria-label="Frame colour"
          value={state.frameColor}
          onChange={(event) => dispatch({ type: 'frameColor', color: event.target.value })}
          className="h-8 w-11 shrink-0 cursor-pointer rounded border border-muted bg-surface p-0.5"
        />
      </div>
      <Hint>Thin and thick draw inside the picture; polaroid adds a print border around it.</Hint>
    </div>
  );
}

/** The column for CORNERS. */
function CornersColumn({ state, dispatch }: { state: EditorState; dispatch: (action: Action) => void }) {
  return (
    <div>
      <ColumnTitle>Corners</ColumnTitle>
      <Slider
        id="ed-corners"
        label="Corner radius"
        value={state.cornerRadius}
        min={0}
        max={160}
        step={1}
        readout={(v) => v + ' pt'}
        onChange={(value) => dispatch({ type: 'corners', radius: value })}
      />
      <Hint>The rounded corners are cut out, so the checkerboard shows through them.</Hint>
    </div>
  );
}

/** The column for BACKGROUND. */
function BackgroundColumn({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: (action: Action) => void;
}) {
  return (
    <div>
      <ColumnTitle>Background</ColumnTitle>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="option-title mb-0">Background colour</span>
        <input
          type="color"
          aria-label="Background colour"
          value={state.bgColor}
          onChange={(event) => dispatch({ type: 'background', color: event.target.value })}
          className="h-8 w-11 shrink-0 cursor-pointer rounded border border-muted bg-surface p-0.5"
        />
      </div>
      <Slider
        id="ed-bg-margin"
        label="Margin"
        value={Math.round(state.bgMargin * 100)}
        min={0}
        max={40}
        step={1}
        readout={(v) => v + '%'}
        onChange={(value) => dispatch({ type: 'background', margin: value / 100 })}
      />
      <Hint>A margin is filled with the colour above, which is how a shrunken picture gets a border of its own.</Hint>
    </div>
  );
}

/** The column for MERGE. */
function MergeColumn({ state, dispatch }: { state: EditorState; dispatch: (action: Action) => void }) {
  const picked = state.ops[state.slots.merge];
  const merge = picked && picked.kind === 'merge' ? picked : null;

  const choose = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    void keepSource(file).then((src) => {
      dispatch({ type: 'mergeSource', src, name: file.name });
    });
  };

  return (
    <div>
      <ColumnTitle>Merge</ColumnTitle>
      <div className="mb-3">
        <label className="option-title block" htmlFor="ed-merge">
          Second picture
        </label>
        <input
          id="ed-merge"
          type="file"
          accept="image/*"
          className="block w-full text-sm text-ink-2 file:mr-3 file:h-8 file:rounded file:border-0 file:bg-subtle file:px-3 file:text-sm file:text-ink-2"
          onChange={(event) => choose(event.currentTarget)}
        />
      </div>
      {merge ? (
        <>
          <Note>{state.mergeName} is placed with the current picture.</Note>
          <Label>Layout</Label>
          <Segments
            value={merge.layout}
            onChange={(layout) => dispatch({ type: 'mergeLayout', layout })}
            options={MERGE_LAYOUTS}
          />
          <Slider
            id="ed-merge-scale"
            label="Overlay size"
            value={Math.round(merge.scale * 100)}
            min={10}
            max={90}
            step={1}
            readout={(v) => v + '%'}
            onChange={(value) => dispatch({ type: 'mergeScale', scale: value / 100 })}
          />
        </>
      ) : (
        <Hint>
          Side by side and vertical grow the canvas; overlay tucks the second picture into the
          bottom-right corner.
        </Hint>
      )}
    </div>
  );
}
/* ----------------------------------------------------- the editor canvas */

/** Screen size of the checkerboard tile. */
const TILE = 16;

/** Zoom steps the visitor can pick from, with "fit" as the default. */
const ZOOMS: Array<{ value: Zoom; label: string }> = [
  { value: 'fit', label: 'Fit' },
  { value: '0.5', label: '50%' },
  { value: '0.75', label: '75%' },
  { value: '1', label: '100%' },
  { value: '1.5', label: '150%' },
  { value: '2', label: '200%' },
];

/** Where the pointer landed, as fractions of the picture. */
function pointIn(event: { currentTarget: HTMLDivElement; clientX: number; clientY: number }): {
  x: number;
  y: number;
} {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp01((event.clientX - rect.left) / Math.max(1, rect.width)),
    y: clamp01((event.clientY - rect.top) / Math.max(1, rect.height)),
  };
}

/** Which layer sits under a given point, topmost first. */
function layerAt(ops: Op[], point: { x: number; y: number }) {
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    if (op.kind === 'text') {
      /* A generous box: the visitor is aiming at words, not at an exact glyph. */
      const half = 0.12;
      if (Math.abs(op.x - point.x) < half && Math.abs(op.y - point.y) < half) {
        return { kind: 'text' as const, index: i };
      }
    }
    if (op.kind === 'sticker') {
      const half = 0.08;
      if (Math.abs(op.x - point.x) < half && Math.abs(op.y - point.y) < half) {
        return { kind: 'sticker' as const, index: i };
      }
    }
  }
  return null;
}

type Drag =
  | { kind: 'paint' }
  | { kind: 'shape' }
  | { kind: 'text'; index: number; dx: number; dy: number }
  | { kind: 'sticker'; index: number; dx: number; dy: number }
  | { kind: 'crop'; from: { x: number; y: number } };

function PhotoEditor({
  initialFile,
  initialOps,
  setValue,
}: {
  initialFile: WorkFile;
  initialOps: Op[];
  setValue: (name: string, value: string | boolean | null) => void;
}) {
  const [file, setFile] = useState<WorkFile>(initialFile);
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null);
  /* The picture's own size, kept apart from the preview's: RESIZE has to offer
     the real dimensions, or a 4000 px photo would be described as 1400 px. */
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [state, dispatch] = useReducer(reducer, {
    ...INITIAL,
    ops: initialOps,
    slots: reindex(initialOps),
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  /*
   * The op list is the tool's output: the sidebar's run() replays exactly this
   * list against the original bytes, so every change is written straight back
   * into the shared value bag.
   */
  const publish = useRef(false);
  useEffect(() => {
    /*
     * Nothing is published on the first pass: the editor may be mounting with a
     * list it was handed, and echoing it straight back would be a pointless
     * state write in the middle of a render pass.
     */
    if (!publish.current) {
      publish.current = true;
      return;
    }
    setValue(OPS_KEY, state.ops.length ? JSON.stringify(state.ops) : '');
  }, [state.ops, setValue]);

  /* Read by the decode effect below, which must not restart on every edit. */
  const opsRef = useRef(state.ops);
  opsRef.current = state.ops;

  useEffect(() => {
    if (!file) {
      setBase(null);
      setPreview(null);
      return;
    }
    let live = true;
    void (async () => {
      try {
        const decoded = file.bytes
          ? await decodeBytes(file.bytes, file.file.type || 'image/png')
          : await decodeBlob(file.file);
        if (!live) return;
        setNatural({ width: decoded.width, height: decoded.height });
        const scale = Math.min(1, PREVIEW_EDGE / Math.max(decoded.width, decoded.height));
        const next = flatten(
          decoded.bmp,
          Math.round(decoded.width * scale),
          Math.round(decoded.height * scale),
        );
        setBase(next);
        setPreview(applyOps(next, opsRef.current));
      } catch {
        if (live) {
          setBase(null);
          setPreview(null);
          setNote('That picture could not be decoded.');
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [file]);

  /* Leaving the editor forgets any swapped picture, so the next visit starts
     from the upload again. */
  useEffect(
    () => () => {
      if (swapped && swapped.uploadId === initialFile.id) swapped = null;
    },
    [initialFile.id],
  );

  /*
   * Repaint whenever the picture or the edit list changes.
   *
   * The gesture must NOT be dropped here. Every pointer move dispatches an op,
   * so clearing drag.current in this effect cancelled the drag on its own first
   * frame: the pointer was captured, one point was recorded, and the gesture
   * died before the second move — which is why nothing could be drawn, dragged
   * or shaped. Only a change of the base picture genuinely invalidates the
   * coordinates, and that is handled by the effect below.
   */
  useEffect(() => {
    if (!base) return;
    setPreview(applyOps(base, state.ops));
  }, [base, state.ops]);

  /*
   * A rotated, flipped or straightened picture changes size under the drag
   * handlers, so a half-finished gesture is dropped when the base is replaced
   * rather than left to land on coordinates that no longer exist.
   */
  useEffect(() => {
    drag.current = null;
  }, [base]);

  /*
   * The preview canvas is written through a ref rather than rendered from the
   * ops: the bitmap is what the export replays, and copying it into the element
   * keeps the visible pixels and the saved pixels on one code path.
   */
  const surfaceRef = useRef<HTMLCanvasElement | null>(null);

  /* The column the picture is fitted into; measured, never guessed. */
  const viewportRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = surfaceRef.current;
    if (!node || !preview) return;
    node.width = preview.width;
    node.height = preview.height;
    node.getContext('2d')?.drawImage(preview, 0, 0);
  }, [preview]);

  const drag = useRef<Drag | null>(null);

  /* --- the drag gestures ------------------------------------------------ */

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointIn(event);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Pointer capture is best-effort; the drag still works without it. */
    }

    if (state.tab === 'crop') {
      drag.current = { kind: 'crop', from: point };
      dispatch({ type: 'cropBox', patch: { x: point.x, y: point.y, w: 0, h: 0 } });
      return;
    }

    if (state.tab === 'draw') {
      drag.current = { kind: 'paint' };
      dispatch({ type: 'strokeStart', points: [point.x, point.y] });
      return;
    }

    if (state.tab === 'shapes') {
      drag.current = { kind: 'shape' };
      dispatch({
        type: 'shapeStart',
        op: {
          kind: 'shape',
          shape: state.shapeKind,
          x1: point.x,
          y1: point.y,
          x2: point.x,
          y2: point.y,
          color: state.shapeColor,
          stroke: state.shapeStroke,
          fill: state.shapeFill,
        },
      });
      return;
    }

    /* MOVING: the text and shapes tabs grab whichever layer is under the
       pointer. Stickers and text only, because those are the two that carry a
       position of their own. */
    if (state.tab === 'text' || state.tab === 'stickers') {
      const hit = layerAt(state.ops, point);
      if (!hit) return;
      if (hit.kind === 'text') {
        const op = state.ops[hit.index];
        if (op.kind !== 'text') return;
        dispatch({ type: 'textSelect', index: hit.index });
        drag.current = { kind: 'text', index: hit.index, dx: point.x - op.x, dy: point.y - op.y };
      } else {
        const op = state.ops[hit.index];
        if (op.kind !== 'sticker') return;
        drag.current = { kind: 'sticker', index: hit.index, dx: point.x - op.x, dy: point.y - op.y };
      }
    }
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active) return;
    const point = pointIn(event);

    if (active.kind === 'paint') {
      dispatch({ type: 'strokeExtend', points: [point.x, point.y] });
      return;
    }

    if (active.kind === 'shape') {
      dispatch({ type: 'shapeExtend', x2: point.x, y2: point.y });
      return;
    }


    if (active.kind === 'crop') {
      const x = Math.min(active.from.x, point.x);
      const y = Math.min(active.from.y, point.y);
      let w = Math.abs(point.x - active.from.x);
      let h = Math.abs(point.y - active.from.y);
      if (state.aspect) {
        /* Honour the locked ratio while dragging, growing the box from the
           corner the drag started at. */
        h = w / state.aspect;
        if (y + h > 1) {
          h = 1 - y;
          w = h * state.aspect;
        }
        if (x + w > 1) {
          w = 1 - x;
          h = w / state.aspect;
        }
      }
      dispatch({ type: 'cropBox', patch: { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) } });
      return;
    }

    if (active.kind === 'text') {
      dispatch({
        type: 'textPatch',
        patch: { x: clamp01(point.x - active.dx), y: clamp01(point.y - active.dy) },
      });
      return;
    }

    /* A sticker move is a plain replacement of its recorded position. */
    dispatch({
      type: 'moveSticker',
      index: active.index,
      x: clamp01(point.x - active.dx),
      y: clamp01(point.y - active.dy),
    });
  };

  const up = () => {
    const active = drag.current;
    drag.current = null;
    /*
     * A tap on the crop tab is not a crop: a box the visitor cannot see would
     * only sit in the sidebar reading "0 x 0", so the frame goes back to the
     * whole picture.
     */
    if (active?.kind === 'crop' && (state.cropBox.w < 0.02 || state.cropBox.h < 0.02)) {
      dispatch({ type: 'cropBox', patch: { x: 0, y: 0, w: 1, h: 1 } });
    }
  };

  /* A plain click on the stickers tab drops the selected sticker where the
     visitor aimed, rather than always in the middle of the picture. */
  const clickCanvas = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (state.tab !== 'stickers') return;
    const point = pointIn(event);
    if (layerAt(state.ops, point)) return;
    dispatch({ type: 'placeSticker', x: point.x, y: point.y });
  };

  /* --- the top bar ------------------------------------------------------ */

  const open = (input: HTMLInputElement) => {
    const picked = input.files?.[0];
    if (!picked) return;
    const entry: WorkFile = {
      id: Date.now(),
      file: picked,
      name: picked.name || 'image',
      size: picked.size,
      rotation: 0,
      pages: null,
    };
    swapped = { uploadId: initialFile.id, entry };
    setFile(entry);
    setNatural({ width: 0, height: 0 });
    dispatch({ type: 'reset' });
    setNote('Editing ' + entry.name + '. Save writes this picture, not the uploaded one.');
  };

  const save = () => {
    if (!file) return;
    setBusy(true);
    setNote('Rendering the full-size picture...');
    void renderEdited(file, state.ops, 'png', 0.92, 0)
      .then((blob) => {
        saveBlob(blob, withSuffix(file.name, '_edited', 'png'));
        setNote('Saved. The full-resolution file is in your downloads.');
      })
      .catch(() => setNote('The picture could not be rendered.'))
      .finally(() => setBusy(false));
  };

  const resizeCount = state.ops.filter((op) => op.kind === 'resize').length;

  const zoomLabel =
    state.zoom === 'fit'
      ? 'Fit'
      : Math.round(Number(state.zoom) * 100) + '%';

  /* --- the fitted size -------------------------------------------------- */

  /*
   * The fit target is measured from the canvas column itself rather than
   * derived from the window width. The old arithmetic subtracted a fixed 742px
   * of chrome, which is only true on a wide screen: on a phone it produced a
   * negative width clamped to 280px, so the picture overflowed a column that
   * was nowhere near that wide. Reading the element is also the only version
   * that stays correct when the layout stacks.
   */
  const [room, setRoom] = useState({ width: 820, height: 560 });
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      setRoom({
        /* The padding is inside the measured box, so take it back off. */
        width: Math.max(120, Math.floor(rect.width - 32)),
        height: Math.max(120, Math.floor(rect.height - 32)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [file]);

  const size = preview ? { width: preview.width, height: preview.height } : { width: 1, height: 1 };
  const fitScale =
    state.zoom === 'fit'
      ? Math.min(room.width / size.width, room.height / size.height, 1)
      : Number(state.zoom);
  const shown = {
    width: Math.max(1, Math.round(size.width * fitScale)),
    height: Math.max(1, Math.round(size.height * fitScale)),
  };

  return (
    /*
     * Phones stack: tab rail on top as a horizontal strip, then the canvas, then
     * the tab's controls. A 72px rail plus a 250px control column plus a canvas
     * cannot share 360px, and the old row layout squeezed the picture to a
     * sliver. From md up there is room for the three-column arrangement.
     */
    <div className="flex min-h-[540px] flex-col items-stretch overflow-hidden rounded-xl border border-line bg-surface text-left shadow-card md:flex-row">
      {/* ---------- left rail ---------- */}
      <nav
        aria-label="Editor tools"
        className="flex shrink-0 overflow-x-auto overflow-y-hidden border-b border-line bg-surface py-1 md:w-[72px] md:flex-col md:overflow-x-hidden md:overflow-y-auto md:border-r md:border-b-0"
      >
        {TABS.map((tab) => {
          const active = state.tab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => dispatch({ type: 'tab', tab: tab.id })}
              aria-pressed={active}
              className={
                /* Fixed-width cells on the phone strip so they scroll evenly;
                   full-width rows once the rail is vertical. */
                'flex w-[68px] shrink-0 flex-col items-center gap-1 px-1 py-2.5 text-[9px] leading-[12px] font-medium tracking-wide uppercase md:w-full ' +
                (active
                  ? 'bg-img-soft text-img-ink'
                  : 'text-muted hover:bg-canvas hover:text-ink-2')
              }
            >
              <TabIcon id={tab.id} />
              <span className="text-center">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ---------- canvas column ---------- */}
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <label
            className="cursor-pointer rounded-md border border-img bg-surface px-3 py-1.5 text-[13px] font-medium text-img-ink hover:bg-img-soft"
            title="Open another picture into the editor"
          >
            Open
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => open(event.currentTarget)}
            />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={busy || !file}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:border-muted disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save'}
          </button>

          <span className="ml-auto flex items-center gap-1 text-[12px] text-muted">
            <span className="mr-1">Zoom</span>
            <select
              aria-label="Zoom"
              value={state.zoom}
              onChange={(event) => dispatch({ type: 'zoom', zoom: event.target.value as Zoom })}
              className="h-7 cursor-pointer rounded border border-line bg-surface px-1 text-[12px] text-ink-2"
            >
              {ZOOMS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="tabular-nums">{zoomLabel}</span>
          </span>

          <span className="flex items-center gap-1">
            <button
              type="button"
              title="Undo"
              aria-label="Undo"
              onClick={() => dispatch({ type: 'undo' })}
              disabled={!state.past.length}
              className="flex h-7 w-7 items-center justify-center rounded-full border-0 bg-canvas text-ink-2 hover:bg-subtle disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" {...strokeStyle}>
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
              </svg>
            </button>
            <button
              type="button"
              title="Redo"
              aria-label="Redo"
              onClick={() => dispatch({ type: 'redo' })}
              disabled={!state.future.length}
              className="flex h-7 w-7 items-center justify-center rounded-full border-0 bg-canvas text-ink-2 hover:bg-subtle disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" {...strokeStyle}>
                <path d="m15 14 5-5-5-5" />
                <path d="M20 9H9a5 5 0 0 0 0 10h3" />
              </svg>
            </button>
            <button
              type="button"
              title="Start over"
              aria-label="Start over"
              onClick={() => {
                dispatch({ type: 'reset' });
                setNote('Every edit has been cleared.');
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full border-0 bg-canvas text-ink-2 hover:bg-subtle"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" {...strokeStyle}>
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 4v5h5" />
              </svg>
            </button>
          </span>
        </div>

        <div
          ref={viewportRef}
          /* On a phone the canvas is the point, so it gets a healthy share of
             the screen before the controls start; on wider screens the row
             layout already gives it everything left over. */
          className="flex min-h-[46vh] min-w-0 flex-1 items-center justify-center overflow-auto p-4 md:min-h-[220px]"
        >
          {file && preview ? (
            <div
              role="presentation"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onClick={clickCanvas}
              className="relative shrink-0 select-none overflow-hidden border border-line shadow-card"
              style={
                {
                  width: shown.width,
                  height: shown.height,
                  touchAction: 'none',
                  cursor: state.tab === 'draw' ? 'crosshair' : 'default',
                  backgroundColor: '#ffffff',
                  backgroundImage:
                    'linear-gradient(45deg, #e2e2ee 25%, transparent 25%, transparent 75%, #e2e2ee 75%, #e2e2ee), linear-gradient(45deg, #e2e2ee 25%, transparent 25%, transparent 75%, #e2e2ee 75%, #e2e2ee)',
                  backgroundSize: TILE + 'px ' + TILE + 'px',
                  backgroundPosition: '0 0, ' + TILE / 2 + 'px ' + TILE / 2 + 'px',
                } as CSSProperties
              }
            >
              <canvas ref={surfaceRef} className="block h-full w-full" aria-label={'Preview of ' + file.name} />
              {state.tab === 'crop' && (
                <div
                  className="pointer-events-none absolute border-2 border-dashed border-img bg-img/15"
                  style={{
                    left: state.cropBox.x * shown.width,
                    top: state.cropBox.y * shown.height,
                    width: state.cropBox.w * shown.width,
                    height: state.cropBox.h * shown.height,
                  }}
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">{file ? 'Loading the picture...' : 'Open a picture to begin.'}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-3 py-1.5 text-[12px] text-muted">
          <span className="truncate">{note || (file ? file.name : 'Nothing open')}</span>
          <span className="shrink-0 tabular-nums">
            {file ? shown.width + ' x ' + shown.height + ' shown' : ''}
          </span>
        </div>
      </div>

      {/* ---------- right column ----------
          A labelled region rather than an <aside>: the tool shell already owns
          the page's complementary landmark, and two unnamed asides make the
          landmark structure ambiguous for a screen reader. */}
      <div
        role="group"
        aria-label="Editor controls"
        className="w-full shrink-0 overflow-y-auto border-t border-line bg-surface p-4 md:w-[250px] md:border-t-0 md:border-l"
      >
        {state.tab === 'light' && <LightColumn state={state} dispatch={dispatch} />}
        {state.tab === 'resize' && (
          <ResizeColumn
            /* Re-seeded after every applied resize so the fields show the size
               the picture now has rather than the one it used to have. */
            key={natural.width + 'x' + natural.height + '-' + resizeCount}
            size={
              natural.width
                ? { width: natural.width, height: natural.height }
                : { width: 1, height: 1 }
            }
            dispatch={dispatch}
          />
        )}
        {state.tab === 'crop' && <CropColumn state={state} dispatch={dispatch} />}
        {state.tab === 'transform' && <TransformColumn dispatch={dispatch} />}
        {state.tab === 'draw' && <DrawColumn state={state} dispatch={dispatch} />}
        {state.tab === 'text' && <TextColumn state={state} dispatch={dispatch} />}
        {state.tab === 'shapes' && <ShapesColumn state={state} dispatch={dispatch} />}
        {state.tab === 'stickers' && <StickersColumn state={state} dispatch={dispatch} />}
        {state.tab === 'frame' && <FrameColumn state={state} dispatch={dispatch} />}
        {state.tab === 'corners' && <CornersColumn state={state} dispatch={dispatch} />}
        {state.tab === 'background' && <BackgroundColumn state={state} dispatch={dispatch} />}
        {state.tab === 'merge' && <MergeColumn state={state} dispatch={dispatch} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the export */

/** Long-edge presets for the saved file; 0 means "keep the edited size". */
const OUTPUT_SIZES = [
  { value: 'original', label: 'Original size' },
  { value: '1920', label: '1920 px' },
  { value: '1280', label: '1280 px' },
  { value: '800', label: '800 px' },
];

const EXPORT_FORMATS: Array<{ value: OutFormat; title: string; body: string }> = [
  { value: 'png', title: 'PNG', body: 'Sharp edges and transparency, the largest file' },
  { value: 'jpg', title: 'JPG', body: 'Smallest file, but transparency becomes white' },
  { value: 'webp', title: 'WEBP', body: 'Small file that keeps transparency' },
];

function PhotoEditorPanel({ values, setValue }: PanelProps) {
  const format = str(values, 'format', 'png') as OutFormat;
  const count = parseOps(values[OPS_KEY]).length;
  return (
    <div className="flex flex-col gap-1">
      <Info>
        The editor's tabs sit on the picture itself. Save options live here: the
        preview you see is replayed from the edits at full resolution, so the
        saved file is the picture, not a screenshot of it.
      </Info>

      <Label>Format</Label>
      <RadioCards
        name="format"
        value={format}
        onChange={(value) => setValue('format', value)}
        options={EXPORT_FORMATS.map((item) => ({
          value: item.value,
          title: item.title,
          body: item.body,
        }))}
      />

      {format !== 'png' && (
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <label className="option-title mb-0" htmlFor="ed-quality">
              Quality
            </label>
            <span className="text-[13px] tabular-nums text-muted">
              {Math.round(num(values, 'quality', 0.92, 0.3, 1) * 100)}%
            </span>
          </div>
          <input
            id="ed-quality"
            type="range"
            className="mb-3 w-full cursor-pointer accent-img"
            min={0.3}
            max={1}
            step={0.01}
            value={num(values, 'quality', 0.92, 0.3, 1)}
            onChange={(event) => setValue('quality', event.target.value)}
          />
        </div>
      )}

      <SelectField
        id="ed-out-size"
        label="Output size"
        value={str(values, 'outSize', 'original')}
        options={OUTPUT_SIZES}
        onChange={(value) => setValue('outSize', value)}
      />

      <Note>
        {count
          ? count + ' edit' + (count === 1 ? '' : 's') + ' recorded. Undo and redo live above the picture.'
          : 'No edits yet. Pick a tab beside the picture to start.'}
      </Note>
    </div>
  );
}

/** The editor itself takes over the work area once a picture is uploaded. */
function PhotoEditorWorkarea({ files, values, setValue }: WorkareaProps) {
  const first = files[0];
  if (!first) return null;
  return (
    <PhotoEditor
      key={first.id}
      initialFile={first}
      initialOps={parseOps(values[OPS_KEY])}
      setValue={setValue}
    />
  );
}

export const photoEditorTool: ToolImpl = {
  Panel: PhotoEditorPanel,
  Workarea: PhotoEditorWorkarea,

  async run({ files, values, setProgress, setStatus }) {
    const ops = parseOps(values[OPS_KEY]);
    const format = str(values, 'format', 'png') as OutFormat;
    const quality = num(values, 'quality', 0.92, 0.3, 1);
    const size = str(values, 'outSize', 'original');
    const longEdge = size === 'original' ? 0 : Number(size);
    const out: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const uploaded = files[i];
      /*
       * A picture opened from the editor's top bar replaces the one that was
       * uploaded, so the export writes the picture the visitor was looking at
       * rather than the bytes they arrived with.
       */
      const file =
        swapped && swapped.uploadId === uploaded.id ? swapped.entry : uploaded;
      setStatus('Rendering ' + file.name + '...');
      const blob = await renderEdited(file, ops, format, quality, longEdge);
      out.push({
        name: withSuffix(file.name, '_edited', FORMAT_EXT[format]),
        blob,
        size: blob.size,
      });
      setProgress(((i + 1) / files.length) * 100);
    }

    return out;
  },
};
