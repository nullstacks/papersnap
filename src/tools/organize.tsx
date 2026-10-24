/*
 * Organize tools: merging several PDFs into one, and splitting a PDF into
 * separate files by custom ranges, one page per file, or fixed-size chunks.
 *
 * Both panels are plain controlled components — every option lives in the
 * tool's `values` bag so `run` never has to read the DOM.
 */
import {
  PDFDocument,
  baseName,
  bytesFor,
  loadPdf,
  parseRangeGroups,
  pdfResult,
} from '@/lib/pdf';
import type { FieldValues, PanelProps, ResultFile, ToolImpl } from '@/types';

const INPUT =
  'h-8 w-full rounded border border-muted bg-surface px-3 text-sm text-ink focus:outline-none focus:border-ink';

/** Read a text-ish value out of the free-form bag. */
function str(value: string | boolean | null): string {
  return typeof value === 'string' ? value : '';
}

/* ================================ MERGE ================================ */

function MergePanel({ files }: PanelProps) {
  const count = files.length;
  return (
    <div className="flex flex-col gap-4">
      <div className="info-box">
        To change the order of your PDFs, drag and drop the files as you want.
      </div>
      <p className="text-sm leading-[18px] text-muted">
        {count
          ? `${count} file${count === 1 ? '' : 's'} will be merged into one document.`
          : ''}
      </p>
    </div>
  );
}

export const mergeTool: ToolImpl = {
  Panel: MergePanel,

  async run({ files, setProgress, setStatus }) {
    const out = await PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      setStatus(`Merging file ${i + 1} of ${files.length}…`);
      const doc = await loadPdf(await bytesFor(files[i]));
      const pages = await out.copyPages(doc, doc.getPageIndices());
      for (const page of pages) out.addPage(page);
      setProgress(((i + 1) / files.length) * 92);
    }
    return [pdfResult(await out.save(), 'merged.pdf')];
  },
};

/* ================================ SPLIT ================================ */

interface RadioOption {
  value: string;
  title: string;
  body: string;
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

const SPLIT_MODES: RadioOption[] = [
  {
    value: 'ranges',
    title: 'Custom ranges',
    body: 'Choose exactly which pages end up in which file.',
  },
  { value: 'each', title: 'Every page', body: 'Each page becomes its own PDF.' },
  { value: 'fixed', title: 'Every N pages', body: 'Split the document into equal chunks.' },
];

function SplitPanel({ files, values, setValue }: PanelProps) {
  const mode = str(values.splitMode) || 'ranges';
  const pages = files[0]?.pages ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="option-title">Split mode</div>
      <RadioCards
        name="splitMode"
        value={mode}
        options={SPLIT_MODES}
        onChange={(next) => setValue('splitMode', next)}
      />

      {mode === 'ranges' && (
        <div className="flex flex-col gap-2">
          <label className="option-title" htmlFor="split-ranges">
            Ranges
          </label>
          <input
            id="split-ranges"
            className={INPUT}
            placeholder="e.g. 1-3,5,8-10"
            value={str(values.rangeInput)}
            onChange={(event) => setValue('rangeInput', event.target.value)}
          />
          <p className="text-sm leading-[18px] text-muted">
            {pages ? `This document has ${pages} pages. Leave empty to split every page.` : ''}
          </p>
          <CheckRow
            label="Merge all ranges in one PDF file."
            checked={values.mergeRanges === true}
            onChange={(next) => setValue('mergeRanges', next)}
          />
        </div>
      )}

      {mode === 'fixed' && (
        <div className="flex flex-col gap-2">
          <label className="option-title" htmlFor="split-chunk">
            Pages per file
          </label>
          <input
            id="split-chunk"
            type="number"
            min={1}
            className={INPUT}
            value={typeof values.chunkSize === 'string' ? values.chunkSize : '2'}
            onChange={(event) => setValue('chunkSize', event.target.value)}
          />
        </div>
      )}
    </div>
  );
}

/** Page groups for one document, following the chosen split mode. */
function splitGroups(mode: string, values: FieldValues, pageCount: number): number[][] {
  if (mode === 'each') return Array.from({ length: pageCount }, (_, i) => [i]);

  if (mode === 'fixed') {
    const size = Math.max(1, parseInt(str(values.chunkSize) || '2', 10) || 1);
    const groups: number[][] = [];
    for (let i = 0; i < pageCount; i += size) {
      groups.push(Array.from({ length: Math.min(size, pageCount - i) }, (_, k) => i + k));
    }
    return groups;
  }

  const expr = str(values.rangeInput);
  return expr.trim()
    ? parseRangeGroups(expr, pageCount)
    : Array.from({ length: pageCount }, (_, i) => [i]);
}

export const splitTool: ToolImpl = {
  Panel: SplitPanel,

  async run({ files, values, setProgress, setStatus }) {
    const mode = str(values.splitMode) || 'ranges';
    const mergeRanges = values.mergeRanges === true;
    const results: ResultFile[] = [];

    for (const file of files) {
      setStatus(`Splitting ${file.name}…`);
      const src = await loadPdf(await bytesFor(file));
      const count = src.getPageCount();
      const base = baseName(file.name);
      const groups = splitGroups(mode, values, count);
      /* "Merge all ranges in one PDF file" folds every chunk into one output. */
      const chunks = mergeRanges && groups.length > 1 ? [groups.flat()] : groups;

      for (let g = 0; g < chunks.length; g++) {
        const out = await PDFDocument.create();
        const pages = await out.copyPages(src, chunks[g]);
        for (const page of pages) out.addPage(page);
        const bytes = await out.save();
        const suffix = chunks.length > 1 ? `_page_${g + 1}` : '_split';
        results.push(pdfResult(bytes, `${base}${suffix}.pdf`));
        setProgress(((g + 1) / chunks.length) * 100);
      }
    }

    return results;
  },
};
