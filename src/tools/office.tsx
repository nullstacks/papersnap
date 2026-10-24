/**
 * Office conversions, all executed inside the browser tab:
 *   Word  -> PDF   : mammoth turns the .docx into HTML, then the local layout
 *                    engine prints it with the browser's own renderer
 *   PDF   -> Word  : text extraction plus a hand-built OOXML package (JSZip)
 *   Excel -> PDF   : SheetJS reads the sheets, pdf-lib lays them out as tables
 *   PDF   -> Excel : text grouped by baseline into rows and columns
 *   HTML  -> PDF   : the same layout engine, fed from a textarea
 *
 * Nothing is uploaded; every option is read from the panel's `values` bag so a
 * run never has to look at the DOM.
 */
import {
  PDFDocument,
  StandardFonts,
  baseName,
  bytesFor,
  loadForView,
  pageSize,
  pdfResult,
  rgb,
} from '@/lib/pdf';
import type { PDFFont } from '@cantoo/pdf-lib';
import { buildDocx } from '@/lib/docxBuild';
import type { DocxPage, DocxRow } from '@/lib/docxBuild';
import { htmlToPdfBlob } from '@/lib/htmlPdf';
import type { PanelProps, ResultFile, ToolImpl, WorkFile } from '@/types';

/* ------------------------------------------------------------------ styling */

const INPUT =
  'h-8 w-full rounded border border-muted bg-surface px-3 text-sm text-ink focus:outline-none focus:border-ink';
const SELECT = `${INPUT} pr-8 appearance-none cursor-pointer`;
const AREA =
  'w-full resize-y rounded border border-muted bg-surface px-3 py-2 text-sm leading-relaxed text-ink focus:border-ink focus:outline-none';
const FILE_INPUT = 'h-auto w-full rounded border border-muted bg-surface px-2.5 py-2 text-sm';

function str(value: string | boolean | null): string {
  return typeof value === 'string' ? value : '';
}

function num(value: string | boolean | null, fallback: number): number {
  const parsed = parseFloat(str(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** A page-size picker shared by the tools that print onto a fixed page. */
function PageSizeField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="option-title" htmlFor={id}>
        Page size
      </label>
      <select
        id={id}
        className={SELECT}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="A4">A4</option>
        <option value="letter">Letter</option>
        <option value="legal">Legal</option>
      </select>
    </div>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer text-[15px] text-ink-2">
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border bg-surface ${
          checked ? 'border-success' : 'border-muted'
        }`}
      >
        {checked && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="text-success-dark"
            aria-hidden="true"
          >
            <path d="M8.1 14.3 4 10.2l1.4-1.4 2.7 2.7 6.5-6.5L16 6.4z" />
          </svg>
        )}
      </span>
      <span>{label}</span>
    </label>
  );
}

/* ------------------------------------------------------- shared PDF text pass */

/** The subset of pdf.js text items we use; marked-content markers are skipped. */
interface PdfTextItem {
  str: string;
  transform: number[];
}

/** Pull laid-out text lines out of a PDF, one array per page. */
async function extractLines(file: WorkFile): Promise<DocxPage[]> {
  const doc = await loadForView((await bytesFor(file)).slice());
  const pages: DocxPage[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const rows: DocxRow[] = [];
      let lastY: number | null = null;
      let line: DocxRow | null = null;

      for (const item of content.items as unknown as PdfTextItem[]) {
        if (!item.str) continue;
        const y = Math.round(item.transform[5]);
        if (lastY === null || Math.abs(y - lastY) > 3) {
          line = {
            y,
            x: item.transform[4],
            text: item.str,
            size: Math.abs(item.transform[3]) || 12,
          };
          rows.push(line);
          lastY = y;
        } else if (line) {
          line.text += item.str;
        }
      }

      /* PDF user space grows upwards, so a descending sort reads top to bottom. */
      pages.push({ index: p, rows: rows.sort((a, b) => b.y - a.y) });
    }
  } finally {
    void doc.destroy();
  }
  return pages;
}

/* ============================== WORD -> PDF ============================== */

function WordToPdfPanel({ values, setValue }: PanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="info-box">
        Headings, paragraphs, lists and tables from the .docx are preserved and laid out for
        print.
      </div>
      <PageSizeField
        id="wpdf-pagesize"
        value={str(values.pageSize) || 'A4'}
        onChange={(next) => setValue('pageSize', next)}
      />
      <div className="flex flex-col gap-2">
        <label className="option-title" htmlFor="wpdf-margin">
          Margin (pt)
        </label>
        <input
          id="wpdf-margin"
          className={INPUT}
          type="number"
          min={0}
          max={200}
          value={typeof values.margin === 'string' ? values.margin : '56'}
          onChange={(event) => setValue('margin', event.target.value)}
        />
      </div>
    </div>
  );
}

export const wordToPdfTool: ToolImpl = {
  Panel: WordToPdfPanel,

  async run({ files, values, setProgress, setStatus }) {
    const size = str(values.pageSize) || 'A4';
    const margin = num(values.margin, 56);
    /* The browser bundle is the one that runs without Node's fs; the package
     * entry point would drag `fs`/`path` into the client build. It is a UMD
     * bundle, so the module object itself is the default export. */
    const { default: mammoth } = await import('mammoth/mammoth.browser.js');
    const results: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Reading ${file.name}…`);
      /* mammoth's browser path reads the raw array buffer, not the cached bytes. */
      const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.file.arrayBuffer() });
      setStatus('Building PDF…');
      const blob = await htmlToPdfBlob({ html: value, pageSize: size, margin });
      results.push({
        name: `${baseName(file.name)}.pdf`,
        blob,
        size: blob.size,
      });
      setProgress(((i + 1) / files.length) * 100);
    }
    return results;
  },
};

/* ============================== PDF -> WORD ============================== */

function PdfToWordPanel({ values, setValue }: PanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="info-box">
        Text and basic layout are rebuilt into a real .docx you can edit in Word, LibreOffice or
        Google Docs.
      </div>
      <div className="flex flex-col gap-2">
        <label className="option-title" htmlFor="pdf2word-layout">
          Layout
        </label>
        <select
          id="pdf2word-layout"
          className={SELECT}
          value={str(values.layout) || 'flow'}
          onChange={(event) => setValue('layout', event.target.value)}
        >
          <option value="flow">Flowing text (best for editing)</option>
          <option value="lines">One line per paragraph (closest to original)</option>
        </select>
      </div>
      <CheckRow
        label="Start each PDF page on a new Word page"
        checked={values.pageBreak !== false}
        onChange={(next) => setValue('pageBreak', next)}
      />
    </div>
  );
}

export const pdfToWordTool: ToolImpl = {
  Panel: PdfToWordPanel,

  async run({ files, values, setProgress, setStatus }) {
    const mode = str(values.layout) === 'lines' ? 'lines' : 'flow';
    const pageBreak = values.pageBreak !== false;
    const results: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Reading ${file.name}…`);
      const pages = await extractLines(file);
      setStatus('Building Word document…');
      const blob = await buildDocx({ pages, mode, pageBreak, title: baseName(file.name) });
      results.push({ name: `${baseName(file.name)}.docx`, blob, size: blob.size });
      setProgress(((i + 1) / files.length) * 100);
    }
    return results;
  },
};

/* ============================== EXCEL -> PDF ============================== */

type Cell = unknown;

interface SheetRows {
  name: string;
  rows: Cell[][];
}

/** Lay every sheet out as a printable table with repeating headers. */
async function sheetsToPdf({
  sheets,
  orientation,
  sizeName,
  margin,
}: {
  sheets: SheetRows[];
  orientation: string;
  sizeName: string;
  margin: number;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const s = pageSize(sizeName);
  const pageW = orientation === 'landscape' ? s.height : s.width;
  const pageH = orientation === 'landscape' ? s.width : s.height;
  const fs = 9;
  const rowH = fs * 1.9;

  for (const sheet of sheets) {
    const allRows: Cell[][] = sheet.rows.length ? sheet.rows : [['(empty sheet)']];
    const cols = Math.max(1, ...allRows.map((r) => r.length));
    const usable = pageW - margin * 2;
    const colW = usable / cols;
    let page = doc.addPage([pageW, pageH]);
    let y = pageH - margin;

    const fit = (text: Cell, width: number, fnt: PDFFont, size: number) => {
      let out = String(text);
      if (fnt.widthOfTextAtSize(out, size) <= width - 8) return out;
      while (out.length > 1 && fnt.widthOfTextAtSize(`${out}…`, size) > width - 8) {
        out = out.slice(0, -1);
      }
      return `${out}…`;
    };

    const header = (row: Cell[]) => {
      page.drawRectangle({
        x: margin,
        y: y - rowH,
        width: usable,
        height: rowH,
        color: rgb(0.93, 0.94, 0.96),
      });
      row.forEach((cell, c) => {
        page.drawText(fit(cell, colW, bold, fs), {
          x: margin + c * colW + 4,
          y: y - rowH + 6,
          size: fs,
          font: bold,
          color: rgb(0.13, 0.13, 0.16),
        });
      });
      y -= rowH;
    };

    for (const row of allRows) {
      /* Re-emit the header row whenever we run off the bottom of a page. */
      if (y - rowH < margin) {
        page = doc.addPage([pageW, pageH]);
        y = pageH - margin;
        header(allRows[0]);
      }
      row.forEach((cell, c) => {
        if (cell == null || cell === '') return;
        page.drawText(fit(cell, colW, font, fs), {
          x: margin + c * colW + 4,
          y: y - rowH + 6,
          size: fs,
          font,
          color: rgb(0.28, 0.28, 0.31),
        });
      });
      page.drawLine({
        start: { x: margin, y: y - rowH },
        end: { x: margin + usable, y: y - rowH },
        thickness: 0.5,
        color: rgb(0.86, 0.86, 0.88),
      });
      y -= rowH;
    }
  }

  return doc.save();
}

function ExcelToPdfPanel({ values, setValue }: PanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="info-box">
        Each worksheet is laid out as a printable table with repeating headers.
      </div>
      <div className="flex flex-col gap-2">
        <label className="option-title" htmlFor="xpdf-orientation">
          Orientation
        </label>
        <select
          id="xpdf-orientation"
          className={SELECT}
          value={str(values.orientation) || 'landscape'}
          onChange={(event) => setValue('orientation', event.target.value)}
        >
          <option value="landscape">Landscape</option>
          <option value="portrait">Portrait</option>
        </select>
      </div>
      <PageSizeField
        id="xpdf-pagesize"
        value={str(values.pageSize) || 'A4'}
        onChange={(next) => setValue('pageSize', next)}
      />
      <div className="flex flex-col gap-2">
        <label className="option-title" htmlFor="xpdf-margin">
          Margin (pt)
        </label>
        <input
          id="xpdf-margin"
          className={INPUT}
          type="number"
          min={0}
          max={200}
          value={typeof values.margin === 'string' ? values.margin : '36'}
          onChange={(event) => setValue('margin', event.target.value)}
        />
      </div>
    </div>
  );
}

export const excelToPdfTool: ToolImpl = {
  Panel: ExcelToPdfPanel,

  async run({ files, values, setProgress, setStatus }) {
    const orientation = str(values.orientation) || 'landscape';
    const sizeName = str(values.pageSize) || 'A4';
    const margin = num(values.margin, 36);
    const XLSX = await import('xlsx');
    const results: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Reading ${file.name}…`);
      const wb = XLSX.read(await file.file.arrayBuffer(), { type: 'array' });
      const sheets: SheetRows[] = wb.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[name], {
          header: 1,
          blankrows: false,
          raw: false,
        }) as unknown as Cell[][],
      }));
      setStatus('Laying out sheets…');
      const bytes = await sheetsToPdf({ sheets, orientation, sizeName, margin });
      results.push(pdfResult(bytes, `${baseName(file.name)}.pdf`));
      setProgress(((i + 1) / files.length) * 100);
    }
    return results;
  },
};

/* ============================== PDF -> EXCEL ============================== */

/** Split one extracted line into cells, following the chosen strategy. */
function splitRow(row: DocxRow, mode: string): string[] {
  if (mode === 'line') return [row.text];
  if (mode === 'space') return row.text.split(/\s{2,}/).filter(Boolean);
  /* Gap mode prefers the column cells captured while extracting; the extractor
   * does not record them, so this falls back to runs of spaces like v1 did. */
  return row.cells || row.text.split(/\s{2,}/).filter(Boolean);
}

function PdfToExcelPanel({ values, setValue }: PanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="info-box">
        Text is grouped by vertical position so tabular pages become clean rows.
      </div>
      <div className="flex flex-col gap-2">
        <label className="option-title" htmlFor="pdf2xlsx-split">
          Split columns by
        </label>
        <select
          id="pdf2xlsx-split"
          className={SELECT}
          value={str(values.splitMode) || 'gap'}
          onChange={(event) => setValue('splitMode', event.target.value)}
        >
          <option value="gap">Detected gaps (recommended)</option>
          <option value="space">Multiple spaces</option>
          <option value="line">Whole line in one cell</option>
        </select>
      </div>
      <CheckRow
        label="One worksheet per PDF page"
        checked={values.perPage !== false}
        onChange={(next) => setValue('perPage', next)}
      />
    </div>
  );
}

export const pdfToExcelTool: ToolImpl = {
  Panel: PdfToExcelPanel,

  async run({ files, values, setProgress, setStatus }) {
    const splitMode = str(values.splitMode) || 'gap';
    const perPage = values.perPage !== false;
    const XLSX = await import('xlsx');
    const results: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setStatus(`Reading ${file.name}…`);
      const pages = await extractLines(file);
      const wb = XLSX.utils.book_new();
      const sheets = perPage
        ? pages
        : [{ index: 1, rows: pages.flatMap((page) => page.rows) }];
      for (const page of sheets) {
        const rows = page.rows.map((row) => splitRow(row, splitMode));
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, `Page ${page.index}`);
      }
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
      const blob = new Blob([out], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      results.push({ name: `${baseName(file.name)}.xlsx`, blob, size: blob.size });
      setProgress(((i + 1) / files.length) * 100);
    }
    return results;
  },
};

/* ============================== HTML -> PDF ============================== */

/**
 * Form-driven panel: this tool has no uploader, so the whole input — the HTML
 * source and the optional file loader — lives here, in the main work area.
 */
function HtmlToPdfPanel({ values, setValue }: PanelProps) {
  const loadFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    setValue('html', await file.text());
    /* Allow re-picking the same file after editing the textarea. */
    input.value = '';
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="info-box">
        Paste HTML or drop an .html file. It is rendered with the browser&apos;s own layout engine
        and printed to PDF locally.
      </div>

      <div className="flex flex-col gap-2">
        <label className="option-title" htmlFor="html-source">
          HTML
        </label>
        <textarea
          id="html-source"
          className={AREA}
          rows={9}
          placeholder="<h1>Hello</h1><p>Your markup here…</p>"
          value={str(values.html)}
          onChange={(event) => setValue('html', event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="option-title" htmlFor="html-file">
          Or load a file
        </label>
        <input
          id="html-file"
          className={FILE_INPUT}
          type="file"
          accept=".html,.htm,text/html"
          onChange={(event) => void loadFile(event.currentTarget)}
        />
      </div>

      <PageSizeField
        id="html-pagesize"
        value={str(values.pageSize) || 'A4'}
        onChange={(next) => setValue('pageSize', next)}
      />

      <div className="flex flex-col gap-2">
        <label className="option-title" htmlFor="html-margin">
          Margin (pt)
        </label>
        <input
          id="html-margin"
          className={INPUT}
          type="number"
          min={0}
          max={200}
          value={typeof values.margin === 'string' ? values.margin : '48'}
          onChange={(event) => setValue('margin', event.target.value)}
        />
      </div>
    </div>
  );
}

export const htmlToPdfTool: ToolImpl = {
  Panel: HtmlToPdfPanel,

  /* No upload is needed: the textarea alone is enough to convert. */
  isReady: ({ values }) => str(values.html).trim().length > 0,

  async run({ values, setProgress, setStatus }) {
    const html = str(values.html);
    if (!html.trim()) throw new Error('Paste some HTML first.');
    const size = str(values.pageSize) || 'A4';
    const margin = num(values.margin, 48);

    setStatus('Rendering HTML…');
    const blob = await htmlToPdfBlob({ html, pageSize: size, margin });
    setProgress(100);
    return [{ name: 'document.pdf', blob, size: blob.size }];
  },
};
