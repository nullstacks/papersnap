/**
 * Image edit tools: Crop and Rotate.
 *
 * Both tools run through the same engine the optimisers use - decode, draw,
 * re-encode - so an edit costs one canvas pass and no byte ever leaves the tab.
 *
 * Crop keeps its rectangle in the shared values bag rather than in local state.
 * The sidebar number inputs and the on-canvas handles are then two views of one
 * rectangle instead of two copies that can drift apart, and run() reads back
 * exactly what the visitor saw.
 */
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  FORMAT_EXT,
  crop,
  decodeBlob,
  encode,
  transform,
  withSuffix,
  type OutFormat,
} from '@/lib/image';
import { prettySize } from '@/lib/format';
import type {
  FieldValues,
  PanelProps,
  ResultFile,
  ToolImpl,
  WorkareaProps,
  WorkFile,
} from '@/types';
import {
  ActionButton,
  ActionRow,
  CheckboxField,
  Field,
  FieldRow,
  Info,
  Label,
  RadioCards,
  TextField,
} from '@/components/controls';

/* ------------------------------------------------------------------ shared */

type SetValue = (name: string, value: string | boolean | null) => void;

/** Join class names, dropping the falsy branches of a conditional. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p)).join(' ');
}

/** Read a string option with a fallback. */
function str(values: FieldValues, name: string, fallback = ''): string {
  const v = values[name];
  return typeof v === 'string' && v !== '' ? v : fallback;
}

/**
 * What an input should display. Unlike str() an emptied field stays empty,
 * otherwise the fallback would refill it on the next keystroke and the visitor
 * could never clear a value to retype it.
 */
function shown(values: FieldValues, name: string, fallback: string): string {
  const v = values[name];
  return typeof v === 'string' ? v : fallback;
}

/** Read a boolean option with a fallback. */
function flag(values: FieldValues, name: string, fallback = false): boolean {
  const v = values[name];
  return typeof v === 'boolean' ? v : fallback;
}

/** Read a number option with a fallback, ignoring anything unparseable. */
function num(values: FieldValues, name: string, fallback: number): number {
  const raw = values[name];
  const n = typeof raw === 'string' ? parseFloat(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** The output extension for a source file, defaulting to the source's own. */
function extFor(file: WorkFile, preferred?: OutFormat): string {
  if (preferred) return FORMAT_EXT[preferred];
  const m = (file.name || '').match(/\.([a-z0-9]+)$/i);
  const ext = (m?.[1] ?? 'jpg').toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

/**
 * An output format the browser can encode. The edit tools always keep the
 * source format: cropping a PNG must not silently turn it into a JPEG.
 */
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

/* =================================================================== CROP */

/** Aspect presets, shared by the sidebar radios and the pills under the canvas. */
const RATIOS = [
  { value: 'free', label: 'Free', ratio: 0 },
  { value: '1:1', label: '1:1', ratio: 1 },
  { value: '4:3', label: '4:3', ratio: 4 / 3 },
  { value: '3:2', label: '3:2', ratio: 3 / 2 },
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
] as const;

/** Rotation presets. The value is the clockwise angle handed to the engine. */
const ROTATIONS = [
  { value: '0', label: 'None' },
  { value: '90', label: '90 CW' },
  { value: '180', label: '180' },
  { value: '270', label: '90 CCW' },
] as const;

/** The numeric ratio for a preset value; 0 means the box is unconstrained. */
function ratioOf(value: string): number {
  const found = RATIOS.find((r) => r.value === value);
  return found ? found.ratio : 0;
}

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

/** Smallest rectangle a drag may produce, in source pixels. */
const MIN_CROP = 8;

/*
 * The eight grab points, expressed as a fraction of the crop rectangle so the
 * same table works at any display size. Corners resize both axes, edges one.
 */
const HANDLES: Array<{ id: HandleId; fx: number; fy: number; cursor: string }> = [
  { id: 'nw', fx: 0, fy: 0, cursor: 'cursor-nwse-resize' },
  { id: 'n', fx: 0.5, fy: 0, cursor: 'cursor-ns-resize' },
  { id: 'ne', fx: 1, fy: 0, cursor: 'cursor-nesw-resize' },
  { id: 'e', fx: 1, fy: 0.5, cursor: 'cursor-ew-resize' },
  { id: 'se', fx: 1, fy: 1, cursor: 'cursor-nwse-resize' },
  { id: 's', fx: 0.5, fy: 1, cursor: 'cursor-ns-resize' },
  { id: 'sw', fx: 0, fy: 1, cursor: 'cursor-nesw-resize' },
  { id: 'w', fx: 0, fy: 0.5, cursor: 'cursor-ew-resize' },
];

function clampNum(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** A rectangle that cannot fall outside the image or collapse to nothing. */
function clampBox(box: Box, imgW: number, imgH: number): Box {
  const maxW = Math.max(1, imgW);
  const maxH = Math.max(1, imgH);
  const w = clampNum(Math.round(box.w), Math.min(MIN_CROP, maxW), maxW);
  const h = clampNum(Math.round(box.h), Math.min(MIN_CROP, maxH), maxH);
  const x = clampNum(Math.round(box.x), 0, maxW - w);
  const y = clampNum(Math.round(box.y), 0, maxH - h);
  return { x, y, w, h };
}

/**
 * The rectangle currently in the values bag, repaired against the image.
 * An empty bag means "keep everything", which is also the state the workarea
 * seeds on its first render.
 */
function readBox(values: FieldValues, imgW: number, imgH: number): Box {
  return clampBox(
    {
      x: num(values, 'cropX', 0),
      y: num(values, 'cropY', 0),
      w: num(values, 'cropW', imgW),
      h: num(values, 'cropH', imgH),
    },
    imgW,
    imgH,
  );
}

/** Push a rectangle back out to the panel inputs and the handles at once. */
function writeBox(setValue: SetValue, box: Box): void {
  setValue('cropX', String(Math.round(box.x)));
  setValue('cropY', String(Math.round(box.y)));
  setValue('cropW', String(Math.round(box.w)));
  setValue('cropH', String(Math.round(box.h)));
}

/** Largest rectangle of the wanted ratio that still fits, centred on the box. */
function fitRatio(box: Box, ratio: number, imgW: number, imgH: number): Box {
  if (ratio <= 0) return box;
  let w = box.w;
  let h = w / ratio;
  if (h > box.h) {
    h = box.h;
    w = h * ratio;
  }
  w = Math.min(w, imgW);
  h = Math.min(h, imgH);
  return clampBox({ x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }, imgW, imgH);
}

/** Translate the rectangle, with a little magnetism for the image border. */
function moveBox(box: Box, dx: number, dy: number, imgW: number, imgH: number, snap: number): Box {
  let x = box.x + dx;
  let y = box.y + dy;
  if (Math.abs(x) <= snap) x = 0;
  if (Math.abs(imgW - (x + box.w)) <= snap) x = imgW - box.w;
  if (Math.abs(y) <= snap) y = 0;
  if (Math.abs(imgH - (y + box.h)) <= snap) y = imgH - box.h;
  return { x: clampNum(x, 0, imgW - box.w), y: clampNum(y, 0, imgH - box.h), w: box.w, h: box.h };
}

/** A fresh rectangle drawn from an origin towards the pointer, in any direction. */
function drawBox(
  origin: Point,
  point: Point,
  ratio: number,
  imgW: number,
  imgH: number,
  snap: number,
): Box {
  let px = clampNum(point.x, 0, imgW);
  let py = clampNum(point.y, 0, imgH);
  if (Math.abs(px) <= snap) px = 0;
  if (Math.abs(imgW - px) <= snap) px = imgW;
  if (Math.abs(py) <= snap) py = 0;
  if (Math.abs(imgH - py) <= snap) py = imgH;

  let w = Math.max(MIN_CROP, Math.abs(px - origin.x));
  let h = Math.max(MIN_CROP, Math.abs(py - origin.y));
  if (ratio > 0) {
    /* Grow away from the origin, so the corner the visitor grabbed stays put. */
    if (w / h > ratio) h = w / ratio;
    else w = h * ratio;
  }
  const x = px >= origin.x ? origin.x : origin.x - w;
  const y = py >= origin.y ? origin.y : origin.y - h;
  return clampBox({ x, y, w, h }, imgW, imgH);
}

/** Resize from one handle, keeping the opposite edge anchored. */
function resizeBox(
  handle: HandleId,
  box: Box,
  dx: number,
  dy: number,
  ratio: number,
  imgW: number,
  imgH: number,
  snap: number,
): Box {
  const west = handle === 'w' || handle === 'nw' || handle === 'sw';
  const east = handle === 'e' || handle === 'ne' || handle === 'se';
  const north = handle === 'n' || handle === 'nw' || handle === 'ne';
  const south = handle === 's' || handle === 'sw' || handle === 'se';
  const right = box.x + box.w;
  const bottom = box.y + box.h;

  let w = west ? right - (box.x + dx) : east ? box.w + dx : box.w;
  let h = north ? bottom - (box.y + dy) : south ? box.h + dy : box.h;
  w = clampNum(w, MIN_CROP, imgW);
  h = clampNum(h, MIN_CROP, imgH);

  if (ratio > 0) {
    /*
     * A locked ratio needs one axis to lead. On an edge handle the dragged
     * axis leads, so pulling the east edge right grows the rectangle instead
     * of being trimmed straight back by the untouched height. On a corner the
     * pointer moves both ways, so whichever axis moved further leads.
     *
     * The leader is then capped by the room left between the anchor and the
     * image border. Clamping afterwards would shear the shape, which is the
     * one thing a locked ratio promises not to do.
     */
    const horizontal = handle === 'e' || handle === 'w';
    const vertical = handle === 'n' || handle === 's';
    const leadWidth = horizontal
      ? true
      : vertical
        ? false
        : Math.abs(dx) / Math.max(1, box.w) >= Math.abs(dy) / Math.max(1, box.h);

    /* Room available from the anchored side, in each axis. A centred handle
       grows both ways, so it can only use half the distance to either border. */
    const cx = west ? right : east ? box.x : box.x + box.w / 2;
    const cy = north ? bottom : south ? box.y : box.y + box.h / 2;
    const spanX = west ? right : east ? imgW - box.x : 2 * Math.min(cx, imgW - cx);
    const spanY = north ? bottom : south ? imgH - box.y : 2 * Math.min(cy, imgH - cy);

    if (leadWidth) {
      w = Math.min(w, spanX, spanY * ratio);
      h = w / ratio;
    } else {
      h = Math.min(h, spanY, spanX / ratio);
      w = h * ratio;
    }
    /* The ratio still has to leave both sides above the minimum. */
    if (w < MIN_CROP) {
      w = MIN_CROP;
      h = w / ratio;
    }
    if (h < MIN_CROP) {
      h = MIN_CROP;
      w = h * ratio;
    }
  }

  let x = west ? right - w : east ? box.x : box.x + (box.w - w) / 2;
  let y = north ? bottom - h : south ? box.y : box.y + (box.h - h) / 2;

  /*
   * Free drags snap to the image border; a locked ratio does not, because
   * nudging one edge by a few pixels would break the shape just requested.
   */
  if (ratio <= 0) {
    if (west && x <= snap) {
      w += x;
      x = 0;
    }
    if (east && imgW - (x + w) <= snap) w = imgW - x;
    if (north && y <= snap) {
      h += y;
      y = 0;
    }
    if (south && imgH - (y + h) <= snap) h = imgH - y;
  }

  return clampBox({ x, y, w, h }, imgW, imgH);
}

/**
 * The crop canvas.
 *
 * The image is displayed at its own aspect ratio inside a shrink-wrapped box,
 * so client coordinates map straight back to source pixels through that box's
 * rect. The rectangle itself lives in the values bag, which is what keeps the
 * sidebar inputs and these handles in step.
 */
function CropWorkarea({ files, values, setValue, requestUpdate }: WorkareaProps) {
  const file = files[0];
  const imgW = file?.width ?? 0;
  const imgH = file?.height ?? 0;
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [source, setSource] = useState('');

  /* An object URL keeps the preview local; it is revoked as soon as the file
     changes so a long session cannot pile up blob handles. */
  useEffect(() => {
    if (!file) {
      setSource('');
      return;
    }
    const url = URL.createObjectURL(file.file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /* Seed the rectangle to the whole image once its size is known, so the panel
     inputs and the handles describe the same area from the first paint. */
  useEffect(() => {
    if (!imgW || !imgH) return;
    const hasW = typeof values.cropW === 'string' && values.cropW !== '';
    const hasH = typeof values.cropH === 'string' && values.cropH !== '';
    if (hasW && hasH) return;
    writeBox(setValue, { x: 0, y: 0, w: imgW, h: imgH });
  }, [imgW, imgH, values.cropW, values.cropH, setValue]);

  /*
   * Changing the preset reshapes the current rectangle in place. The ref guard
   * matters: without it every render would reshape the box again and undo the
   * drag the visitor just made, since a dragged box rarely matches exactly.
   */
  const ratioValue = str(values, 'cropRatio', 'free');
  const ratio = ratioOf(ratioValue);
  const appliedRatio = useRef(ratioValue);
  useEffect(() => {
    if (appliedRatio.current === ratioValue) return;
    appliedRatio.current = ratioValue;
    if (!imgW || !imgH || ratio <= 0) return;
    writeBox(setValue, fitRatio(readBox(values, imgW, imgH), ratio, imgW, imgH));
    requestUpdate();
  }, [ratioValue, ratio, imgW, imgH, values, setValue, requestUpdate]);

  const box = readBox(values, imgW, imgH);
  const pct = (n: number, total: number) => (n / Math.max(1, total)) * 100;

  const toImage = (clientX: number, clientY: number): Point => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * imgW,
      y: ((clientY - rect.top) / rect.height) * imgH,
    };
  };

  /*
   * One gesture handler for all three interactions. The rectangle is rebuilt
   * from the geometry captured at pointer-down plus the total delta, never from
   * the current values: those change on every move, so reading them back would
   * make the drag chase its own tail.
   */
  const beginDrag = (mode: 'move' | 'draw' | HandleId, event: ReactPointerEvent<HTMLElement>) => {
    if (!imgW || !imgH || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = surfaceRef.current?.getBoundingClientRect();
    /* Magnetism is felt in screen pixels but expressed in source pixels, so the
       threshold has to follow the display scale. */
    const snap = rect && rect.width ? (6 / rect.width) * imgW : 6;
    const start = toImage(event.clientX, event.clientY);
    const startBox = box;
    const pointerId = event.pointerId;

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const point = toImage(ev.clientX, ev.clientY);
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      const next =
        mode === 'draw'
          ? drawBox(start, point, ratio, imgW, imgH, snap)
          : mode === 'move'
            ? moveBox(startBox, dx, dy, imgW, imgH, snap)
            : resizeBox(mode, startBox, dx, dy, ratio, imgW, imgH, snap);
      writeBox(setValue, next);
    };

    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      /* Only the settled rectangle can change readiness, so the bump waits. */
      requestUpdate();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const onSurfaceDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!imgW || !imgH) return;
    const p = toImage(e.clientX, e.clientY);
    const inside = p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
    /* Pressing inside moves the box; pressing the dimmed area starts a new one. */
    beginDrag(inside ? 'move' : 'draw', e);
  };

  if (!file || !imgW || !imgH) {
    return (
      <div className="mx-auto mt-6 max-w-[860px] rounded-lg border border-line bg-surface p-8 text-center text-sm text-muted">
        {file?.error
          ? 'That image could not be read, so there is nothing to crop.'
          : 'Measuring the image, one moment.'}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[860px] px-1 pb-6">
      <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
        <div className="flex justify-center">
          <div
            ref={surfaceRef}
            onPointerDown={onSurfaceDown}
            className="relative touch-none select-none"
            data-testid="crop-surface"
          >
            <img
              src={source}
              alt={file.name}
              draggable={false}
              className="block max-h-[520px] w-auto max-w-full"
            />
            {/*
             * Decoration only. The surface above owns the pointer, so a press
             * anywhere either moves the rectangle or starts a fresh one.
             */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div
                className="absolute bg-black/45"
                style={{ left: 0, top: 0, width: '100%', height: String(pct(box.y, imgH)) + '%' }}
              />
              <div
                className="absolute bg-black/45"
                style={{
                  left: 0,
                  top: String(pct(box.y + box.h, imgH)) + '%',
                  width: '100%',
                  bottom: 0,
                }}
              />
              <div
                className="absolute bg-black/45"
                style={{
                  left: 0,
                  top: String(pct(box.y, imgH)) + '%',
                  width: String(pct(box.x, imgW)) + '%',
                  height: String(pct(box.h, imgH)) + '%',
                }}
              />
              <div
                className="absolute bg-black/45"
                style={{
                  left: String(pct(box.x + box.w, imgW)) + '%',
                  top: String(pct(box.y, imgH)) + '%',
                  right: 0,
                  height: String(pct(box.h, imgH)) + '%',
                }}
              />
              <div
                className="absolute border border-white/95 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                style={{
                  left: String(pct(box.x, imgW)) + '%',
                  top: String(pct(box.y, imgH)) + '%',
                  width: String(pct(box.w, imgW)) + '%',
                  height: String(pct(box.h, imgH)) + '%',
                }}
              >
                {/* Rule-of-thirds guides, as the reference draws them. */}
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/50" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/50" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/50" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/50" />
              </div>
            </div>
            {/*
             * Handles sit outside the aria-hidden layer. They are pointer-only
             * affordances by design: the four number inputs in the sidebar are
             * the keyboard path to the same rectangle.
             */}
            {HANDLES.map((h) => (
              <span
                key={h.id}
                aria-hidden="true"
                onPointerDown={(e) => beginDrag(h.id, e)}
                className={cx(
                  'pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-[3px]',
                  'border border-white bg-img shadow-[0_0_0_1px_rgba(0,0,0,0.45)]',
                  h.cursor,
                )}
                style={{
                  left: String(pct(box.x + box.w * h.fx, imgW)) + '%',
                  top: String(pct(box.y + box.h * h.fy, imgH)) + '%',
                }}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {RATIOS.map((r) => {
              const active = ratioValue === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setValue('cropRatio', r.value)}
                  aria-pressed={active}
                  className={cx(
                    'rounded-md border px-2.5 py-1.5 text-[13px] font-medium',
                    active
                      ? 'border-img bg-img-soft text-img-ink'
                      : 'border-line bg-surface text-muted hover:border-muted hover:text-ink-2',
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <span
            className="rounded bg-canvas px-2 py-1 text-[13px] font-medium text-ink-2"
            data-testid="crop-size"
          >
            {String(box.w)} x {String(box.h)} px
          </span>
        </div>

        <p className="mt-3 text-[13px] leading-[18px] text-muted">
          {file.name} - {String(imgW)} x {String(imgH)} px - {prettySize(file.size)}. Drag a handle
          to resize, drag inside to move, or drag the dimmed area to start a new crop.
        </p>
      </div>
    </div>
  );
}

function CropPanel({ files, values, setValue, requestUpdate }: PanelProps) {
  const first = files[0];
  const imgW = first?.width ?? 0;
  const imgH = first?.height ?? 0;
  const box = readBox(values, imgW || 1, imgH || 1);

  return (
    <div className="flex flex-col gap-1">
      <Info>Drag the handles to choose the area you want to keep.</Info>

      <Label>Aspect ratio</Label>
      <RadioCards
        name="cropRatio"
        value={str(values, 'cropRatio', 'free')}
        onChange={(v) => {
          setValue('cropRatio', v);
          requestUpdate();
        }}
        options={RATIOS.map((r) => ({ value: r.value, title: r.label }))}
      />

      <CheckboxField
        label="Flip horizontally"
        checked={flag(values, 'flipH', false)}
        onChange={(v) => {
          setValue('flipH', v);
          requestUpdate();
        }}
      />
      <CheckboxField
        label="Flip vertically"
        checked={flag(values, 'flipV', false)}
        onChange={(v) => {
          setValue('flipV', v);
          requestUpdate();
        }}
      />

      <Label>Rotation</Label>
      <RadioCards
        name="cropRotate"
        value={str(values, 'cropRotate', '0')}
        onChange={(v) => {
          setValue('cropRotate', v);
          requestUpdate();
        }}
        options={ROTATIONS.map((r) => ({ value: r.value, title: r.label }))}
      />

      <Label>Crop area</Label>
      <p className="mb-2 text-[13px] leading-[18px] text-muted">
        {imgW && imgH
          ? 'The image is ' +
            String(imgW) +
            ' x ' +
            String(imgH) +
            ' px. Keeping ' +
            String(box.w) +
            ' x ' +
            String(box.h) +
            ' px from ' +
            String(box.x) +
            ', ' +
            String(box.y) +
            '.'
          : 'Measuring the image before it can be cropped.'}
      </p>
      <FieldRow>
        <Field>
          <TextField
            id="crop-x"
            label="X"
            type="number"
            min={0}
            value={shown(values, 'cropX', String(box.x))}
            onChange={(v) => setValue('cropX', v)}
          />
        </Field>
        <Field>
          <TextField
            id="crop-y"
            label="Y"
            type="number"
            min={0}
            value={shown(values, 'cropY', String(box.y))}
            onChange={(v) => setValue('cropY', v)}
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field>
          <TextField
            id="crop-w"
            label="Width"
            type="number"
            min={1}
            value={shown(values, 'cropW', String(box.w))}
            onChange={(v) => setValue('cropW', v)}
          />
        </Field>
        <Field>
          <TextField
            id="crop-h"
            label="Height"
            type="number"
            min={1}
            value={shown(values, 'cropH', String(box.h))}
            onChange={(v) => setValue('cropH', v)}
          />
        </Field>
      </FieldRow>
    </div>
  );
}

export const cropImageTool: ToolImpl = {
  Panel: CropPanel,

  /*
   * The full editor belongs on the canvas: a 300px sidebar cannot show a
   * rectangle that is 1600px wide. The file cards give way to the editor, which
   * is also how the reference behaves.
   */
  Workarea: CropWorkarea,

  isReady: ({ files, values }) => {
    const file = files[0];
    if (!file) return false;
    const w = file.width ?? 0;
    const h = file.height ?? 0;
    /* Before the decoder has measured the image there is nothing to judge. */
    if (!w || !h) return true;
    const box = readBox(values, w, h);
    return box.w > 0 && box.h > 0;
  },

  async run({ files, values, setProgress, setStatus }) {
    const file = files[0];
    if (!file) throw new Error('Add an image first, then press the button.');

    setStatus('Cropping ' + file.name + '...');
    const { bmp, width, height } = await decodeBlob(file.file);

    /* Measure against the decoded size, not the card's cached one: an SVG can
       report a different size once it has real pixels. */
    const box = readBox(values, width, height);
    const kept = crop(bmp, box);

    /*
     * Crop, then transform. The engine composes rotate-then-flip in one pass,
     * which is the order the reference applies and the only one where the flip
     * means what the visitor sees after rotating.
     */
    const canvas = transform(kept, box.w, box.h, {
      rotate: num(values, 'cropRotate', 0),
      flipH: flag(values, 'flipH', false),
      flipV: flag(values, 'flipV', false),
    });

    const format = formatFor(file);
    const blob = await encode(canvas, format, 0.92);
    setProgress(100);

    return [imageResult(blob, withSuffix(file.name, '_cropped', FORMAT_EXT[format]))];
  },
};

/* ================================================================= ROTATE */

/**
 * Per-file flips, keyed by WorkFile id and stored as JSON in the values bag.
 *
 * Rotation is queued on the WorkFile itself - the same rotation field the
 * card's own rotate button writes - so the thumbnail the visitor sees and the
 * bytes they download cannot disagree. Flips have no such field, hence this
 * map, keyed by id because one run can rotate a whole batch and every file may
 * need a different answer.
 */
const FLIP_KEY = 'imgFlips';

interface Flips {
  h: boolean;
  v: boolean;
}

const NO_FLIPS: Flips = { h: false, v: false };

function readFlips(values: FieldValues): Record<string, Flips> {
  const raw = values[FLIP_KEY];
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Flips>) : {};
  } catch {
    /* A half-written value should behave like "no flips", never throw. */
    return {};
  }
}

function flipOf(flips: Record<string, Flips>, id: number): Flips {
  return flips[String(id)] ?? NO_FLIPS;
}

/** A short human label for a queued transform, used in the per-file list. */
function queueLabel(rotation: number, flips: Flips): string {
  const parts: string[] = [];
  if (rotation === 90) parts.push('90 CW');
  else if (rotation === 180) parts.push('180');
  else if (rotation === 270) parts.push('90 CCW');
  if (flips.h) parts.push('flip H');
  if (flips.v) parts.push('flip V');
  return parts.length ? parts.join(' + ') : 'unchanged';
}

function RotateGlyph({ left }: { left?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
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

function FlipGlyph({ vertical }: { vertical?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {vertical ? (
        <>
          <path d="M4 12h16" strokeDasharray="2 3" />
          <path d="M12 3v4M9.5 5.5 12 3l2.5 2.5" />
          <path d="M12 21v-4M9.5 18.5 12 21l2.5-2.5" />
        </>
      ) : (
        <>
          <path d="M12 4v16" strokeDasharray="2 3" />
          <path d="M3 12h4M5.5 9.5 3 12l2.5 2.5" />
          <path d="M21 12h-4M18.5 9.5 21 12l-2.5 2.5" />
        </>
      )}
    </svg>
  );
}

/** Which files a queued action applies to, mirroring the reference's filter row. */
const SCOPES = [
  { value: 'all', label: 'All' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
] as const;

/**
 * Does this file belong to the chosen scope? Orientation comes from the pixel
 * size the shell already measured. A file whose size is not known yet answers
 * only to "All", which is the only claim we can honestly make about it.
 */
function inScope(file: WorkFile, scope: string): boolean {
  if (scope === 'portrait') return Boolean(file.width && file.height && file.height > file.width);
  if (scope === 'landscape') return Boolean(file.width && file.height && file.width > file.height);
  return true;
}

/**
 * The reference's full-width transform button: a blue glyph tile on the left,
 * then the label. Custom markup rather than ActionButton because the glyph
 * needs its own solid block to read as a control at this size.
 */
function BigAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-stretch overflow-hidden rounded-lg border border-line bg-surface text-left text-[13px] font-medium tracking-wide text-ink-2 hover:border-ink-2"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-img text-white">
        {children}
      </span>
      <span className="flex items-center px-3">{label}</span>
    </button>
  );
}

function ScopeGlyph({ kind }: { kind: 'all' | 'portrait' | 'landscape' }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      {kind === 'all' && (
        <>
          <rect x="3" y="7" width="10" height="13" rx="1" />
          <rect x="14" y="4" width="7" height="13" rx="1" />
        </>
      )}
      {kind === 'portrait' && <rect x="7" y="3" width="10" height="18" rx="1" />}
      {kind === 'landscape' && <rect x="3" y="7" width="18" height="10" rx="1" />}
    </svg>
  );
}

function RotateImagePanel({ files, values, setValue, requestUpdate }: PanelProps) {
  const flips = readFlips(values);
  const scope = str(values, 'rotScope', 'all');
  const targets = files.filter((f) => inScope(f, scope));

  /*
   * Rotation is written straight onto the WorkFile, exactly as the card's own
   * rotate button does. The shell's readiness memo keys off the files array's
   * identity, which an in-place mutation does not change, so the queued total is
   * mirrored into the values bag to force it to recompute. Nothing reads that
   * mirror back.
   */
  const publish = () => {
    setValue('rotQueue', files.map((f) => f.rotation).join(','));
    requestUpdate();
  };

  const turn = (delta: number) => {
    for (const f of targets) f.rotation = (((f.rotation + delta) % 360) + 360) % 360;
    publish();
  };

  /*
   * Flips are toggles on the selected scope only, so selecting Portrait and
   * pressing "Flip horizontal" leaves the landscape shots alone. The map is
   * rebuilt rather than mutated because the values bag is replaced wholesale.
   */
  const flip = (axis: 'h' | 'v') => {
    const next: Record<string, Flips> = { ...flips };
    for (const f of targets) {
      const key = String(f.id);
      const current = next[key] ?? NO_FLIPS;
      next[key] = {
        h: axis === 'h' ? !current.h : current.h,
        v: axis === 'v' ? !current.v : current.v,
      };
    }
    setValue(FLIP_KEY, JSON.stringify(next));
    requestUpdate();
  };

  /* Reset clears the whole batch, not just the selected scope: "all" in the
     label refers to every file, which is what the reference resets. */
  const resetAll = () => {
    for (const f of files) f.rotation = 0;
    setValue(FLIP_KEY, '');
    publish();
  };

  const queued = files.filter((f) => {
    const q = flipOf(flips, f.id);
    return f.rotation !== 0 || q.h || q.v;
  }).length;

  return (
    <div className="flex flex-col gap-1">
      <Info>
        Mouse over IMAGE file below and a icon will appear, click on it to rotate your IMAGEs.
      </Info>

      <Label>Select files to rotate:</Label>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {SCOPES.map((s) => {
          const active = scope === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setValue('rotScope', s.value)}
              aria-pressed={active}
              className={cx(
                'flex flex-col items-center gap-1 rounded-lg border bg-surface px-1 py-2',
                'text-[13px] font-medium',
                active
                  ? 'border-img text-img-ink'
                  : 'border-line text-muted hover:border-muted hover:text-ink-2',
              )}
            >
              <ScopeGlyph kind={s.value} />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-3">
        <button
          type="button"
          onClick={resetAll}
          className="text-[13px] font-medium text-img-ink hover:underline"
        >
          Reset all
        </button>
      </div>

      <Label>Rotation</Label>
      <div className="mb-3 flex flex-col gap-2">
        <BigAction label="RIGHT" onClick={() => turn(90)}>
          <RotateGlyph />
        </BigAction>
        <BigAction label="LEFT" onClick={() => turn(-90)}>
          <RotateGlyph left />
        </BigAction>
      </div>

      {/*
       * The reference puts flipping on the file card itself. We keep the cards
       * generic, so the two flips live here as secondary controls under the
       * rotation pair.
       */}
      <ActionRow>
        <ActionButton onClick={() => flip('h')}>
          <FlipGlyph />
          <span>Flip horizontal</span>
        </ActionButton>
        <ActionButton onClick={() => flip('v')}>
          <FlipGlyph vertical />
          <span>Flip vertical</span>
        </ActionButton>
      </ActionRow>

      <p className="text-sm leading-[18px] text-muted">
        {queued > 0
          ? String(queued) + ' image' + (queued === 1 ? '' : 's') + ' will be rotated.'
          : 'Nothing queued yet: every file would come back unchanged.'}
      </p>

      {/*
       * A batch can be transformed differently file by file, so the queue is
       * only trustworthy while it is visible. The list scrolls rather than
       * pushing the last controls off the column.
       */}
      {files.length > 1 && (
        <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-line bg-surface text-[13px]">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 border-b border-line px-2 py-1.5 last:border-b-0"
            >
              <span className="truncate text-muted" title={f.name}>
                {f.name}
              </span>
              <span className="shrink-0 font-medium text-ink-2">
                {queueLabel(f.rotation, flipOf(flips, f.id))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const rotateImageTool: ToolImpl = {
  Panel: RotateImagePanel,

  /* Rotating nothing would hand back an identical file, so gate the CTA. */
  isReady: ({ files, values }) => {
    const flips = readFlips(values);
    return files.some((f) => {
      const q = flipOf(flips, f.id);
      return f.rotation !== 0 || q.h || q.v;
    });
  },

  async run({ files, values, setProgress, setStatus }) {
    const flips = readFlips(values);
    const out: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const queued = flipOf(flips, file.id);
      const rotate = ((file.rotation % 360) + 360) % 360;

      if (!rotate && !queued.h && !queued.v) {
        /*
         * Untouched files still belong in the result set, otherwise a batch
         * shrinks behind the visitor's back. Passing the original bytes through
         * is also the only lossless answer for a file that needs nothing.
         */
        setStatus('Copying ' + file.name + '...');
        out.push(imageResult(file.file, withSuffix(file.name, '_rotated', extFor(file))));
        setProgress(((i + 1) / files.length) * 100);
        continue;
      }

      setStatus('Rotating ' + file.name + '...');
      const { bmp, width, height } = await decodeBlob(file.file);
      const canvas = transform(bmp, width, height, {
        rotate,
        flipH: queued.h,
        flipV: queued.v,
      });
      const format = formatFor(file);
      const blob = await encode(canvas, format, 0.92);
      out.push(imageResult(blob, withSuffix(file.name, '_rotated', FORMAT_EXT[format])));
      setProgress(((i + 1) / files.length) * 100);
    }

    return out;
  },
};