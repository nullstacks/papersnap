/**
 * HTML -> PDF layout.
 *
 * The browser is the layout engine: the sanitized HTML is mounted in a hidden
 * container at the exact content width, rasterised with html2canvas, then the
 * bitmap is sliced into page-height strips and placed into a PDF. That keeps
 * complex CSS (tables, flexbox, lists) faithful without shipping an HTML/CSS
 * layout engine of our own.
 *
 * html2canvas is imported on demand so it stays out of the initial bundle.
 */
import { PDFDocument, pageSize } from './pdf';
import { sanitize } from './sanitize';

/* Rasterise at 2x so text stays crisp once placed on the page. */
const SCALE = 2;

const BASE_CSS = [
  '*{box-sizing:border-box}',
  'body{margin:0;background:#fff;color:#111}',
  'img{max-width:100%;height:auto}',
  'table{border-collapse:collapse;width:100%;font-size:13px}',
  'th,td{border:1px solid #cfcfd6;padding:6px 8px;text-align:left;vertical-align:top}',
  'th{background:#f0f0f5;font-weight:600}',
  'h1{font-size:26px;margin:0 0 12px;line-height:1.25}',
  'h2{font-size:21px;margin:18px 0 10px;line-height:1.3}',
  'h3{font-size:17px;margin:16px 0 8px}',
  'h4,h5,h6{font-size:15px;margin:14px 0 8px}',
  'p{margin:0 0 10px}',
  'ul,ol{margin:0 0 10px;padding-left:24px}',
  'li{margin:0 0 4px}',
  'pre{background:#f5f5fa;padding:10px;border-radius:4px;overflow:auto;font-size:12px;white-space:pre-wrap}',
  'code{font-family:Consolas,monospace;font-size:12px}',
  'blockquote{margin:0 0 10px;padding-left:14px;border-left:3px solid #d6d6df;color:#555}',
  'a{color:#1a4fa0}',
  'hr{border:0;border-top:1px solid #d6d6df;margin:14px 0}',
].join('\n');

export interface HtmlToPdfOptions {
  html: string;
  /** A key of PAGE_SIZE_OPTIONS; anything unknown falls back to A4. */
  pageSize?: string;
  /** Margin in points. */
  margin?: number;
}

export async function htmlToPdfBlob({
  html,
  pageSize: sizeName = 'A4',
  margin = 48,
}: HtmlToPdfOptions): Promise<Blob> {
  const s = pageSize(sizeName);
  const widthPt = s.width;
  const heightPt = s.height;
  const contentPt = widthPt - margin * 2;
  const contentPtH = heightPt - margin * 2;
  const widthPx = Math.round(contentPt * SCALE);

  const host = document.createElement('div');
  host.style.cssText = [
    'position:fixed',
    'left:-20000px',
    'top:0',
    'width:' + widthPx + 'px',
    'background:#fff',
    'padding:0',
    'margin:0',
    'z-index:-1',
  ].join(';');

  const style = document.createElement('style');
  style.textContent = BASE_CSS;

  const body = document.createElement('div');
  body.style.cssText = [
    'width:' + widthPx + 'px',
    'font-family:Helvetica,Arial,sans-serif',
    /* ≈15.5pt in CSS px at 2x. */
    'font-size:31px',
    'line-height:1.55',
    'color:#111',
    'background:#fff',
  ].join(';');
  body.innerHTML = sanitize(html);

  host.appendChild(style);
  host.appendChild(body);
  document.body.appendChild(host);

  try {
    await waitForImages(body);
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 40)));

    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(body, {
      scale: 1,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      width: widthPx,
      windowWidth: widthPx,
    });

    return await slicesToPdf({ canvas, widthPt, heightPt, contentPt, contentPtH, margin });
  } finally {
    host.remove();
  }
}

interface SliceOptions {
  canvas: HTMLCanvasElement;
  widthPt: number;
  heightPt: number;
  contentPt: number;
  contentPtH: number;
  margin: number;
}

async function slicesToPdf({
  canvas,
  widthPt,
  heightPt,
  contentPt,
  contentPtH,
  margin,
}: SliceOptions): Promise<Blob> {
  const doc = await PDFDocument.create();

  /* How many source pixels make up one printed page worth of content. */
  const pxPerPt = canvas.width / contentPt;
  const sliceHeight = Math.max(1, Math.floor(contentPtH * pxPerPt));
  const pages = Math.max(1, Math.ceil(canvas.height / sliceHeight));

  for (let i = 0; i < pages; i++) {
    const y0 = i * sliceHeight;
    const h = Math.min(sliceHeight, canvas.height - y0);
    if (h <= 0) break;

    const strip = document.createElement('canvas');
    strip.width = canvas.width;
    strip.height = h;
    const ctx = strip.getContext('2d');
    if (!ctx) throw new Error('Your browser could not render this HTML.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, strip.width, strip.height);
    ctx.drawImage(canvas, 0, y0, canvas.width, h, 0, 0, canvas.width, h);

    const dataUrl = strip.toDataURL('image/jpeg', 0.92);
    const img = await doc.embedJpg(dataUrlToBytes(dataUrl));

    const drawnH = h / pxPerPt;
    const page = doc.addPage([widthPt, heightPt]);
    page.drawImage(img, {
      x: margin,
      y: heightPt - margin - drawnH,
      width: contentPt,
      height: drawnH,
    });
  }

  const bytes = await doc.save();
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const raw = atob(dataUrl.split(',')[1]);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  if (!images.length) return Promise.resolve();
  return Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((r) => {
            img.onload = () => r();
            img.onerror = () => r();
          }),
    ),
  ).then(() => undefined);
}

