/*
 * Page-set tools: removing pages and extracting pages into a new document.
 *
 * Both follow the reference's layout: the page thumbnails fill the main work
 * area and the sidebar holds only the summary and any range override. Selection
 * is per-page with shift-click range support.
 */
import { PDFDocument, baseName, bytesFor, loadPdf, parseRanges, pdfResult } from '@/lib/pdf';
import { PageGrid, parseSelection, serializeSelection } from '@/components/PageGrid';
import { PAGE_SELECTION_KEY } from '@/types';
import type { PanelProps, ResultFile, ToolImpl, WorkareaProps, WorkFile } from '@/types';

function str(value: string | boolean | null): string {
  return typeof value === 'string' ? value : '';
}

/** Parse a range expression, returning [] instead of throwing on bad input. */
function rangeList(text: string, pageCount: number): number[] {
  const raw = text.trim();
  if (!raw) return [];
  try {
    return parseRanges(raw, pageCount);
  } catch {
    return [];
  }
}

/*
 * Shift-click range selection needs the anchor from the previous click. It is
 * per-panel state rather than a value: it is interaction detail, not an option
 * the tool needs when it runs.
 */
import { useRef } from 'react';

function usePageSelection(
  values: PanelProps['values'],
  setValue: PanelProps['setValue'],
) {
  const anchor = useRef<number | null>(null);
  const selected = parseSelection(values[PAGE_SELECTION_KEY]);

  const toggle = (index: number, shiftKey: boolean) => {
    const next = new Set(selected);
    if (shiftKey && anchor.current !== null) {
      const from = Math.min(anchor.current, index);
      const to = Math.max(anchor.current, index);
      /* Range operations add rather than toggle, which is what a shift-click
         means in every file manager. */
      for (let i = from; i <= to; i++) next.add(i);
    } else if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    anchor.current = index;
    setValue(PAGE_SELECTION_KEY, serializeSelection(next));
  };

  const selectAll = (total: number) => {
    setValue(PAGE_SELECTION_KEY, serializeSelection(new Set(Array.from({ length: total }, (_, i) => i))));
  };

  const selectNone = () => {
    anchor.current = null;
    setValue(PAGE_SELECTION_KEY, '');
  };

  return { selected, toggle, selectAll, selectNone };
}

/* ============================= REMOVE PAGES ============================= */

function RemoveWorkarea({ files, values, setValue }: WorkareaProps) {
  const file = files[0];
  const { selected, toggle, selectAll, selectNone } = usePageSelection(values, setValue);
  if (!file) return null;
  const total = file.pages ?? 0;

  return (
    <PageGrid
      file={file}
      mode="remove"
      selected={selected}
      onToggle={toggle}
      onSelectAll={() => selectAll(total)}
      onSelectNone={selectNone}
    />
  );
}

function RemovePanel({ files, values, setValue }: PanelProps) {
  const file = files[0];
  const total = file?.pages ?? 0;
  const selected = parseSelection(values[PAGE_SELECTION_KEY]);
  const typed = rangeList(str(values.removePages), total || 1);
  const dropCount = new Set([...selected, ...typed]).size;
  const remaining = Math.max(0, total - dropCount);

  return (
    <div className="flex flex-col gap-4">
      <div className="info-box">
        Click pages in the document to mark them for removal. Hold shift to select
        a range.
      </div>

      <div className="flex flex-col gap-2">
        <label className="option-title" htmlFor="remove-pages">
          Pages to remove
        </label>
        <input
          id="remove-pages"
          className="h-9 w-full rounded border border-muted bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none"
          placeholder="e.g. 3-4,8"
          value={str(values.removePages)}
          onChange={(event) => setValue('removePages', event.target.value)}
        />
        <p className="text-[13px] leading-[18px] text-muted">
          Optional — type a range instead of clicking.
        </p>
      </div>

      <p className="text-[15px] text-ink-2">
        Total pages: <span className="font-medium">{total || '—'}</span>
      </p>

      <p className="text-sm leading-[18px] text-muted">
        {!total
          ? ''
          : dropCount
            ? `${dropCount} of ${total} pages will be removed, leaving ${remaining}.`
            : `All ${total} pages are kept.`}
      </p>
    </div>
  );
}

export const removePagesTool: ToolImpl = {
  Panel: RemovePanel,
  Workarea: RemoveWorkarea,

  async run({ files, values, setProgress, setStatus }) {
    const text = str(values.removePages).trim();
    const results: ResultFile[] = [];

    for (const file of files) {
      setStatus(`Removing pages from ${file.name}…`);
      const src = await loadPdf(await bytesFor(file));
      const count = src.getPageCount();
      const drop = new Set(rangeList(text, count));
      /* The grid describes the first document only, so clamp its indexes. */
      for (const index of parseSelection(values[PAGE_SELECTION_KEY])) {
        if (index < count) drop.add(index);
      }
      if (!drop.size) throw new Error('Choose the pages to remove first.');

      const keep: number[] = [];
      for (let i = 0; i < count; i++) if (!drop.has(i)) keep.push(i);
      if (!keep.length) throw new Error('Every page would be removed — keep at least one.');

      const out = await PDFDocument.create();
      const copies = await out.copyPages(src, keep);
      for (const page of copies) out.addPage(page);
      results.push(pdfResult(await out.save(), `${baseName(file.name)}_pages_removed.pdf`));
      setProgress((results.length / files.length) * 100);
    }

    return results;
  },
};

/* ============================ EXTRACT PAGES ============================ */

function ExtractWorkarea({ files, values, setValue }: WorkareaProps) {
  const file = files[0];
  const { selected, toggle, selectAll, selectNone } = usePageSelection(values, setValue);
  if (!file) return null;
  const total = file.pages ?? 0;

  return (
    <PageGrid
      file={file}
      mode="extract"
      selected={selected}
      onToggle={toggle}
      onSelectAll={() => selectAll(total)}
      onSelectNone={selectNone}
    />
  );
}

function ExtractPanel({ files, values, setValue }: PanelProps) {
  const file = files[0] as WorkFile | undefined;
  const total = file?.pages ?? 0;
  const selected = parseSelection(values[PAGE_SELECTION_KEY]);
  const typed = rangeList(str(values.extractPages), total || 1);
  const picked = new Set([...selected, ...typed]);
  const merge = values.mergeExtracted === true;

  return (
    <div className="flex flex-col gap-4">
      <div className="info-box">
        Select the pages you want. They are copied into a new document and the
        original is left untouched.
      </div>

      <div className="flex flex-col gap-2">
        <label className="option-title" htmlFor="extract-pages">
          Pages to extract
        </label>
        <input
          id="extract-pages"
          className="h-9 w-full rounded border border-muted bg-surface px-3 text-sm text-ink focus:border-ink focus:outline-none"
          placeholder="e.g. 1-3,7"
          value={str(values.extractPages)}
          onChange={(event) => setValue('extractPages', event.target.value)}
        />
        <p className="text-[13px] leading-[18px] text-muted">
          Optional — type a range instead of clicking.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-[22px] text-ink-2">
        <input
          type="checkbox"
          className="sr-only"
          checked={merge}
          onChange={(event) => setValue('mergeExtracted', event.target.checked)}
        />
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border bg-surface ${
            merge ? 'border-success' : 'border-muted'
          }`}
        >
          {merge && (
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="text-success-dark">
              <path d="M8.1 14.3 4 10.2l1.4-1.4 2.7 2.7 6.5-6.5L16 6.4z" />
            </svg>
          )}
        </span>
        <span>Merge selected pages into one PDF.</span>
      </label>

      <div className="info-box">
        {picked.size
          ? merge
            ? `${picked.size} page${picked.size === 1 ? '' : 's'} will be combined into 1 PDF.`
            : `${picked.size} page${picked.size === 1 ? '' : 's'} will become ${picked.size} separate PDF${picked.size === 1 ? '' : 's'}.`
          : 'Select at least one page to continue.'}
      </div>
    </div>
  );
}

export const extractPagesTool: ToolImpl = {
  Panel: ExtractPanel,
  Workarea: ExtractWorkarea,

  isReady: ({ values }) => {
    const selected = parseSelection(values[PAGE_SELECTION_KEY]);
    return selected.size > 0 || str(values.extractPages).trim().length > 0;
  },

  async run({ files, values, setProgress, setStatus }) {
    const text = str(values.extractPages).trim();
    const merge = values.mergeExtracted === true;
    const results: ResultFile[] = [];

    for (const file of files) {
      setStatus(`Extracting pages from ${file.name}…`);
      const src = await loadPdf(await bytesFor(file));
      const count = src.getPageCount();

      const picked = new Set(rangeList(text, count));
      for (const index of parseSelection(values[PAGE_SELECTION_KEY])) {
        if (index < count) picked.add(index);
      }
      const ordered = [...picked].sort((a, b) => a - b);
      if (!ordered.length) throw new Error('Select the pages you want to extract.');

      if (merge) {
        const out = await PDFDocument.create();
        const copies = await out.copyPages(src, ordered);
        for (const page of copies) out.addPage(page);
        results.push(pdfResult(await out.save(), `${baseName(file.name)}_extracted.pdf`));
      } else {
        /* One file per page, named by its original page number. */
        for (const index of ordered) {
          const out = await PDFDocument.create();
          const [copy] = await out.copyPages(src, [index]);
          out.addPage(copy);
          results.push(
            pdfResult(await out.save(), `${baseName(file.name)}_page_${index + 1}.pdf`),
          );
        }
      }
      setProgress((results.length / Math.max(1, files.length)) * 100);
    }

    return results;
  },
};
