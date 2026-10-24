/**
 * PowerPoint conversions.
 *
 * PPTX -> PDF: a .pptx is a zip of slideXML files. The text runs, the slide
 * size and each slide's order are pulled straight out of the package, then the
 * slides are laid out at the presentation's own aspect ratio. No Office engine
 * is involved.
 *
 * PDF -> PPTX: each page is rendered to a JPEG and placed on a slide whose
 * aspect ratio matches the page.
 *
 * PDF -> PDF/A: page-by-page copy plus a conformance metadata rewrite.
 */
import {
  PDFDocument,
  StandardFonts,
  baseName,
  bytesFor,
  loadForView,
  loadPdf,
  pdfResult,
  rgb,
} from '@/lib/pdf';
import type { PDFFont } from '@cantoo/pdf-lib';
import type { PDFAConformanceLevel } from '@cantoo/pdf-lib';
import type JSZip from 'jszip';
import type { PanelProps, ResultFile, ToolImpl, WorkFile } from '@/types';

/* ------------------------------------------------------------------ styling */

interface RadioOption {
  value: string;
  title: string;
  body: string;
}

function str(value: string | boolean | null): string {
  return typeof value === 'string' ? value : '';
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
            className={`relative flex flex-wrap items-start gap-x-3 rounded-lg border p-3.5 cursor-pointer ${
              on ? 'border-muted' : 'border-line-soft'
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              checked={on}
              onChange={() => onChange(option.value)}
            />
            <span
              className={`mt-0.5 h-[22px] w-[22px] shrink-0 rounded-full bg-surface ${
                on ? 'border-[6px] border-ink-2' : 'border border-muted'
              }`}
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

/* ------------------------------------------------------------- PPTX reading */

const EMU_PER_PT = 12700;

/** Collect every <a:t> run that belongs to the slide itself (not notes). */
function slideText(xml: string): string[] {
  const runs: string[] = [];
  const re = /<a:t>([\s\S]*?)<\/a:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const raw = m[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
    if (raw.trim()) runs.push(raw);
  }
  return runs;
}

/** Slide size comes from presentation.xml, in EMU. */
function slideSize(xml: string): { w: number; h: number } {
  const m = xml.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
  if (!m) return { w: 960, h: 540 };
  return { w: Math.round(+m[1] / EMU_PER_PT), h: Math.round(+m[2] / EMU_PER_PT) };
}

/** Slide order is defined by presentation.xml + rels, not by file name. */
async function orderedSlidePaths(zip: JSZip, presentationXml: string): Promise<string[]> {
  const ids: string[] = [];
  const re = /<p:sldId[^>]*r:id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(presentationXml))) ids.push(m[1]);

  const relsFile = zip.file('ppt/_rels/presentation.xml.rels');
  const rels: Record<string, string> = {};
  if (relsFile) {
    const relXml = await relsFile.async('text');
    const rr = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
    let x: RegExpExecArray | null;
    while ((x = rr.exec(relXml))) rels[x[1]] = x[2];
  }

  const paths = ids
    .map((id) => {
      const target = rels[id] || '';
      if (!target) return null;
      return target.startsWith('/') ? target.slice(1) : `ppt/${target.replace(/^\.\//, '')}`;
    })
    .filter((p): p is string => Boolean(p));
  if (paths.length) return paths;

  /* Fall back to numeric ordering when the relationships are missing. */
  return Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
}

/* Break a string into lines that fit the given width. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/* ============================ PPTX -> PDF ============================ */

const PPT_LAYOUTS: RadioOption[] = [
  {
    value: 'outline',
    title: 'Text outline',
    body: 'One page per slide, text laid out top to bottom.',
  },
  {
    value: 'title',
    title: 'Title and body',
    body: 'First line as a heading, the rest as body text.',
  },
];

function PowerPointToPdfPanel({ values, setValue }: PanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="info-box">
        Slide text is rebuilt on a page with the presentation&apos;s own aspect ratio. Images and
        charts inside slides are not reproduced.
      </div>
      <div className="option-title">Layout</div>
      <RadioCards
        name="pptLayout"
        value={str(values.layout) || 'outline'}
        options={PPT_LAYOUTS}
        onChange={(next) => setValue('layout', next)}
      />
    </div>
  );
}

export const powerpointToPdfTool: ToolImpl = {
  Panel: PowerPointToPdfPanel,

  async run({ files, values, setProgress, setStatus }) {
    const mode = str(values.layout) || 'outline';
    const { default: JSZip } = await import('jszip');
    const results: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Reading ${file.name}…`);
      const zip = await JSZip.loadAsync(await file.file.arrayBuffer());

      const presFile = zip.file('ppt/presentation.xml');
      if (!presFile) throw new Error('This file is not a .pptx presentation.');
      const presXml = await presFile.async('text');
      const size = slideSize(presXml);
      const paths = await orderedSlidePaths(zip, presXml);
      if (!paths.length) throw new Error('No slides were found inside this presentation.');

      const out = await PDFDocument.create();
      const font = await out.embedFont(StandardFonts.Helvetica);
      const bold = await out.embedFont(StandardFonts.HelveticaBold);
      const margin = 48;
      const usable = size.w - margin * 2;

      for (let s = 0; s < paths.length; s++) {
        setStatus(`Laying out slide ${s + 1} of ${paths.length}…`);
        const entry = zip.file(paths[s]);
        const runs = entry ? slideText(await entry.async('text')) : [];
        const page = out.addPage([size.w, size.h]);

        let y = size.h - margin;
        const first = runs[0] || '';
        const rest = mode === 'title' ? runs.slice(1) : runs;

        if (first) {
          const size1 = mode === 'title' ? 30 : 22;
          for (const line of wrapText(first, bold, size1, usable)) {
            page.drawText(line, {
              x: margin,
              y,
              size: size1,
              font: bold,
              color: rgb(0.12, 0.12, 0.16),
            });
            y -= size1 * 1.32;
          }
          y -= 14;
        }

        for (const run of rest) {
          for (const line of wrapText(run, font, 14, usable)) {
            if (y < margin + 20) break;
            page.drawText(line, { x: margin, y, size: 14, font, color: rgb(0.28, 0.28, 0.33) });
            y -= 14 * 1.5;
          }
        }

        if (!runs.length) {
          page.drawText(`(slide ${s + 1} has no text)`, {
            x: margin,
            y: size.h / 2,
            size: 14,
            font,
            color: rgb(0.6, 0.6, 0.65),
          });
        }

        page.drawText(String(s + 1), {
          x: size.w / 2 - 4,
          y: 20,
          size: 9,
          font,
          color: rgb(0.65, 0.65, 0.7),
        });
        setProgress(((s + 1) / paths.length) * 100);
      }

      results.push(pdfResult(await out.save(), `${baseName(file.name)}.pdf`));
      setProgress(((i + 1) / files.length) * 100);
    }
    return results;
  },
};

/* ============================ PDF -> PPTX ============================ */

const PPTX_QUALITIES: RadioOption[] = [
  { value: '1.5', title: 'Standard', body: 'Smaller file, good enough for reading.' },
  { value: '2', title: 'High', body: 'Sharper slides for presenting.' },
  { value: '3', title: 'Very high', body: 'Best quality, largest file.' },
];

function PdfToPowerpointPanel({ files, values, setValue }: PanelProps) {
  const pages = files[0]?.pages ?? null;
  return (
    <div className="flex flex-col gap-4">
      <div className="info-box">Each page becomes a slide rendered at the quality you pick below.</div>
      <div className="option-title">Image quality</div>
      <RadioCards
        name="pptxQuality"
        value={str(values.quality) || '2'}
        options={PPTX_QUALITIES}
        onChange={(next) => setValue('quality', next)}
      />
      <p className="text-sm leading-[18px] text-muted">
        {pages ? `${pages} slide${pages === 1 ? '' : 's'} will be created.` : ''}
      </p>
    </div>
  );
}

/** Everything the OOXML packer needs, gathered while pages render. */
interface PptxParts {
  slides: string[];
  slideRels: string[];
  media: Array<{ name: string; data: Uint8Array }>;
  slideW: number;
  slideH: number;
}

/** Assemble a minimal but valid OOXML presentation package. */
async function packPptx(pkg: PptxParts): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const { slides, slideRels, media, slideW, slideH } = pkg;
  const zip = new JSZip();

  const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const CT = 'application/vnd.openxmlformats-officedocument.presentationml';

  /* 9525 EMU per CSS pixel, matching the 96 dpi slide grid used above. */
  const EMU = 9525;

  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Default Extension="jpg" ContentType="image/jpeg"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="' +
      CT +
      '.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="' +
      CT +
      '.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="' +
      CT +
      '.slideLayout+xml"/>' +
      slides
        .map(
          (_, i) =>
            '<Override PartName="/ppt/slides/slide' +
            (i + 1) +
            '.xml" ContentType="' +
            CT +
            '.slide+xml"/>',
        )
        .join('') +
      '</Types>',
  );

  zip.folder('_rels')?.file(
    '.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="' +
      PKG_REL +
      '">' +
      '<Relationship Id="rId1" Type="' +
      NS_R +
      '/officeDocument" Target="ppt/presentation.xml"/>' +
      '</Relationships>',
  );

  const slideIds = slides
    .map((_, i) => '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>')
    .join('');

  zip.folder('ppt')?.file(
    'presentation.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:presentation xmlns:a="' +
      NS_A +
      '" xmlns:r="' +
      NS_R +
      '" xmlns:p="' +
      NS_P +
      '">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      '<p:sldIdLst>' +
      slideIds +
      '</p:sldIdLst>' +
      '<p:sldSz cx="' +
      slideW * EMU +
      '" cy="' +
      slideH * EMU +
      '"/>' +
      '<p:notesSz cx="6858000" cy="9144000"/>' +
      '</p:presentation>',
  );

  zip.folder('ppt/_rels')?.file(
    'presentation.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="' +
      PKG_REL +
      '">' +
      '<Relationship Id="rId1" Type="' +
      NS_R +
      '/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
      slides
        .map(
          (_, i) =>
            '<Relationship Id="rId' +
            (i + 2) +
            '" Type="' +
            NS_R +
            '/slide" Target="slides/slide' +
            (i + 1) +
            '.xml"/>',
        )
        .join('') +
      '</Relationships>',
  );

  const slideDir = zip.folder('ppt/slides');
  slides.forEach((xml, i) => slideDir?.file('slide' + (i + 1) + '.xml', xml));
  const relDir = zip.folder('ppt/slides/_rels');
  slideRels.forEach((xml, i) => relDir?.file('slide' + (i + 1) + '.xml.rels', xml));

  const mediaDir = zip.folder('ppt/media');
  media.forEach((m) => mediaDir?.file(m.name, m.data));

  zip.folder('ppt/slideMasters')?.file(
    'slideMaster1.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sldMaster xmlns:a="' +
      NS_A +
      '" xmlns:r="' +
      NS_R +
      '" xmlns:p="' +
      NS_P +
      '">' +
      '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>' +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
      '</p:sldMaster>',
  );
  zip.folder('ppt/slideMasters/_rels')?.file(
    'slideMaster1.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="' +
      PKG_REL +
      '">' +
      '<Relationship Id="rId1" Type="' +
      NS_R +
      '/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
      '</Relationships>',
  );

  zip.folder('ppt/slideLayouts')?.file(
    'slideLayout1.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sldLayout xmlns:a="' +
      NS_A +
      '" xmlns:r="' +
      NS_R +
      '" xmlns:p="' +
      NS_P +
      '" type="blank" preserve="1">' +
      '<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>' +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>',
  );
  zip.folder('ppt/slideLayouts/_rels')?.file(
    'slideLayout1.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="' +
      PKG_REL +
      '">' +
      '<Relationship Id="rId1" Type="' +
      NS_R +
      '/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
      '</Relationships>',
  );

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

function jpegBytes(dataUrl: string): Uint8Array {
  const raw = atob(dataUrl.split(',')[1]);
  const arr = new Uint8Array(raw.length);
  for (let k = 0; k < raw.length; k++) arr[k] = raw.charCodeAt(k);
  return arr;
}

/** One slide part holding a full-bleed picture of the rendered page. */
function slidePart(pageNumber: number, slideW: number, slideH: number): string {
  /* 9525 EMU per CSS pixel; the picture fills the slide exactly. */
  const EMU = 9525;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    '<p:cSld><p:spTree>' +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    '<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page ' +
    pageNumber +
    '"/>' +
    '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
    '<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
    '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' +
    slideW * EMU +
    '" cy="' +
    slideH * EMU +
    '"/></a:xfrm>' +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>' +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  );
}

function slideRelsPart(mediaName: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/' +
    mediaName +
    '"/>' +
    '</Relationships>'
  );
}

/** Render every page to a JPEG so the deck is self-contained. */
async function renderPages(
  file: WorkFile,
  scale: number,
  setProgress: (p: number) => void,
  setStatus: (t: string) => void,
): Promise<PptxParts> {
  const doc = await loadForView((await bytesFor(file)).slice());

  try {
    const slides: string[] = [];
    const slideRels: string[] = [];
    const media: Array<{ name: string; data: Uint8Array }> = [];

    /* Use the first page's aspect ratio for the whole deck. */
    const first = await doc.getPage(1);
    const vp0 = first.getViewport({ scale: 1 });
    const ratio = vp0.width / vp0.height;
    const slideH = 540;
    const slideW = Math.round(slideH * ratio);

    for (let p = 1; p <= doc.numPages; p++) {
      setStatus(`Rendering page ${p} of ${doc.numPages}…`);
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Your browser could not render this PDF.');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const name = `image${p}.jpg`;
      media.push({ name, data: jpegBytes(canvas.toDataURL('image/jpeg', 0.9)) });
      slides.push(slidePart(p, slideW, slideH));
      slideRels.push(slideRelsPart(name));
      setProgress((p / doc.numPages) * 92);
    }

    return { slides, slideRels, media, slideW, slideH };
  } finally {
    void doc.destroy();
  }
}

export const pdfToPowerpointTool: ToolImpl = {
  Panel: PdfToPowerpointPanel,

  async run({ files, values, setProgress, setStatus }) {
    const scale = parseFloat(str(values.quality)) || 2;
    const results: ResultFile[] = [];

    for (const file of files) {
      const parts = await renderPages(file, scale, setProgress, setStatus);

      setStatus('Packaging presentation…');
      const blob = await packPptx(parts);
      results.push({ name: `${baseName(file.name)}.pptx`, blob, size: blob.size });
      setProgress(100);
    }
    return results;
  },
};

/* ============================ PDF -> PDF/A ============================ */

const PDFA_LEVELS: RadioOption[] = [
  { value: '2B', title: 'PDF/A-2b', body: 'ISO 19005-2, basic conformance. Widely accepted.' },
  { value: '1B', title: 'PDF/A-1b', body: 'ISO 19005-1, the strictest basic profile.' },
  { value: '3B', title: 'PDF/A-3b', body: 'ISO 19005-3, allows embedded files.' },
];

function pdfaLevel(value: string | boolean | null): PDFAConformanceLevel {
  const picked = str(value) || '2B';
  /* pdf-lib throws a low-level message for unknown parts, so validate here. */
  if (picked === '1B' || picked === '2B' || picked === '3B') return picked;
  throw new Error('Choose a PDF/A conformance level first.');
}

function PdfToPdfAPanel({ values, setValue }: PanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="info-box">
        Rewrites the document with PDF/A conformance metadata so archives can validate it.
        Encryption and JavaScript are removed in the process.
      </div>
      <div className="option-title">Conformance level</div>
      <RadioCards
        name="pdfaLevel"
        value={str(values.level) || '2B'}
        options={PDFA_LEVELS}
        onChange={(next) => setValue('level', next)}
      />
    </div>
  );
}

export const pdfToPdfATool: ToolImpl = {
  Panel: PdfToPdfAPanel,

  async run({ files, values, setProgress, setStatus }) {
    const level = pdfaLevel(values.level);
    const results: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Converting ${file.name} to PDF/A-${level}…`);
      const src = await loadPdf(await bytesFor(file));
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((page) => out.addPage(page));
      out.convertToPDFA({ conformance: level });
      results.push(pdfResult(await out.save(), `${baseName(file.name)}_pdfa.pdf`));
      setProgress(((i + 1) / files.length) * 100);
    }
    return results;
  },
};
