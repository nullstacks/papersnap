/**
 * Image conversion tools: Convert to JPG, Convert from JPG and HTML to image.
 *
 * Each of the first two is a thin wrapper around the canvas engine in
 * lib/image: decode the bytes the browser already holds, draw them on a fresh
 * surface, hand back a new Blob. Nothing is uploaded, so a batch costs nothing
 * but time. The third has no input files at all: the markup in its form is the
 * input, and html2canvas is the layout engine that turns it into pixels.
 */
import html2canvas from 'html2canvas';
import { decodeBlob, encode, flatten, withSuffix, FORMAT_EXT } from '@/lib/image';
import {
  ActionButton,
  ActionRow,
  CheckboxField,
  Info,
  Label,
  Note,
  RadioCards,
  SelectField,
  TextArea,
  TextField,
} from '@/components/controls';
import type { FieldValues, PanelProps, ResultFile, ToolImpl } from '@/types';

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

/** Wrap an encoded Blob as a ResultFile. */
function imageResult(blob: Blob, name: string): ResultFile {
  return { name, blob, size: blob.size };
}

/* ============================================================ CONVERT TO JPG */

/**
 * Three qualities, the same three states the PDF side offers, so a visitor who
 * has used Compress IMAGE recognises the shape of the choice.
 */
const JPG_QUALITY: Record<string, number> = { high: 0.92, medium: 0.82, low: 0.7 };

function ToJpgPanel({ values, setValue }: PanelProps) {
  return (
    <div className="flex flex-col gap-1">
      <Info>
        Convert PNG, GIF, SVG or WEBP images to JPG. Convert all your images at once.
      </Info>

      <Label>JPG quality</Label>
      <RadioCards
        name="quality"
        value={str(values, 'quality', 'high')}
        onChange={(v) => setValue('quality', v)}
        options={[
          { value: 'high', title: 'High', body: 'Sharpest result, largest JPG' },
          { value: 'medium', title: 'Medium', body: 'A good balance for photographs' },
          { value: 'low', title: 'Low', body: 'Smallest JPG, visible artefacts' },
        ]}
      />

      <CheckboxField
        label="Flatten transparency onto white"
        checked={flag(values, 'flatten', true)}
        onChange={(v) => setValue('flatten', v)}
      />
    </div>
  );
}

export const toJpgTool: ToolImpl = {
  Panel: ToJpgPanel,

  async run({ files, values, setProgress, setStatus }) {
    const quality = JPG_QUALITY[str(values, 'quality', 'high')] ?? 0.92;
    const flattenWhite = flag(values, 'flatten', true);
    const out: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Converting ${file.name} to JPG...`);
      const { bmp, width, height } = await decodeBlob(file.file);

      /*
       * JPEG has no alpha channel, so every transparent pixel has to land on
       * some colour. Unticking the box leaves the surface clear and lets
       * encode() composite onto white at the end; ticking it paints the white
       * first, which is the same result but keeps the intent visible here.
       */
      const canvas = flatten(bmp, width, height, flattenWhite ? '#ffffff' : undefined);
      const blob = await encode(canvas, 'jpg', quality);

      out.push(imageResult(blob, withSuffix(file.name, '_converted', 'jpg')));
      setProgress(((i + 1) / files.length) * 100);
    }
    return out;
  },
};

/* ========================================================== CONVERT FROM JPG */

function FromJpgPanel({ values, setValue }: PanelProps) {
  const format = str(values, 'format', 'png');
  const gifMode = str(values, 'gifMode', 'static');

  return (
    <div className="flex flex-col gap-1">
      <RadioCards
        name="format"
        value={format}
        onChange={(v) => setValue('format', v)}
        options={[
          { value: 'png', title: 'CONVERT TO PNG', body: 'All images will be converted to PNG format' },
          { value: 'gif', title: 'CONVERT TO GIF', body: 'All images will be converted to GIF format' },
        ]}
      />

      {/*
       * The reference reveals the GIF choices inside the same column once GIF
       * is picked, rather than opening a dialog, so the panel keeps its width.
       */}
      {format === 'gif' && (
        <>
          <Label>Convert to GIF</Label>
          <RadioCards
            name="gifMode"
            value={gifMode}
            onChange={(v) => setValue('gifMode', v)}
            options={[
              { value: 'static', title: 'Static GIF', body: 'One frame per image' },
              { value: 'animated', title: 'Animated GIF', body: 'Needs two or more images' },
            ]}
          />

          <Info>All your selected JPG images will be converted to GIF format.</Info>

          {gifMode === 'animated' && (
            <Note>
              This build writes one frame per image. A real animated GIF needs a
              multi-frame encoder, which the browser does not provide, so the
              frames are saved as separate images.
            </Note>
          )}
        </>
      )}
    </div>
  );
}

export const fromJpgTool: ToolImpl = {
  Panel: FromJpgPanel,

  async run({ files, values, setProgress, setStatus }) {
    const wantGif = str(values, 'format', 'png') === 'gif';
    const out: ResultFile[] = [];
    let fellBack = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Converting ${file.name} to ${wantGif ? 'GIF' : 'PNG'}...`);
      const { bmp, width, height } = await decodeBlob(file.file);
      const canvas = flatten(bmp, width, height);
      const blob = await encode(canvas, wantGif ? 'gif' : 'png', 0.92);

      /*
       * encode() quietly returns PNG bytes when the browser refuses image/gif,
       * so the blob's own MIME type is the only honest source for the
       * extension. Handing back PNG bytes under a .gif name would give the
       * visitor a file that no viewer opens.
       */
      const reallyGif = wantGif && blob.type === 'image/gif';
      if (wantGif && !reallyGif) fellBack++;
      const ext = FORMAT_EXT[reallyGif ? 'gif' : 'png'];

      out.push(imageResult(blob, withSuffix(file.name, '_converted', ext)));
      setProgress(((i + 1) / files.length) * 100);
    }

    if (fellBack > 0) {
      setStatus(
        `This browser cannot encode GIF, so ${fellBack} image${fellBack === 1 ? '' : 's'} came back as PNG.`,
      );
    }
    return out;
  },
};

/* ========================================================== HTML TO IMAGE */

/** A small document so the form opens with something that already converts. */
const SAMPLE_HTML = [
  '<div style="padding:48px;font-family:Helvetica,Arial,sans-serif;color:#161616">',
  '  <h1 style="margin:0 0 8px;font-size:40px;line-height:1.15">Paper Snap</h1>',
  '  <p style="margin:0 0 24px;font-size:17px;color:#707078">HTML to image, rendered in your browser.</p>',
  '  <div style="height:160px;border-radius:12px;background:#4d90fe"></div>',
  '  <p style="margin:24px 0 0;font-size:16px;line-height:1.6">',
  '    Edit this markup, pick a width and a format, then convert.',
  '  </p>',
  '</div>',
].join('\n');

/** The reference's default capture width, and the canvas we lay out against. */
const DEFAULT_WIDTH = 1200;

/**
 * The markup to work with: whatever the visitor typed, or the sample until
 * they touch the field. Keeping the fallback here rather than seeding the
 * value bag means "ready" matches what the textarea actually shows.
 */
function markupOf(values: FieldValues): string {
  const v = values.html;
  return typeof v === 'string' ? v : SAMPLE_HTML;
}

function HtmlToImagePanel({ values, setValue }: PanelProps) {
  const source = str(values, 'source', 'markup');
  const urlBlocked = flag(values, 'urlBlocked', false);

  /*
   * The reference fetches the page on its own server. A browser cannot do that
   * for another origin, and PaperSnap has no server to ask, so pressing Add is
   * the moment to be honest about it and hand the visitor the mode that works.
   */
  const addUrl = () => {
    setValue('urlBlocked', true);
    setValue('source', 'markup');
  };

  return (
    <div className="flex flex-col gap-1">
      <Info>
        Your markup is laid out in a hidden iframe off-screen and rasterised in
        this tab, so nothing is uploaded. Scripts, forms and inline event
        handlers are stripped before anything is drawn.
      </Info>

      <Label>Add an image source</Label>
      <RadioCards
        name="source"
        value={source}
        onChange={(v) => setValue('source', v)}
        options={[
          { value: 'markup', title: 'Add HTML', body: 'Paste the markup to capture' },
          { value: 'url', title: 'Add website to convert', body: 'Capture a live page' },
        ]}
      />

      {source === 'url' ? (
        <>
          <TextField
            id="html-url"
            label="Url"
            placeholder="Write the website URL"
            value={str(values, 'url')}
            onChange={(v) => setValue('url', v)}
          />
          <ActionRow>
            <ActionButton onClick={addUrl}>Add</ActionButton>
          </ActionRow>
        </>
      ) : (
        <>
          {urlBlocked && (
            <Note>
              PaperSnap cannot load another site's page: browsers block one
              origin from reading another, and this tool has no server to fetch
              it for you. Open the page, copy its HTML, and paste it below.
            </Note>
          )}

          <TextArea
            id="html-source"
            label="HTML"
            rows={12}
            placeholder="<h1>Hello</h1>"
            value={markupOf(values)}
            onChange={(v) => {
              setValue('html', v);
              /* Once they have pasted markup the advice has been taken, so the
                 note stops repeating itself. */
              if (urlBlocked) setValue('urlBlocked', false);
            }}
          />
        </>
      )}

      <TextField
        id="html-width"
        label="Width (px)"
        type="number"
        min={200}
        max={4000}
        value={typeof values.width === 'string' ? values.width : String(DEFAULT_WIDTH)}
        onChange={(v) => setValue('width', v)}
      />

      <SelectField
        id="html-format"
        label="Format"
        value={str(values, 'format', 'png')}
        onChange={(v) => setValue('format', v)}
        options={[
          { value: 'png', label: 'PNG' },
          { value: 'jpg', label: 'JPG' },
        ]}
      />

      <Note>
        The reference also offers SVG, but it can rasterise a page on its own
        server. Everything here is a canvas capture in your tab, so PNG and JPG
        are the formats that can actually be produced.
      </Note>
    </div>
  );
}

/**
 * Drop everything that could run on its own once the markup is mounted.
 *
 * This is a local copy of the sanitiser in lib/htmlPdf on purpose: importing
 * that module would drag the PDF engine into this image tool's chunk, which is
 * a megabyte for one small function.
 */
function stripActive(html: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content
    .querySelectorAll('script,iframe,object,embed,link,meta,base,form')
    .forEach((el) => el.remove());
  for (const el of tpl.content.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return tpl.innerHTML;
}

/** Resolve once every image in the host has loaded or failed. */
function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  if (!images.length) return Promise.resolve();
  return Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }),
    ),
  ).then(() => undefined);
}

/**
 * Render markup off-screen and rasterise it.
 *
 * The host sits far outside the viewport rather than on a hidden layer,
 * because html2canvas can only measure an element that the browser has really
 * laid out; `display:none` would measure as zero.
 */
async function renderMarkup(markup: string, width: number): Promise<HTMLCanvasElement> {
  const host = document.createElement('div');
  host.style.cssText = [
    'position:fixed',
    'left:-20000px',
    'top:0',
    `width:${width}px`,
    'background:#ffffff',
    'padding:0',
    'margin:0',
    'z-index:-1',
  ].join(';');

  const body = document.createElement('div');
  body.style.cssText = [
    `width:${width}px`,
    'font-family:Helvetica,Arial,sans-serif',
    'font-size:16px',
    'line-height:1.6',
    'color:#161616',
    'background:#ffffff',
  ].join(';');
  body.innerHTML = stripActive(markup);

  host.appendChild(body);
  document.body.appendChild(host);

  try {
    await waitForImages(body);
    /* One frame for the browser to finish laying the markup out. */
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 40)));

    const box = body.getBoundingClientRect();
    const height = Math.max(1, Math.ceil(Math.max(box.height, body.scrollHeight)));

    /*
     * Rasterise at 2x so text stays crisp. A very tall document drops to 1x,
     * because canvases have a per-side pixel cap and fail silently past it.
     */
    const scale = height * 2 > 12000 ? 1 : 2;

    return await html2canvas(body, {
      scale,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });
  } finally {
    host.remove();
  }
}

export const htmlToImageTool: ToolImpl = {
  Panel: HtmlToImagePanel,

  /* No upload to wait for: any non-empty markup is enough to convert. */
  isReady: ({ values }) => markupOf(values).trim().length > 0,

  async run({ values, setProgress, setStatus }) {
    const markup = markupOf(values);
    if (!markup.trim()) throw new Error('Add some HTML markup first.');

    const width = Math.round(num(values, 'width', DEFAULT_WIDTH, 200, 4000));
    const format = str(values, 'format', 'png') === 'jpg' ? 'jpg' : 'png';

    setStatus('Rendering your markup...');
    const canvas = await renderMarkup(markup, width);

    setStatus('Encoding the image...');
    const blob = await encode(canvas, format, 0.92);
    setProgress(100);

    return [imageResult(blob, `image.${FORMAT_EXT[format]}`)];
  },
};
