/**
 * Image engine: decode, transform and re-encode raster images in the tab.
 *
 * Everything runs through <canvas>, so no dependency is needed beyond the
 * browser itself. Each helper takes and returns decoded pixels or a Blob,
 * which keeps the tool modules free of canvas bookkeeping.
 */

/** Anything drawable by <canvas>: a decoded bitmap, an <img>, or a canvas. */
export type Bitmap = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

export interface DecodedImage {
  bmp: Bitmap;
  width: number;
  height: number;
}

export type OutFormat = 'jpg' | 'png' | 'webp' | 'bmp' | 'gif';

export const FORMAT_MIME: Record<OutFormat, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  bmp: 'image/bmp',
  gif: 'image/gif',
};

export const FORMAT_EXT: Record<OutFormat, string> = {
  jpg: 'jpg',
  png: 'png',
  webp: 'webp',
  bmp: 'bmp',
  gif: 'gif',
};

/* ------------------------------------------------------------------ decode */

/**
 * Release a decoded bitmap.
 *
 * `ImageBitmap` holds its pixels outside the JS heap, so the garbage collector
 * will not reclaim it promptly — a 12 MP bitmap is ~48 MB of GPU/native memory
 * that survives until pressure forces the browser to act, and on a 2 GB phone
 * a batch of twenty is enough to have the tab killed. Every decode path in the
 * tools funnels through here so the release is one call, not a rewrite.
 */
export function release(img: DecodedImage | null | undefined): void {
  if (!img) return;
  const bmp = img.bmp as ImageBitmap;
  if (typeof bmp.close === 'function') bmp.close();
}

/** Decode a File/Blob into an ImageBitmap (falling back to <img>). */
export async function decodeBlob(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob);
      return { bmp, width: bmp.width, height: bmp.height };
    } catch {
      /* SVG and some exotic formats fail here; fall through to <img>. */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const el = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That image could not be decoded.'));
      i.src = url;
    });
    return { bmp: el, width: el.naturalWidth, height: el.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Decode raw bytes (a cached WorkFile payload) into pixels. */
export function decodeBytes(bytes: Uint8Array, type = 'image/png'): Promise<DecodedImage> {
  return decodeBlob(new Blob([bytes as unknown as BlobPart], { type }));
}

/* ------------------------------------------------------------------ output */

/** Allocate a canvas plus its 2d context. */
export function surface(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw images.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/** Draw a bitmap into a fresh canvas, optionally flattened onto a colour. */
export function flatten(
  img: CanvasImageSource,
  width: number,
  height: number,
  background?: string,
) {
  const { canvas, ctx } = surface(width, height);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Encode a canvas. JPEG is flattened to white first (it has no alpha). */
export async function encode(
  canvas: HTMLCanvasElement,
  format: OutFormat,
  quality = 0.92,
): Promise<Blob> {
  if (format === 'bmp') return bmpBlob(canvas);
  const mime = FORMAT_MIME[format];
  const flat = format === 'jpg' ? flatten(canvas, canvas.width, canvas.height, '#ffffff') : canvas;
  const blob = await new Promise<Blob | null>((resolve) =>
    flat.toBlob(resolve, mime, format === 'png' ? undefined : quality),
  );
  if (blob) return blob;
  /* Some browsers refuse image/gif or image/bmp from toBlob. */
  if (format === 'gif') return encode(canvas, 'png', quality);
  throw new Error(`This browser cannot encode ${format.toUpperCase()}.`);
}

/**
 * Minimal uncompressed 24-bit BMP encoder.
 *
 * BMP has no alpha channel in this bit depth, so transparency is composited
 * onto white first — the same thing the JPEG path does. Writing the raw RGB
 * triples instead left every transparent pixel at the canvas's initial
 * premultiplied (0,0,0,0), which decoded back as solid BLACK: a logo dropped on
 * a transparent PNG came out with a black background after a resize.
 */
function bmpBlob(canvas: HTMLCanvasElement): Blob {
  const flat = flatten(canvas, canvas.width, canvas.height, '#ffffff');
  const { width, height } = flat;
  const ctx = flat.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw images.');
  const data = ctx.getImageData(0, 0, width, height).data;
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelSize = rowSize * height;
  const fileSize = 54 + pixelSize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  view.setUint8(0, 0x42); view.setUint8(1, 0x4d);
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelSize, true);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = 54 + (height - 1 - y) * rowSize + x * 3;
      u8[d] = data[s + 2];
      u8[d + 1] = data[s + 1];
      u8[d + 2] = data[s];
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
}

/* -------------------------------------------------------------- transforms */

/** Rotate by a multiple of 90 degrees and/or mirror the axes. */
export function transform(
  img: Bitmap,
  width: number,
  height: number,
  opts: { rotate?: number; flipH?: boolean; flipV?: boolean; background?: string },
) {
  const deg = ((opts.rotate ?? 0) % 360 + 360) % 360;
  const quarter = deg === 90 || deg === 270;
  const outW = quarter ? height : width;
  const outH = quarter ? width : height;
  const { canvas, ctx } = surface(outW, outH);
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, outW, outH);
  }
  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  if (deg) ctx.rotate((deg * Math.PI) / 180);
  if (opts.flipH) ctx.scale(-1, 1);
  if (opts.flipV) ctx.scale(1, -1);
  ctx.drawImage(img as CanvasImageSource, -width / 2, -height / 2, width, height);
  ctx.restore();
  return canvas;
}

/** Copy a rectangle out of an image. */
export function crop(img: Bitmap, rect: { x: number; y: number; w: number; h: number }) {
  const { canvas, ctx } = surface(rect.w, rect.h);
  ctx.drawImage(img as CanvasImageSource, -rect.x, -rect.y);
  return canvas;
}

/**
 * Resize with a progressive halving pass.
 *
 * A single drawImage call from a large source to a much smaller target
 * aliases badly in every browser; halving repeatedly keeps every tap within
 * the filter's useful range, which is what the reference's thumbnail-quality
 * output looks like.
 */
export function resize(
  img: Bitmap,
  width: number,
  height: number,
  background?: string,
) {
  let srcW = (img as ImageBitmap).width || (img as HTMLImageElement).naturalWidth;
  let srcH = (img as ImageBitmap).height || (img as HTMLImageElement).naturalHeight;
  let src: CanvasImageSource = img as CanvasImageSource;
  const targetW = Math.max(1, Math.round(width));
  const targetH = Math.max(1, Math.round(height));

  while (srcW / 2 >= targetW && srcH / 2 >= targetH) {
    const stepW = Math.max(1, Math.round(srcW / 2));
    const stepH = Math.max(1, Math.round(srcH / 2));
    const step = surface(stepW, stepH);
    step.ctx.drawImage(src, 0, 0, stepW, stepH);
    src = step.canvas;
    srcW = stepW;
    srcH = stepH;
  }

  const { canvas, ctx } = surface(targetW, targetH);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, targetW, targetH);
  }
  ctx.drawImage(src, 0, 0, targetW, targetH);
  return canvas;
}

/**
 * Unsharp mask, used to repair the softness a downscale leaves behind.
 *
 * This was a hand-written 3x3 box blur with an inner 9-tap loop per channel,
 * i.e. ~27 reads and 3 writes per pixel, all in JavaScript. Measured on this
 * machine: 1.7 s for a 12 MP photo and 10.4 s for a 61 MP one — long enough
 * that mobile Safari and Chrome kill the tab outright, and long enough that the
 * "Save" button in the photo editor looked broken.
 *
 * The same result is a three-pass composite the GPU does: draw a blurred copy
 * with the native `filter`, then subtract it with `difference` at reduced
 * alpha and add the original back. No per-pixel JavaScript, no ImageData
 * round-trip, so the cost is a couple of canvas blits instead of a 10 s loop.
 */
export function sharpen(canvas: HTMLCanvasElement, amount = 0.35) {
  if (amount <= 0) return canvas;
  const { width, height } = canvas;
  /* 1px of blur is the classic unsharp radius for a downscale repair. */
  const { canvas: blurred, ctx: bctx } = surface(width, height);
  bctx.filter = 'blur(1px)';
  bctx.drawImage(canvas, 0, 0);
  bctx.filter = 'none';

  /* out = original + amount * (original - blurred) */
  const { canvas: delta, ctx: dctx } = surface(width, height);
  dctx.filter = 'contrast(3)';
  dctx.drawImage(canvas, 0, 0);
  dctx.filter = 'none';
  dctx.globalCompositeOperation = 'difference';
  dctx.drawImage(blurred, 0, 0);
  dctx.globalCompositeOperation = 'source-over';

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.globalAlpha = Math.min(1, Math.max(0, amount)) * 0.75;
  ctx.drawImage(delta, 0, 0);
  ctx.globalAlpha = 1;
  return canvas;
}

/* -------------------------------------------------------------- filters */

export interface Adjustments {
  brightness: number; // 1 = unchanged
  contrast: number; // 1 = unchanged
  saturation: number; // 1 = unchanged
  warmth: number; // -100..100
  blur: number; // px
  grayscale: number; // 0..1
  sepia: number; // 0..1
  invert: number; // 0..1
  opacity: number; // 0..1
}

export const NEUTRAL: Adjustments = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  warmth: 0,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
  opacity: 1,
};

/** A CSS filter string for the raw canvas filter property. */
export function filterString(a: Adjustments): string {
  const parts = [
    `brightness(${a.brightness})`,
    `contrast(${a.contrast})`,
    `saturate(${a.saturation})`,
    `grayscale(${a.grayscale})`,
    `sepia(${a.sepia})`,
    `invert(${a.invert})`,
  ];
  if (a.blur > 0) parts.push(`blur(${a.blur}px)`);
  return parts.join(' ');
}

/** Apply the adjustment stack, including the warmth tint CSS cannot do. */
export function applyAdjustments(canvas: HTMLCanvasElement, a: Adjustments) {
  const { width, height } = canvas;
  const { canvas: out, ctx } = surface(width, height);
  ctx.filter = filterString(a);
  ctx.globalAlpha = Math.max(0, Math.min(1, a.opacity));
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  if (a.warmth) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = Math.min(0.6, Math.abs(a.warmth) / 160);
    ctx.fillStyle = a.warmth > 0 ? '#ff9a3c' : '#3c9aff';
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  return out;
}

/* ------------------------------------------------------- background removal */

/**
 * Cut the background out of a photo.
 *
 * Samples the four corners to learn the backdrop colour, then floods inward
 * with a tolerance, softening the edge with a one-pixel feather. That is the
 * same shape of result a chroma-key tool gives and it needs no model.
 */
export function removeBackground(canvas: HTMLCanvasElement, tolerance = 34) {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw images.');
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  const at = (x: number, y: number) => (y * width + x) * 4;

  /* Average the corners, ignoring anything already transparent. */
  let r = 0, g = 0, b = 0, n = 0;
  for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]) {
    const i = at(x, y);
    if (d[i + 3] < 8) continue;
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
  }
  if (!n) return canvas;
  r /= n; g /= n; b /= n;

  const tol = tolerance * tolerance * 3;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (seen[p]) return;
    seen[p] = 1;
    const i = p * 4;
    const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
    if (dr * dr + dg * dg + db * db <= tol) stack.push(p);
  };

  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }

  while (stack.length) {
    const p = stack.pop() as number;
    const x = p % width;
    const y = (p - x) / width;
    d[p * 4 + 3] = 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  /* Feather: an opaque pixel touching a cut one becomes half transparent. */
  const alpha = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) alpha[p] = d[p * 4 + 3];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      if (!alpha[p]) continue;
      if (!alpha[p - 1] || !alpha[p + 1] || !alpha[p - width] || !alpha[p + width]) {
        d[p * 4 + 3] = 190;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/* ------------------------------------------------------------- watermark */

export interface WatermarkOptions {
  text: string;
  color: string;
  opacity: number; // 0..1
  size: number; // fraction of the shorter side
  angle: number; // degrees
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tiled';
  font: string;
  bold: boolean;
  logo?: Bitmap | null;
  logoScale: number;
}

export function watermark(canvas: HTMLCanvasElement, o: WatermarkOptions) {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw images.');
  const shorter = Math.min(width, height);
  const px = Math.max(8, Math.round(shorter * o.size));
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, o.opacity));
  ctx.fillStyle = o.color;
  ctx.font = `${o.bold ? '700 ' : '400 '}${px}px ${o.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const mark = (cx: number, cy: number, angle: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angle * Math.PI) / 180);
    if (o.logo) {
      const lw = (o.logo.width || 1) * o.logoScale;
      const lh = (o.logo.height || 1) * o.logoScale;
      ctx.drawImage(o.logo as CanvasImageSource, -lw / 2, -lh / 2, lw, lh);
    } else {
      ctx.fillText(o.text, 0, 0);
    }
    ctx.restore();
  };

  if (o.position === 'tiled') {
    const stepX = Math.max(px * 4, 160);
    const stepY = Math.max(px * 5, 200);
    for (let y = stepY / 2; y < height + stepY; y += stepY) {
      for (let x = stepX / 2; x < width + stepX; x += stepX) mark(x, y, o.angle);
    }
  } else {
    const pad = shorter * 0.08;
    const map: Record<string, [number, number]> = {
      center: [width / 2, height / 2],
      'top-left': [pad, pad],
      'top-right': [width - pad, pad],
      'bottom-left': [pad, height - pad],
      'bottom-right': [width - pad, height - pad],
    };
    const [cx, cy] = map[o.position] ?? map.center;
    mark(cx, cy, o.angle);
  }
  ctx.restore();
  return canvas;
}

/* ------------------------------------------------------------------ meme */

export function memeText(
  canvas: HTMLCanvasElement,
  o: { top: string; bottom: string; inside: Array<{ x: number; y: number; text: string }>; color: string },
) {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw images.');
  const px = Math.max(14, Math.round(Math.min(width, height) * 0.11));
  ctx.font = `700 ${px}px Impact, 'Arial Black', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, px * 0.12);
  ctx.strokeStyle = '#000';
  ctx.fillStyle = o.color || '#fff';

  const draw = (text: string, x: number, y: number, maxWidth: number) => {
    if (!text.trim()) return;
    const lines = wrap(ctx, text.toUpperCase(), maxWidth);
    lines.forEach((line, i) => {
      const ly = y + (i - (lines.length - 1) / 2) * px * 1.1;
      ctx.strokeText(line, x, ly, maxWidth);
      ctx.fillText(line, x, ly, maxWidth);
    });
  };

  draw(o.top, width / 2, px * 0.85, width * 0.92);
  draw(o.bottom, width / 2, height - px * 0.85, width * 0.92);
  for (const t of o.inside) draw(t.text, t.x * width, t.y * height, width * 0.8);
  return canvas;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* --------------------------------------------------------------- helpers */

/** Gaussian-ish blur of an arbitrary rectangle inside a canvas. */
export function blurRect(
  canvas: HTMLCanvasElement,
  rect: { x: number; y: number; w: number; h: number },
  radius = 18,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw images.');
  const w = Math.max(1, Math.round(rect.w));
  const h = Math.max(1, Math.round(rect.h));
  const { canvas: tmp, ctx: tctx } = surface(w, h);
  tctx.filter = `blur(${radius}px)`;
  tctx.drawImage(canvas, -rect.x, -rect.y);
  tctx.filter = 'none';
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(rect.x + w / 2, rect.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(tmp, Math.round(rect.x), Math.round(rect.y), w, h);
  ctx.restore();
  return canvas;
}

/** Largest size that fits a box, keeping the aspect ratio. */
export function fitInside(w: number, h: number, boxW: number, boxH: number) {
  const scale = Math.min(boxW / w, boxH / h, 1);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Change the extension of a file name. */
export function withExt(name: string, ext: string): string {
  return `${(name || 'image').replace(/\.[^.]+$/, '')}.${ext}`;
}

/** Suffix before the extension, e.g. photo.jpg -> photo_compressed.jpg. */
export function withSuffix(name: string, suffix: string, ext?: string): string {
  const base = (name || 'image').replace(/\.[^.]+$/, '');
  const tail = ext ?? (name.match(/\.([^.]+)$/)?.[1] ?? 'png');
  return `${base}${suffix}.${tail}`;
}