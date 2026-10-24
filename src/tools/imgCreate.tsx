/**
 * Meme generator: two captions, optional overlays and free text layers, all
 * burnt into one PNG.
 *
 * The engine's memeText() draws the classic Impact caption with a black
 * outline, so the tool only has to decide where the words go: inside the
 * picture (the familiar top and bottom bars) or outside it, where the canvas is
 * grown to hold them. The preview and the export run through the same builder,
 * so what the visitor drags into place is what gets written.
 * Nothing is uploaded: the picture is decoded from its File and written back
 * out as a Blob.
 */
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  decodeBlob,
  decodeBytes,
  encode,
  fitInside,
  memeText,
  surface,
  withSuffix,
  type Bitmap,
} from '@/lib/image';
import type { FieldValues, PanelProps, ResultFile, ToolImpl, WorkareaProps } from '@/types';
import {
  ActionButton,
  ColorField,
  Info,
  Label,
  Note,
  RadioCards,
  TextArea,
} from '@/components/controls';

/* ------------------------------------------------------------------ shared */

/** Read a string option, falling back when it is absent or empty. */
function str(values: FieldValues, name: string, fallback = ''): string {
  const v = values[name];
  return typeof v === 'string' && v !== '' ? v : fallback;
}

/** Read the raw text of a field, so a caption can be cleared while retyping. */
function shown(values: FieldValues, name: string, fallback = ''): string {
  const v = values[name];
  return typeof v === 'string' ? v : fallback;
}

/** Keep a fraction inside the picture. */
function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/** A point on the picture, as fractions of its width and height. */
interface Point {
  x: number;
  y: number;
}

/** A free text layer the visitor can drop anywhere. */
interface TextLayer extends Point {
  id: number;
  text: string;
}

/**
 * A second picture laid over the meme.
 *
 * x and y are the centre as canvas fractions. They stay optional: an overlay
 * that has never been dragged is stacked down the right edge by the builder,
 * and only a dragged one carries a stored position.
 */
interface Overlay {
  token: string;
  name: string;
  x?: number;
  y?: number;
}

/** An overlay with its pixels resolved, as the builder and the preview want it. */
interface ResolvedOverlay {
  token: string;
  bmp: Bitmap;
  x?: number;
  y?: number;
}

/** The bare token list this tool used before overlays could be dragged. */
interface LegacyExtra {
  token: string;
  name?: string;
}

/** Which end of the canvas grows to hold the outside captions. */
type Grow = 'both' | 'top' | 'bottom';

const MODE_KEY = 'memeMode';
const GROW_KEY = 'memeGrow';
const TEXT_LAYERS_KEY = 'memeTexts';
const OVERLAYS_KEY = 'memeOverlays';
const LEGACY_EXTRAS_KEY = 'memeExtras';
const POSITIONS_KEY = 'memePositions';

/** Where the captions sit before anyone drags them. */
const DEFAULT_TOP: Point = { x: 0.5, y: 0.08 };
const DEFAULT_BOTTOM: Point = { x: 0.5, y: 0.92 };

/**
 * Extra pictures chosen with ADD IMAGE.
 *
 * Field values have to stay serialisable, so the value bag carries a token and
 * the decoded bitmap lives here beside it. Module level because the preview and
 * run() both need the same pixels.
 */
const extraFiles = new Map<string, File>();
const extraBitmaps = new Map<string, Bitmap>();

function extraKey(file: File): string {
  return file.name + ':' + file.size + ':' + file.lastModified;
}

/** Decode an overlay picture once, and hand back the token that names it. */
async function keepExtra(file: File): Promise<string> {
  const key = extraKey(file);
  extraFiles.set(key, file);
  if (!extraBitmaps.has(key)) {
    const { bmp } = await decodeBlob(file);
    extraBitmaps.set(key, bmp);
  }
  return key;
}

/**
 * Resolve the tokens recorded in the value bag back into pixels.
 *
 * An overlay whose bitmap is gone - which can only happen after the module was
 * reloaded, since the cache is module level - is skipped rather than drawn as a
 * blank rectangle.
 */
function decodeOverlays(overlays: Overlay[]): ResolvedOverlay[] {
  const out: ResolvedOverlay[] = [];
  for (const overlay of overlays) {
    const bmp = extraBitmaps.get(overlay.token);
    if (bmp) out.push({ token: overlay.token, bmp, x: overlay.x, y: overlay.y });
  }
  return out;
}

/** Read a JSON list out of the value bag, dropping anything malformed. */
function parseList<T>(value: string | boolean | null | undefined, valid: (item: T) => boolean): T[] {
  if (typeof value !== 'string' || !value) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => item && typeof item === 'object' && valid(item as T)) as T[];
}

function isLayer(item: TextLayer): boolean {
  return typeof item.text === 'string' && Number.isFinite(item.x) && Number.isFinite(item.y);
}

function isOverlay(item: Overlay): boolean {
  if (typeof item.token !== 'string') return false;
  if (item.x !== undefined && !Number.isFinite(item.x)) return false;
  if (item.y !== undefined && !Number.isFinite(item.y)) return false;
  return true;
}

function isLegacyExtra(item: LegacyExtra): boolean {
  return typeof item.token === 'string';
}

function readLayers(values: FieldValues): TextLayer[] {
  return parseList<TextLayer>(values[TEXT_LAYERS_KEY], isLayer).map((layer) => ({
    id: layer.id,
    text: layer.text,
    x: clamp01(layer.x),
    y: clamp01(layer.y),
  }));
}

/**
 * The overlays, with any stored position normalised.
 *
 * A session that predates draggable overlays holds bare tokens under the old
 * key; reading it here means those pictures keep showing up instead of quietly
 * disappearing, and the first drag rewrites them in the new shape.
 */
function readOverlays(values: FieldValues): Overlay[] {
  const stored = parseList<Overlay>(values[OVERLAYS_KEY], isOverlay);
  if (stored.length) {
    return stored.map((overlay) => ({
      token: overlay.token,
      name: typeof overlay.name === 'string' ? overlay.name : '',
      x: overlay.x === undefined ? undefined : clamp01(overlay.x),
      y: overlay.y === undefined ? undefined : clamp01(overlay.y),
    }));
  }
  return parseList<LegacyExtra>(values[LEGACY_EXTRAS_KEY], isLegacyExtra).map((extra) => ({
    token: extra.token,
    name: typeof extra.name === 'string' ? extra.name : '',
  }));
}

function readGrow(values: FieldValues): Grow {
  const raw = str(values, GROW_KEY, 'both');
  return raw === 'top' || raw === 'bottom' ? raw : 'both';
}

/**
 * A stored caption position, or null when the visitor has never dragged it.
 *
 * null rather than a default is what lets the same value work in both modes:
 * an untouched caption is centred in whatever area it currently lives in, while
 * a dragged one keeps the place the visitor chose.
 */
interface Stored {
  top: Point | null;
  bottom: Point | null;
}

function readPositions(values: FieldValues): Stored {
  const raw = values[POSITIONS_KEY];
  if (typeof raw !== 'string' || !raw) return { top: null, bottom: null };
  let parsed: { top?: Point; bottom?: Point };
  try {
    parsed = JSON.parse(raw) as { top?: Point; bottom?: Point };
  } catch {
    return { top: null, bottom: null };
  }
  const pick = (value: Point | undefined): Point | null =>
    value && Number.isFinite(value.x) && Number.isFinite(value.y)
      ? { x: clamp01(Number(value.x)), y: clamp01(Number(value.y)) }
      : null;
  return { top: pick(parsed.top), bottom: pick(parsed.bottom) };
}

/** Record one caption's position, leaving the other exactly as it was. */
function writePosition(
  setValue: (name: string, value: string | boolean | null) => void,
  current: Stored,
  slot: 'top' | 'bottom',
  point: Point,
) {
  setValue(POSITIONS_KEY, JSON.stringify({ ...current, [slot]: point }));
}

/* --------------------------------------------------------------- history */

/**
 * The keys an undo step restores.
 *
 * Only things the visitor creates or moves by hand: the captions, the text
 * layers, the overlays and where they sit. Deliberately not the caption text or
 * the colour - those are typed into fields that already have their own undo,
 * and folding them in here would make one press of the button silently revert
 * a whole sentence.
 */
const HISTORY_KEYS = [POSITIONS_KEY, TEXT_LAYERS_KEY, OVERLAYS_KEY, LEGACY_EXTRAS_KEY];

/** A point in the edit history: the values of the keys above at that moment. */
type Snapshot = Record<string, string>;

/** How many steps back the visitor can go. */
const HISTORY_LIMIT = 50;

/**
 * The undo stack for one visit to the tool.
 *
 * Module level and keyed by nothing, because the work area is a singleton on
 * the page: there is only ever one meme being edited. It is cleared when the
 * tool remounts, which happens on a route change, so a second visit never
 * inherits the first one's history.
 */
const history: { past: Snapshot[]; future: Snapshot[] } = { past: [], future: [] };

function snapshotOf(values: FieldValues): Snapshot {
  const snap: Snapshot = {};
  for (const key of HISTORY_KEYS) {
    const value = values[key];
    snap[key] = typeof value === 'string' ? value : '';
  }
  return snap;
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return HISTORY_KEYS.every((key) => (a[key] ?? '') === (b[key] ?? ''));
}

/**
 * Push the current state onto the undo stack.
 *
 * Called once when a gesture *starts*, not on every frame of a drag: a drag is
 * one edit in the visitor's mind, so one press of undo should put the caption
 * back where it started rather than nudge it a pixel at a time.
 */
function pushHistory(values: FieldValues) {
  const snap = snapshotOf(values);
  const last = history.past[history.past.length - 1];
  if (last && sameSnapshot(last, snap)) return;
  history.past.push(snap);
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  /* A fresh edit makes the redo branch unreachable, which is what every editor
     does: you cannot redo your way into a future you have just written over. */
  history.future.length = 0;
}

function applySnapshot(
  setValue: (name: string, value: string | boolean | null) => void,
  snap: Snapshot,
) {
  for (const key of HISTORY_KEYS) setValue(key, snap[key] ?? '');
}

/* -------------------------------------------------------------- geometry */

/**
 * The shape of the finished meme: the picture plus whatever bands were added.
 *
 * Width is always the picture's own width, because growing only ever happens
 * vertically and a caption needs no room to the side.
 */
interface Frame {
  width: number;
  height: number;
  topBand: number;
  bottomBand: number;
}

/**
 * A rectangle inside the frame that a caption or a text layer is positioned
 * against, in canvas pixels.
 *
 * Every draggable thing is stored as a fraction of one of these rather than of
 * the whole canvas, which is what lets the same stored value keep a caption
 * inside its band no matter how tall that band turned out.
 */
interface Area {
  start: number;
  size: number;
}

/** The picture's own rectangle inside the frame. */
function pictureArea(frame: Frame): Area {
  return {
    start: frame.topBand,
    size: Math.max(1, frame.height - frame.topBand - frame.bottomBand),
  };
}

/** The rectangle a caption lives in: its band when it has one, else the picture. */
function captionArea(slot: 'top' | 'bottom', mode: string, frame: Frame): Area {
  if (mode === 'outside') {
    const band = slot === 'top' ? frame.topBand : frame.bottomBand;
    if (band > 0) {
      return { start: slot === 'top' ? 0 : frame.height - band, size: band };
    }
  }
  return pictureArea(frame);
}

/** A canvas fraction turned into a fraction of one area. Not clamped. */
function toArea(point: Point, area: Area, frame: Frame): Point {
  return {
    x: point.x,
    y: (point.y * frame.height - area.start) / Math.max(1, area.size),
  };
}

/** An area fraction turned into a canvas fraction. */
function fromArea(point: Point, area: Area, frame: Frame): Point {
  return {
    x: point.x,
    y: (area.start + area.size * point.y) / Math.max(1, frame.height),
  };
}

/* ------------------------------------------------------------- the build */

/**
 * Where a caption sits when it has never been dragged.
 *
 * The answer depends on the mode, because the two modes put the caption in
 * different places: centred in its band outside the picture, or on the classic
 * top and bottom bars inside it. Returning the centre of whichever area the
 * caption currently occupies means one stored value reads correctly in both.
 */
function homePoint(slot: 'top' | 'bottom', mode: string, frame: Frame): Point {
  const area = captionArea(slot, mode, frame);
  const inBand = mode === 'outside' && area.start !== pictureArea(frame).start;
  if (inBand) return { x: 0.5, y: 0.5 };
  return slot === 'top' ? DEFAULT_TOP : DEFAULT_BOTTOM;
}

/** The stored position, or where the caption would sit untouched. */
function captionPoint(
  slot: 'top' | 'bottom',
  stored: Stored,
  mode: string,
  frame: Frame,
): Point {
  const value = slot === 'top' ? stored.top : stored.bottom;
  return value ?? homePoint(slot, mode, frame);
}

/** Everything the builder needs, already resolved to fractions and bitmaps. */
interface MemeSpec {
  mode: 'inside' | 'outside';
  grow: Grow;
  top: string;
  bottom: string;
  topPos: Point | null;
  bottomPos: Point | null;
  layers: TextLayer[];
  overlays: ResolvedOverlay[];
  color: string;
}

/** Has this caption been dragged in the current mode? */
function isMoved(
  slot: 'top' | 'bottom',
  stored: Stored,
  mode: string,
  frame: Frame,
): boolean {
  const value = slot === 'top' ? stored.top : stored.bottom;
  if (!value) return false;
  const home = homePoint(slot, mode, frame);
  return Math.abs(value.x - home.x) > 0.001 || Math.abs(value.y - home.y) > 0.001;
}

/**
 * Height of one caption band, for an "outside" meme.
 *
 * Worked out from the caption itself rather than fixed, because a long caption
 * wraps to several lines and a band that was sized for one would clip it. The
 * preview and the export both come through here with their own dimensions, so
 * they always agree on the shape of the canvas - which is what makes the
 * recorded drag positions land in the same place on the saved file.
 *
 * `bands` is how many bands the canvas will grow by, one or two: the caption's
 * type is sized against the finished canvas, so growing by a single band leaves
 * the letters relatively larger and the band with it.
 */
function bandHeight(width: number, height: number, mode: string, text: string, bands: number): number {
  if (mode !== 'outside' || bands <= 0) return 0;
  /*
   * The band and the font size depend on each other: memeText() sizes its type
   * from the canvas it is given, and the canvas is the picture plus the bands.
   * A few passes settle the pair, which is cheaper and more honest than
   * guessing a fixed share of the picture and clipping the long captions.
   */
  /* The band is solved as a share of the picture's height rather than in
     pixels, so the preview and the export land on exactly the same proportion
     and a position dragged on one is the same place on the other. */
  let share = 0.2;
  for (let pass = 0; pass < 6; pass += 1) {
    const canvasHeight = height * (1 + share * bands);
    /*
     * Everything below is a ratio between parts of the same canvas, so the
     * preview and the export - which differ only in scale - solve to the same
     * share. Rounding to pixels here would let the two drift apart.
     */
    const shorter = Math.min(width, canvasHeight);
    const fontShare = (0.11 * shorter) / height;
    /* Uppercase Impact averages a little over half an em per character, so the
       divisor leans high and the estimate lands on the safe side. */
    const perLine = Math.max(4, Math.floor((width * 0.92) / (0.62 * 0.11 * shorter)));
    const lines = Math.max(1, Math.ceil(Math.max(1, text.trim().length) / perLine));
    const next = Math.min(1.2, Math.max(0.16, (lines * 1.1 + 1.2) * fontShare));
    if (Math.abs(next - share) < 0.004) {
      share = next;
      break;
    }
    share = next;
  }
  return Math.round(height * share);
}

/**
 * The canvas a meme is built on: the picture, plus a band per outside caption.
 *
 * Both captions are set at the same size, so both bands are given the taller of
 * the two solutions - a short caption simply gets more air around it.
 */
function memeCanvas(width: number, height: number, spec: MemeSpec): Frame {
  if (spec.mode !== 'outside') {
    return { width, height, topBand: 0, bottomBand: 0 };
  }
  const wantsTop = spec.grow !== 'bottom';
  const wantsBottom = spec.grow !== 'top';
  const bands = (wantsTop ? 1 : 0) + (wantsBottom ? 1 : 0);
  if (!bands) return { width, height, topBand: 0, bottomBand: 0 };

  const solved = Math.max(
    wantsTop ? bandHeight(width, height, spec.mode, spec.top, bands) : 0,
    wantsBottom ? bandHeight(width, height, spec.mode, spec.bottom, bands) : 0,
  );
  return {
    width,
    height: height + solved * bands,
    topBand: wantsTop ? solved : 0,
    bottomBand: wantsBottom ? solved : 0,
  };
}

/** A placed overlay: its centre and its drawn size, in canvas pixels. */
interface Placed {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/**
 * Where each overlay lands.
 *
 * The builder draws from this and the preview hit-tests against it, so a picture
 * is grabbed exactly where it is seen. An overlay without a stored position is
 * stacked up the right-hand edge of the picture, which is where ADD IMAGE has
 * always put them; the stack only advances for the ones that took that route,
 * so dragging one does not shuffle the rest.
 */
function placeOverlays(frame: Frame, overlays: ResolvedOverlay[]): Placed[] {
  const pad = Math.max(6, Math.round(frame.width * 0.02));
  const drawWidth = Math.max(24, frame.width * 0.24);
  let stacked = frame.height - frame.bottomBand - pad;
  const out: Placed[] = [];
  for (const overlay of overlays) {
    const bmp = overlay.bmp;
    const exWidth = (bmp as ImageBitmap).width || (bmp as HTMLImageElement).naturalWidth || 1;
    const exHeight = (bmp as ImageBitmap).height || (bmp as HTMLImageElement).naturalHeight || 1;
    const drawHeight = (exHeight / exWidth) * drawWidth;
    if (overlay.x !== undefined && overlay.y !== undefined) {
      out.push({
        cx: clamp01(overlay.x) * frame.width,
        cy: clamp01(overlay.y) * frame.height,
        w: drawWidth,
        h: drawHeight,
      });
    } else {
      out.push({
        cx: frame.width - drawWidth / 2 - pad,
        cy: stacked - drawHeight / 2,
        w: drawWidth,
        h: drawHeight,
      });
      stacked -= drawHeight + pad;
    }
  }
  return out;
}
/**
 * Draw the whole meme at the given size.
 *
 * Resolution independent by design: every length is derived from the canvas
 * size and every position is a fraction, so the same call produces the reduced
 * preview and the full-size export.
 */
function buildMeme(
  image: Bitmap,
  width: number,
  height: number,
  spec: MemeSpec,
): HTMLCanvasElement {
  const frame = memeCanvas(width, height, spec);
  const { canvas, ctx } = surface(frame.width, frame.height);
  const picture = pictureArea(frame);
  const stored: Stored = { top: spec.topPos, bottom: spec.bottomPos };

  /* Outside captions sit on a plain field, so the bands are painted before the
     picture is laid between them. */
  if (frame.topBand || frame.bottomBand) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image as CanvasImageSource, 0, frame.topBand, width, height);

  const inside: Array<{ x: number; y: number; text: string }> = [];
  const bandCaptions: Array<{ x: number; y: number; text: string }> = [];
  let topCaption = '';
  let bottomCaption = '';

  /*
   * Each caption is drawn in whichever area it belongs to: its own band when the
   * grow option gave it one, otherwise the picture. Anywhere in between it is a
   * positioned layer, so a drag survives into the export.
   */
  const place = (slot: 'top' | 'bottom', text: string) => {
    const area = captionArea(slot, spec.mode, frame);
    const inBand = area.start !== picture.start;
    const at = fromArea(captionPoint(slot, stored, spec.mode, frame), area, frame);
    if (inBand) {
      bandCaptions.push({ x: at.x, y: at.y, text });
      return;
    }
    if (!isMoved(slot, stored, spec.mode, frame)) {
      /*
       * Untouched, so the classic bars are used - the engine's own spacing is
       * what makes a meme look like a meme.
       */
      if (slot === 'top') topCaption = text;
      else bottomCaption = text;
      return;
    }
    inside.push({ x: at.x, y: at.y, text });
  };

  place('top', spec.top);
  place('bottom', spec.bottom);

  for (const layer of spec.layers) {
    const at = fromArea(layer, picture, frame);
    inside.push({ x: at.x, y: at.y, text: layer.text });
  }

  memeText(canvas, {
    top: topCaption,
    bottom: bottomCaption,
    /* Empty captions are skipped by the engine, which keeps this array honest
       without special cases here. */
    inside,
    color: spec.color,
  });

  if (bandCaptions.length) {
    /*
     * The caption keeps the colour the visitor picked, so it looks the same
     * whether it sits in a band or over the picture. Legibility on the white
     * band comes from the engine's own black outline, which is exactly what
     * separates a white caption from the white paper in a classic meme - no
     * colour substitution needed, and none wanted: a caption that changed
     * colour as it crossed into a band looked like a bug because it was one.
     */
    memeText(canvas, {
      top: '',
      bottom: '',
      inside: bandCaptions,
      color: spec.color,
    });
  }

  const placed = placeOverlays(frame, spec.overlays);
  spec.overlays.forEach((overlay, index) => {
    const box = placed[index];
    if (!box) return;
    ctx.drawImage(
      overlay.bmp as CanvasImageSource,
      box.cx - box.w / 2,
      box.cy - box.h / 2,
      box.w,
      box.h,
    );
  });

  return canvas;
}

/* ------------------------------------------------------------- the canvas */

/** The preview the work area builds, at a size that fits the column. */
const PREVIEW_BOX = { width: 760, height: 520 };

/** Longest edge a full-resolution build may reach, to protect the tab's memory. */
const EXPORT_CAP = 4000;

/**
 * Scale a decoded picture down for the preview.
 *
 * The captions are drawn at fractional positions, so the preview is a faithful
 * miniature: dragging on it lands in the same place on the export.
 */
function previewSize(width: number, height: number) {
  return fitInside(width, height, PREVIEW_BOX.width, PREVIEW_BOX.height);
}

/** Where the pointer landed, as fractions of the preview frame. */
function pointIn(event: { currentTarget: HTMLElement; clientX: number; clientY: number }): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp01((event.clientX - rect.left) / Math.max(1, rect.width)),
    y: clamp01((event.clientY - rect.top) / Math.max(1, rect.height)),
  };
}

/** What a pointer press grabbed, and where inside it. */
interface Grab {
  kind: 'top' | 'bottom' | 'layer' | 'overlay';
  /** Text layer id, for a grabbed layer. */
  id?: number;
  /** Overlay index, for a grabbed picture. */
  index?: number;
  /** Offset from the grabbed centre, in the space that thing is stored in. */
  dx: number;
  dy: number;
}

/** Does a canvas point land inside a placed overlay? */
function hitsBox(point: Point, frame: Frame, box: Placed): boolean {
  const x = point.x * frame.width;
  const y = point.y * frame.height;
  return Math.abs(x - box.cx) <= box.w / 2 && Math.abs(y - box.cy) <= box.h / 2;
}

/**
 * Which draggable thing sits under a canvas point, topmost first.
 *
 * Overlays are tested before text because they are drawn last: whatever the
 * visitor can see on top is what their click should land on. Captions are then
 * compared in their own area's fractions, so a press anywhere in a wide band
 * picks the caption up instead of missing it by a few pixels.
 */
function pick(
  point: Point,
  frame: Frame,
  mode: string,
  stored: Stored,
  layers: TextLayer[],
  overlays: ResolvedOverlay[],
): Grab | null {
  const placed = placeOverlays(frame, overlays);
  for (let i = placed.length - 1; i >= 0; i -= 1) {
    if (hitsBox(point, frame, placed[i])) {
      const centre = { x: placed[i].cx / frame.width, y: placed[i].cy / frame.height };
      return { kind: 'overlay', index: i, dx: point.x - centre.x, dy: point.y - centre.y };
    }
  }

  const picture = pictureArea(frame);
  const inPicture = toArea(point, picture, frame);
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const layer = layers[i];
    if (Math.abs(layer.x - inPicture.x) < 0.16 && Math.abs(layer.y - inPicture.y) < 0.08) {
      return {
        kind: 'layer',
        id: layer.id,
        dx: inPicture.x - layer.x,
        dy: inPicture.y - layer.y,
      };
    }
  }

  for (const slot of ['top', 'bottom'] as const) {
    const area = captionArea(slot, mode, frame);
    const at = toArea(point, area, frame);
    const pos = captionPoint(slot, stored, mode, frame);
    if (Math.abs(pos.x - at.x) < 0.3 && Math.abs(pos.y - at.y) < 0.11) {
      return { kind: slot, dx: at.x - pos.x, dy: at.y - pos.y };
    }
  }

  return null;
}
function MemeWorkarea({ files, values, setValue }: WorkareaProps) {
  const file = files[0];
  const mode = str(values, MODE_KEY, 'inside') === 'outside' ? 'outside' : 'inside';
  const grow = readGrow(values);
  const top = shown(values, 'memeTop');
  const bottom = shown(values, 'memeBottom');
  const color = str(values, 'memeColor', '#ffffff');
  const layers = readLayers(values);
  const overlays = readOverlays(values);
  const stored = readPositions(values);
  /*
   * The lists above are rebuilt on every render, so the redraw effect keys off
   * the raw strings instead: those only change when the visitor actually edits
   * something.
   */
  const positionsRaw = typeof values[POSITIONS_KEY] === 'string' ? values[POSITIONS_KEY] : '';
  const layersRaw = typeof values[TEXT_LAYERS_KEY] === 'string' ? values[TEXT_LAYERS_KEY] : '';
  const overlaysRaw =
    (typeof values[OVERLAYS_KEY] === 'string' ? values[OVERLAYS_KEY] : '') +
    (typeof values[LEGACY_EXTRAS_KEY] === 'string' ? values[LEGACY_EXTRAS_KEY] : '');

  const [source, setSource] = useState<{ bmp: Bitmap; width: number; height: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<Grab | null>(null);

  /*
   * The history is module level, so it has to be emptied when this tool is
   * entered afresh. A counter in state drives the buttons: the stacks are plain
   * arrays outside React, so nothing would re-render when they change without
   * one.
   */
  const [, bumpHistory] = useState(0);
  useEffect(() => {
    history.past.length = 0;
    history.future.length = 0;
    bumpHistory((n) => n + 1);
    return () => {
      history.past.length = 0;
      history.future.length = 0;
    };
  }, []);

  /* Decode once per file; the preview is rebuilt from the bitmap as the
     captions change rather than being re-decoded. */
  useEffect(() => {
    if (!file) {
      setSource(null);
      return;
    }
    let live = true;
    void (async () => {
      try {
        const decoded = file.bytes
          ? await decodeBytes(file.bytes, file.file.type || 'image/png')
          : await decodeBlob(file.file);
        if (live) setSource(decoded);
      } catch {
        if (live) setSource(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [file]);

  const fitted = source ? previewSize(source.width, source.height) : null;

  /*
   * The frame is needed by the render below as well as by the builder, so it is
   * worked out once here. It only depends on the picture's preview size and the
   * caption text, never on a drag position, which is why dragging cannot make
   * the canvas jump under the pointer.
   */
  const shownSize = fitted ?? { width: 1, height: 1 };
  const frame = memeCanvas(shownSize.width, shownSize.height, {
    mode,
    grow,
    top,
    bottom,
    topPos: stored.top,
    bottomPos: stored.bottom,
    layers: [],
    overlays: [],
    color,
  });

  /* Rebuild the preview whenever anything it shows changes. */
  useEffect(() => {
    const node = canvasRef.current;
    if (!node || !source || !fitted) return;
    const built = buildMeme(source.bmp, fitted.width, fitted.height, {
      mode,
      grow,
      top,
      bottom,
      topPos: stored.top,
      bottomPos: stored.bottom,
      layers,
      overlays: decodeOverlays(overlays),
      color,
    });
    node.width = built.width;
    node.height = built.height;
    node.getContext('2d')?.drawImage(built, 0, 0);
  }, [source, fitted, mode, grow, top, bottom, positionsRaw, layersRaw, overlaysRaw, color]);

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointIn(event);
    /*
     * Overlays answer first and captions last, so a picture lying over a band
     * still takes the press. This holds in both modes: a caption in a band has
     * its own area to be picked in, which is what makes it draggable outside
     * the picture as well as inside it.
     */
    const hit = pick(point, frame, mode, stored, layers, decodeOverlays(overlays));
    if (!hit) return;
    /* Recorded before the drag begins, so undo returns the whole gesture to
       where it started rather than to its penultimate pixel. */
    pushHistory(values);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Pointer capture is best-effort; dragging still works without it. */
    }
    drag.current = hit;
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active) return;
    const point = pointIn(event);

    if (active.kind === 'overlay') {
      const index = active.index ?? -1;
      if (index < 0 || index >= overlays.length) return;
      /* Overlays may go anywhere on the canvas, so the centre is clamped to
         the frame rather than to the picture. */
      const next = {
        x: clamp01(point.x - active.dx),
        y: clamp01(point.y - active.dy),
      };
      setValue(
        OVERLAYS_KEY,
        JSON.stringify(
          overlays.map((overlay, i) => (i === index ? { ...overlay, ...next } : overlay)),
        ),
      );
      return;
    }

    if (active.kind === 'top' || active.kind === 'bottom') {
      /*
       * The caption is stored inside its own area, so the pointer is converted
       * before clamping: a caption with a band stays in that band vertically
       * and slides freely across it.
       */
      const area = captionArea(active.kind, mode, frame);
      const at = toArea(point, area, frame);
      const next = { x: clamp01(at.x - active.dx), y: clamp01(at.y - active.dy) };
      writePosition(setValue, stored, active.kind, next);
      return;
    }

    const picture = pictureArea(frame);
    const at = toArea(point, picture, frame);
    const next = { x: clamp01(at.x - active.dx), y: clamp01(at.y - active.dy) };
    setValue(
      TEXT_LAYERS_KEY,
      JSON.stringify(
        layers.map((layer) =>
          layer.id === active.id ? { ...layer, x: next.x, y: next.y } : layer,
        ),
      ),
    );
  };

  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    /* The stacks are plain arrays, so React will not notice them change; this
       is what enables the undo button the moment a drag finishes. */
    bumpHistory((n) => n + 1);
  };

  if (!file) return null;

  const draggable = layers.length > 0 || overlays.length > 0 || mode === 'outside';
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  /** Step back one edit, parking the present on the redo stack. */
  const undo = () => {
    const previous = history.past.pop();
    if (!previous) return;
    history.future.push(snapshotOf(values));
    applySnapshot(setValue, previous);
    bumpHistory((n) => n + 1);
  };

  /** Step forward again, parking the present back on the undo stack. */
  const redo = () => {
    const next = history.future.pop();
    if (!next) return;
    history.past.push(snapshotOf(values));
    applySnapshot(setValue, next);
    bumpHistory((n) => n + 1);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full items-center justify-end gap-2">
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          title={canUndo ? 'Undo the last move' : 'Nothing to undo'}
          aria-label="Undo"
          className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-surface text-ink-2 shadow-btn transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:bg-canvas disabled:text-placeholder disabled:shadow-none"
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h9a7 7 0 0 1 0 14h-3" />
          </svg>
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          title={canRedo ? 'Redo the last undo' : 'Nothing to redo'}
          aria-label="Redo"
          className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-surface text-ink-2 shadow-btn transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:bg-canvas disabled:text-placeholder disabled:shadow-none"
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9h-9a7 7 0 0 0 0 14h3" />
          </svg>
        </button>
      </div>
      <div
        role="presentation"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="relative select-none overflow-hidden rounded-lg border border-line bg-surface shadow-card"
        style={{
          width: frame.width,
          height: frame.height,
          touchAction: 'none',
          cursor: draggable ? 'grab' : 'default',
        }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          aria-label={'Meme preview of ' + file.name}
        />
      </div>
      <p className="max-w-[520px] text-sm leading-[18px] text-muted">
        {mode === 'inside'
          ? 'Drag a caption, a text layer or an overlaid picture to move it.'
          : 'Drag a caption across its band, or move a text layer or an overlaid picture anywhere on the picture.'}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- the panel */

/**
 * Small square button with a leading icon, as the reference shows ADD IMAGE and
 * ADD TEXT.
 *
 * The reference pairs a tinted icon tile with a labelled bar; the two are drawn
 * as one control here so the pair reads as a single button.
 */
function AddButton({
  icon,
  label,
  onClick,
  title,
}: {
  icon: 'image' | 'text';
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="mb-2 flex w-full items-stretch overflow-hidden rounded-md border border-line bg-canvas text-left hover:border-muted"
    >
      <span className="flex w-11 shrink-0 items-center justify-center bg-img py-2.5 text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {icon === 'image' ? (
            <>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="8.5" cy="9.5" r="1.5" />
              <path d="m21 16-5-5L5 20" />
            </>
          ) : (
            <>
              <path d="M4 7V5h16v2" />
              <path d="M12 5v14" />
              <path d="M9 19h6" />
            </>
          )}
        </svg>
      </span>
      <span className="flex flex-1 items-center px-3 py-2.5 text-[13px] font-medium tracking-wide text-ink-2 uppercase">
        {label}
      </span>
    </button>
  );
}

/** Where a freshly added overlay is placed, in canvas fractions of its centre. */
const NEW_OVERLAY: Point = { x: 0.76, y: 0.76 };

function MemePanel({ values, setValue }: PanelProps) {
  const mode = str(values, MODE_KEY, 'inside');
  const grow = readGrow(values);
  const layers = readLayers(values);
  const overlays = readOverlays(values);
  const picker = useRef<HTMLInputElement | null>(null);

  const addLayer = () => {
    const id = Date.now();
    setValue(
      TEXT_LAYERS_KEY,
      JSON.stringify([...layers, { id, text: 'Write your text here', x: 0.5, y: 0.5 }]),
    );
  };

  const addImage = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    void keepExtra(file).then((token) => {
      /*
       * The starting point is recorded up front so the picture is draggable from
       * the moment it appears; the builder's own default is only a fallback for
       * sessions that predate this key.
       */
      setValue(
        OVERLAYS_KEY,
        JSON.stringify([...overlays, { token, name: file.name, ...NEW_OVERLAY }]),
      );
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <Info>
        Write a caption, drag it where it belongs, and generate. Both captions
        are drawn in the picture by default; "Text outside" grows the canvas to
        give them their own white bands.
      </Info>

      <TextArea
        id="meme-top"
        label="Write your text here"
        rows={3}
        placeholder="Top caption"
        value={shown(values, 'memeTop')}
        onChange={(value) => setValue('memeTop', value)}
      />

      <TextArea
        id="meme-bottom"
        label="Write your text here"
        rows={3}
        placeholder="Bottom caption"
        value={shown(values, 'memeBottom')}
        onChange={(value) => setValue('memeBottom', value)}
      />

      <Label>Text inside / Text outside</Label>
      <RadioCards
        name={MODE_KEY}
        value={mode}
        onChange={(value) => setValue(MODE_KEY, value)}
        options={[
          {
            value: 'inside',
            title: 'Text inside',
            body: 'Captions sit over the picture, the classic way',
          },
          {
            value: 'outside',
            title: 'Text outside',
            body: 'The canvas grows to hold the captions',
          },
        ]}
      />

      {mode === 'outside' ? (
        <>
          <Label>Grow the canvas</Label>
          <RadioCards
            name={GROW_KEY}
            value={grow}
            onChange={(value) => setValue(GROW_KEY, value)}
            options={[
              {
                value: 'both',
                title: 'Both sides',
                body: 'A band above and another below',
              },
              {
                value: 'top',
                title: 'Top only',
                body: 'One band above; the bottom caption stays on the picture',
              },
              {
                value: 'bottom',
                title: 'Bottom only',
                body: 'One band below; the top caption stays on the picture',
              },
            ]}
          />
        </>
      ) : null}

      <AddButton
        icon="image"
        label="Add image"
        title="Overlay a second picture, then drag it anywhere"
        onClick={() => picker.current?.click()}
      />
      <input
        ref={picker}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Choose an overlay picture"
        onChange={(event) => addImage(event.currentTarget)}
      />

      <AddButton
        icon="text"
        label="Add text"
        title="Drop another caption anywhere on the picture"
        onClick={addLayer}
      />

      <ColorField
        label="Text colour"
        value={str(values, 'memeColor', '#ffffff')}
        onChange={(value) => setValue('memeColor', value)}
      />

      {layers.length > 0 || overlays.length > 0 ? (
        <>
          <Note>
            {overlays.length
              ? overlays.length + ' picture' + (overlays.length === 1 ? '' : 's') + ' overlaid. '
              : ''}
            {layers.length
              ? layers.length + ' extra text layer' + (layers.length === 1 ? '' : 's') + '.'
              : ''}
          </Note>
          <div className="mb-3 flex gap-2">
            <ActionButton
              onClick={() => {
                setValue(TEXT_LAYERS_KEY, '');
                setValue(OVERLAYS_KEY, '');
                setValue(LEGACY_EXTRAS_KEY, '');
              }}
            >
              Clear additions
            </ActionButton>
          </div>
        </>
      ) : (
        <Note>ADD IMAGE and ADD TEXT stack extra elements on top of the caption pair.</Note>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- the tool */

export const memeTool: ToolImpl = {
  Panel: MemePanel,
  Workarea: MemeWorkarea,

  async run({ files, values, setProgress, setStatus }) {
    const mode = str(values, MODE_KEY, 'inside') === 'outside' ? 'outside' : 'inside';
    const grow = readGrow(values);
    const top = shown(values, 'memeTop');
    const bottom = shown(values, 'memeBottom');
    const color = str(values, 'memeColor', '#ffffff');
    const layers = readLayers(values);
    const overlays = readOverlays(values);
    const stored = readPositions(values);
    const out: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus('Generating the meme from ' + file.name + '...');

      const decoded = file.bytes
        ? await decodeBytes(file.bytes, file.file.type || 'image/png')
        : await decodeBlob(file.file);

      /*
       * The picture keeps its own proportions; only the long edge is capped, so
       * a poster-sized photo cannot exhaust the tab. The preview is scaled the
       * same way, which is why every ratio in the builder is expressed against
       * the canvas rather than in absolute pixels.
       */
      const shrink = Math.min(1, EXPORT_CAP / Math.max(decoded.width, decoded.height));
      const width = Math.max(1, Math.round(decoded.width * shrink));
      const height = Math.max(1, Math.round(decoded.height * shrink));

      const canvas = buildMeme(decoded.bmp, width, height, {
        mode,
        grow,
        top,
        bottom,
        topPos: stored.top,
        bottomPos: stored.bottom,
        layers,
        overlays: decodeOverlays(overlays),
        color,
      });

      const blob = await encode(canvas, 'png');
      out.push({ name: withSuffix(file.name, '_meme', 'png'), blob, size: blob.size });
      setProgress(((i + 1) / files.length) * 100);
    }

    return out;
  },
};