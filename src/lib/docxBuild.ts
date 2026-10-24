/**
 * Builds a real .docx (OOXML) from text extracted out of a PDF.
 *
 * The package is written directly with JSZip instead of going through a
 * document generator, which keeps the output small and dependency-light. Each
 * PDF page becomes a block of Word paragraphs; font sizes are mapped from the
 * PDF text leading so headings keep their relative weight.
 */
import JSZip from 'jszip';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** One laid-out text line recovered by the PDF text extractor. */
export interface DocxRow {
  /** Baseline y in PDF user units, used to detect paragraph breaks. */
  y: number;
  x: number;
  text: string;
  /** Effective font size in points. */
  size: number;
  /** Column cells, when a caller managed to split the line. */
  cells?: string[];
}

export interface DocxPage {
  index: number;
  rows: DocxRow[];
}

export interface BuildDocxOptions {
  pages: DocxPage[];
  /** 'flow' joins lines into paragraphs, 'lines' keeps one line per paragraph. */
  mode?: 'flow' | 'lines';
  pageBreak?: boolean;
  title?: string;
}

interface RunOptions {
  bold?: boolean;
  /** Half-points, as Word stores them. */
  size?: number;
  color?: string;
}

interface ParagraphOptions extends RunOptions {
  spacing?: number;
  center?: boolean;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\u0000/g, '');
}

function run(text: string, { bold = false, size = 22, color = '333333' }: RunOptions = {}): string {
  return (
    '<w:r><w:rPr>' +
    (bold ? '<w:b/>' : '') +
    '<w:color w:val="' +
    color +
    '"/>' +
    '<w:sz w:val="' +
    size +
    '"/><w:szCs w:val="' +
    size +
    '"/>' +
    '</w:rPr><w:t xml:space="preserve">' +
    esc(text) +
    '</w:t></w:r>'
  );
}

function paragraph(text: string, opts: ParagraphOptions = {}): string {
  const spacing = opts.spacing != null ? opts.spacing : 120;
  const align = opts.center ? '<w:jc w:val="center"/>' : '';
  return (
    '<w:p><w:pPr>' +
    '<w:spacing w:after="' +
    spacing +
    '" w:line="276" w:lineRule="auto"/>' +
    align +
    '</w:pPr>' +
    run(text, opts) +
    '</w:p>'
  );
}

function heading(text: string, level = 1): string {
  return (
    '<w:p><w:pPr><w:pStyle w:val="Heading' +
    level +
    '"/><w:spacing w:before="240" w:after="120"/></w:pPr>' +
    run(text, { bold: true, size: level === 1 ? 36 : 28, color: '161616' }) +
    '</w:p>'
  );
}

/** Map a PDF font size to a Word half-point size, clamped to a sane range. */
function sizeFromPdf(px: number): number {
  const pt = Math.abs(px || 12);
  const half = Math.round(pt * 2.2);
  return Math.max(16, Math.min(72, half));
}

export async function buildDocx({
  pages,
  mode = 'flow',
  pageBreak = true,
  title = 'Document',
}: BuildDocxOptions): Promise<Blob> {
  const zip = new JSZip();

  const parts: string[] = [];
  if (mode === 'lines') {
    parts.push(heading(title, 1));
    pages.forEach((page, pi) => {
      if (pi > 0 && pageBreak) parts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      for (const row of page.rows) {
        if (!row.text.trim()) continue;
        const size = sizeFromPdf(row.size);
        const big = row.size >= 15;
        parts.push(paragraph(row.text, { bold: big, size }));
      }
    });
  } else {
    /* Flow mode: join lines into paragraphs and detect heading-ish lines. */
    parts.push(heading(title, 1));
    pages.forEach((page, pi) => {
      if (pi > 0 && pageBreak) parts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      let buffer: string[] = [];
      let bufferSize = 0;
      const flush = () => {
        if (!buffer.length) return;
        const text = buffer.join(' ').replace(/\s+/g, ' ').trim();
        buffer = [];
        if (!text) return;
        if (bufferSize >= 15) parts.push(heading(text, 2));
        else parts.push(paragraph(text, { size: Math.round(sizeFromPdf(bufferSize) * 0.85) }));
      };
      for (let i = 0; i < page.rows.length; i++) {
        const row = page.rows[i];
        const text = row.text.trim();
        if (!text) {
          flush();
          continue;
        }
        const prev = page.rows[i - 1];
        /* A gap clearly taller than the line itself starts a new paragraph. */
        const bigGap = prev ? Math.abs(row.y - prev.y) > Math.max(row.size, 10) * 1.9 : false;
        if (bigGap) flush();
        buffer.push(text);
        bufferSize = Math.max(bufferSize, row.size || 10);
        const endsSentence = /[.!?:;]$/.test(text);
        if (endsSentence) flush();
      }
      flush();
    });
  }

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="' +
    W_NS +
    '"><w:body>' +
    (parts.join('') || paragraph('(No extractable text found in this PDF.)')) +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/>' +
    '</w:sectPr></w:body></w:document>';

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="' +
    W_NS +
    '">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
    '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    '</w:docDefaults>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>' +
    '</w:styles>';

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';

  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';

  const docRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' +
    esc(title) +
    '</dc:title>' +
    '<dc:creator>PaperSnap</dc:creator>' +
    '<cp:lastModifiedBy>PaperSnap</cp:lastModifiedBy>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' +
    now +
    '</dcterms:created>' +
    '<dcterms:modified xsi:type="dcterms:W3CDTF">' +
    now +
    '</dcterms:modified>' +
    '</cp:coreProperties>';

  const app =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    '<Application>PaperSnap</Application></Properties>';

  zip.file('[Content_Types].xml', contentTypes);
  zip.folder('_rels')?.file('.rels', rels);
  const props = zip.folder('docProps');
  props?.file('core.xml', core);
  props?.file('app.xml', app);
  const word = zip.folder('word');
  word?.file('document.xml', documentXml);
  word?.file('styles.xml', stylesXml);
  word?.folder('_rels')?.file('document.xml.rels', docRels);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
