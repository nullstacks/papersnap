/**
 * The tool page: upload area, file cards, sidebar settings and the process CTA.
 *
 * Layout mirrors the reference exactly. Without files the sidebar is hidden and
 * a large centred upload button is shown; once files exist the sidebar takes a
 * 300px column, the uploader shrinks into the floating side rail and the red CTA
 * appears bottom-right. After a run, the download screen replaces the workspace.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALL_TOOL_BY_SLUG as TOOL_BY_SLUG } from '@/content/tools';
import { loadImplementation } from '@/tools/registry';
import { downloadBlob, prettySize } from '@/lib/pdf';
import type { FieldValues, ResultFile, ToolImpl, WorkFile } from '@/types';
import { FileCard } from './FileCard';
import { FileZoom } from './FileZoom';
import { DropZone, isExternalFileDrag } from './DropZone';
import { Uploader } from './Uploader';
import { ProcessButton } from './ProcessButton';
import { ProgressOverlay } from './ProgressOverlay';
import { ResultPage } from './ResultPage';
import { PreviewDialog } from './PreviewDialog';
import { describeFile, fileAccepted, reorder } from './fileUtils';
import { SortIcon } from './Icons';
import { isImageTool } from '@/lib/accent';
import { Footer } from './Footer';

export function ToolPage({ slug }: { slug: string }) {
  const tool = TOOL_BY_SLUG[slug];

  /*
   * Keep the browser tab in step with the page. Without this every tool shared
   * the landing page's title, which made a tab strip full of tools read as one
   * long duplicated entry.
   */
  useEffect(() => {
    const previous = document.title;
    if (tool) document.title = `${tool.title} — PaperSnap`;
    return () => {
      document.title = previous;
    };
  }, [tool]);

  const [impl, setImpl] = useState<ToolImpl | null>(null);
  const [files, setFiles] = useState<WorkFile[]>([]);
  const [values, setValues] = useState<FieldValues>({});
  const [results, setResults] = useState<ResultFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('Working…');
  const [percent, setPercent] = useState(0);
  const [dragging, setDragging] = useState(-1);
  const [dragOver, setDragOver] = useState(-1);
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState<ResultFile | null>(null);
  const [zoomed, setZoomed] = useState<WorkFile | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const dragFrom = useRef(-1);

  /*
   * The engine is a large async chunk, so the implementation arrives after the
   * first paint. Reset every piece of per-tool state alongside it so navigating
   * between tools never leaks the previous tool's files or options.
   */
  useEffect(() => {
    let active = true;
    setImpl(null);
    setFiles([]);
    setValues({});
    setResults(null);
    setBusy(false);
    setError(null);
    setPreview(null);
    seq.current = 0;

    void loadImplementation(slug).then((loaded) => {
      if (active) setImpl(loaded);
    });

    return () => {
      active = false;
    };
  }, [slug]);

  const addFiles = useCallback(
    async (incoming: File[]) => {
      if (!tool) return;
      const accepted = incoming.filter((f) => fileAccepted(f, tool.accept));
      if (!accepted.length) return;

      setResults(null);
      setError(null);

      /* Show the cards immediately, then fill in covers as they render. */
      const placeholders: WorkFile[] = accepted.map((file) => ({
        id: ++seq.current,
        file,
        name: file.name || 'document',
        size: file.size,
        rotation: 0,
        pages: null,
      }));
      setFiles((cur) => [...cur, ...placeholders]);

      for (const entry of placeholders) {
        const described = await describeFile(entry.file, entry.id);
        setFiles((cur) => cur.map((f) => (f.id === entry.id ? described : f)));
      }
    },
    [tool],
  );

  const removeFile = (id: number) => {
    setResults(null);
    setFiles((cur) => cur.filter((f) => f.id !== id));
  };

  const rotateFile = (id: number) => {
    setResults(null);
    setFiles((cur) =>
      cur.map((f) => (f.id === id ? { ...f, rotation: (f.rotation + 90) % 360 } : f)),
    );
  };

  const setValue = useCallback((name: string, value: string | boolean | null) => {
    setValues((cur) => ({ ...cur, [name]: value }));
  }, []);

  /* A no-op state bump so panels can ask for readiness to be re-evaluated. */
  const [tick, forceTick] = useState(0);
  const requestUpdate = useCallback(() => forceTick((n) => n + 1), []);

  /*
   * A drag can end without ever reaching this area's own handlers: released
   * outside the window, cancelled with Escape, or consumed by a child that
   * stopped propagation. Any of those would otherwise leave the outline lit, so
   * the gesture's own end events clear it too.
   */
  useEffect(() => {
    const clear = () => setOver(false);
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
      window.removeEventListener('blur', clear);
    };
  }, []);

  const sortByName = () =>
    setFiles((cur) =>
      cur.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    );

  /*
   * `tick` is a dependency on purpose: panels mutate WorkFile objects in place
   * (the rotate tool queues `rotation` on them) and call requestUpdate(). The
   * files array keeps its identity across that mutation, so without the tick
   * the gate would never re-run and the CTA would stay disabled.
   */
  const ready = useMemo(() => {
    if (!impl) return false;
    /* Form-driven tools have no files at all, so the count gate cannot apply to
       them — their own isReady is the whole readiness test. */
    if (tool?.accept && files.length < Math.max(1, tool.min ?? 1)) return false;
    if (impl.isReady) return impl.isReady({ files, values });
    return true;
  }, [impl, tool, files, values, tick]);

  const run = async () => {
    if (!impl || !ready || busy) return;
    setBusy(true);
    setError(null);
    setPercent(0);
    setStage(`${tool?.action ?? 'Working'}…`);

    /* Let the overlay paint before the first synchronous page of work. */
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

    const startedAt = performance.now();
    try {
      const out = await impl.run({
        files,
        values,
        setProgress: (p) => setPercent(p),
        setStatus: (t) => setStage(t),
      });

      /* Hold a very fast job on screen briefly so the state change is legible. */
      const elapsed = performance.now() - startedAt;
      if (elapsed < 450) await new Promise((r) => setTimeout(r, 450 - elapsed));
      setPercent(100);

      setResults(out.filter((r): r is ResultFile => Boolean(r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong while processing your file.');
    } finally {
      setBusy(false);
    }
  };

  /*
   * Start over returns the page to its pristine state: no files, no options, no
   * results. Re-uploading is the point - a visitor who is done with a batch
   * should not have to remove each card by hand.
   */
  const startOver = () => {
    setResults(null);
    setFiles([]);
    setValues({});
    setError(null);
    setPreview(null);
    setPercent(0);
    setStage('Working...');
    seq.current = 0;
  };

  const downloadAll = () => {
    if (!results?.length) return;
    if (results.length === 1) {
      downloadBlob(results[0].blob, results[0].name);
      return;
    }
    /* Stagger so browsers do not block the burst of downloads. */
    results.forEach((r, i) => setTimeout(() => downloadBlob(r.blob, r.name), i * 350));
  };

  if (!tool) {
    return (
      <div className="flex h-[calc(100vh-60px)] items-center justify-center text-muted">
        Unknown tool: {slug}
      </div>
    );
  }

  const hasFiles = files.length > 0;
  const inputBytes = files.reduce((sum, f) => sum + f.size, 0);
  const family: 'pdf' | 'image' = isImageTool(slug) ? 'image' : 'pdf';
  /*
   * Form-driven tools (HTML to PDF, HTML to image) take their input as markup or
   * a URL rather than as dropped files. Their panel is rendered in the work area
   * at a readable width instead of the narrow sidebar, but they still need the
   * CTA, so this flag joins the file count in that one condition.
   */
  const formDriven = !tool.accept;

  /* ---------- result screen ---------- */
  if (results && results.length) {
    return (
      <div className="h-[calc(100vh-60px)] overflow-y-auto bg-canvas">
        <ResultPage
          slug={slug}
          family={family}
          results={results}
          inputBytes={inputBytes}
          onDownloadOne={(r) => downloadBlob(r.blob, r.name)}
          onDownloadAll={downloadAll}
          onBack={() => setResults(null)}
          onStartOver={startOver}
          onPreview={setPreview}
        />
        <Footer />
        {preview && <PreviewDialog result={preview} onClose={() => setPreview(null)} />}
      </div>
    );
  }

  const Panel = impl?.Panel;

  return (
    <div className="flex h-[calc(100vh-60px)] flex-col lg:flex-row lg:items-stretch">
      {/* ------------------------------------------------------- work area */}
      <div
        className={`relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-canvas text-center transition-colors ${
          over
            ? family === 'image'
              ? 'outline-3 -outline-offset-[14px] outline-dashed outline-img'
              : 'outline-3 -outline-offset-[14px] outline-dashed outline-brand'
            : ''
        }`}
        /*
         * The highlight is for files arriving from outside the browser, which is
         * also the only case this area handles. Reordering a card is a drag too,
         * but FileCard calls stopPropagation() on its own drop, so the clearing
         * handler here never ran and the dashed outline stayed on screen until a
         * refresh. Requiring real files fixes that at the source, and the
         * window-level listeners below catch a gesture that ends off-target.
         */
        onDragOver={(e) => {
          if (!isExternalFileDrag(e)) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const dropped = Array.from(e.dataTransfer.files ?? []);
          if (dropped.length) void addFiles(dropped);
        }}
        data-testid="workarea"
      >
        <div className="px-4 pt-4 pb-40 sm:p-6">
          {!hasFiles && (
            <div className="mx-auto mb-6 max-w-[860px] pt-1.5 pb-7">
              <h1 className="text-[28px] leading-[36px] font-semibold text-ink-2 sm:text-[34px] sm:leading-[44px] lg:text-[42px] lg:leading-[52px]">
                {tool.h1}
              </h1>
              <h2 className="mx-auto mt-2 max-w-[800px] text-[16px] leading-6 font-normal text-body sm:text-[18px] sm:leading-7 lg:text-[22px] lg:leading-8">
                {tool.sub}
              </h2>
            </div>
          )}

          {!hasFiles && tool.accept && (
            <Uploader
              compact={false}
              count={0}
              label={
                tool.accept === 'image/*'
                  ? 'Select images'
                  : tool.accept === 'application/pdf'
                    ? 'Select PDF files'
                    : 'Select files'
              }
              title="Select files"
              dropLabel={tool.accept === 'image/*' ? 'or drop images here' : 'or drop files here'}
              accept={tool.accept}
              multiple={tool.multiple}
              family={family}
              onFiles={addFiles}
            />
          )}

          {/* Compact uploader rail, shown only once files exist.
              Desktop: floats to the right of the sidebar as on the reference.
              Mobile: an inline row above the cards, with the settings gear
              first — matching the reference's own phone layout. */}
          {/*
            Work-area tools (crop, the photo editor, blur) fill the canvas, so the
            file rail is suppressed there — but a phone still needs a way into the
            settings sheet, which is what this one button is for.
          */}
          {hasFiles && impl?.Workarea && (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              title="Options"
              aria-label="Open settings"
              className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border-0 bg-surface text-ink shadow-btn hover:bg-canvas lg:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M24 14.187V9.813c-2.148-.766-2.726-.802-3.027-1.53s.083-1.17 1.06-3.223L18.94 1.968c-2.026.963-2.488 1.364-3.224 1.06-.727-.302-.768-.89-1.527-3.027H9.813c-.764 2.144-.8 2.725-1.53 3.027-.752.313-1.203-.1-3.223-1.06L1.968 5.06c.977 2.055 1.362 2.493 1.06 3.224S2.146 9.05 0 9.813v4.375c2.14.76 2.725.8 3.027 1.528.304.734-.08 1.167-1.06 3.223l3.093 3.093c2-.95 2.47-1.373 3.223-1.06.728.302.764.88 1.53 3.027h4.374c.758-2.13.8-2.723 1.537-3.03.745-.308 1.186.1 3.215 1.062l3.093-3.093c-.975-2.05-1.362-2.492-1.06-3.223.3-.726.88-.763 3.027-1.528zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
              </svg>
            </button>
          )}

          {hasFiles && !impl?.Workarea && (
            <div className="mb-3 flex items-center justify-center gap-2 lg:fixed lg:top-[120px] lg:right-[324px] lg:z-20 lg:mb-0 lg:flex-col">
              {/* Settings gear: mobile only, since the sidebar becomes a sheet. */}
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                title="Options"
                aria-label="Open settings"
                className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-surface text-ink shadow-btn hover:bg-canvas lg:hidden"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M24 14.187V9.813c-2.148-.766-2.726-.802-3.027-1.53s.083-1.17 1.06-3.223L18.94 1.968c-2.026.963-2.488 1.364-3.224 1.06-.727-.302-.768-.89-1.527-3.027H9.813c-.764 2.144-.8 2.725-1.53 3.027-.752.313-1.203-.1-3.223-1.06L1.968 5.06c.977 2.055 1.362 2.493 1.06 3.224S2.146 9.05 0 9.813v4.375c2.14.76 2.725.8 3.027 1.528.304.734-.08 1.167-1.06 3.223l3.093 3.093c2-.95 2.47-1.373 3.223-1.06.728.302.764.88 1.53 3.027h4.374c.758-2.13.8-2.723 1.537-3.03.745-.308 1.186.1 3.215 1.062l3.093-3.093c-.975-2.05-1.362-2.492-1.06-3.223.3-.726.88-.763 3.027-1.528zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
                </svg>
              </button>
              <Uploader
                compact
                count={files.length}
                label="Add more files"
                title="Add more files"
                dropLabel=""
                accept={tool.accept}
                multiple={tool.multiple}
                family={family}
                onFiles={addFiles}
              />
              {files.length > 1 && (
                <button
                  type="button"
                  onClick={sortByName}
                  title="Sort by name"
                  aria-label="Sort by name"
                  className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-surface text-ink shadow-btn hover:bg-canvas"
                >
                  <SortIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          )}

          {hasFiles && !impl?.Workarea && (
            /*
             * The reference stacks cards in a single centred column on a phone
             * and wraps them side by side from tablet width up.
             */
            <div className="grid grid-cols-2 justify-items-center gap-3 pt-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-0">
              {files.map((entry, index) => (
                <FileCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  dragging={dragging === index}
                  dropTarget={dragOver === index && dragging !== index}
                  onRotate={rotateFile}
                  onRemove={removeFile}
                  onZoom={setZoomed}
                  onDragStart={(i) => {
                    if (i >= 0) {
                      dragFrom.current = i;
                      setDragging(i);
                    } else {
                      setDragging(-1);
                      setDragOver(-1);
                    }
                  }}
                  onDropOn={(to) => {
                    const from = dragFrom.current;
                    dragFrom.current = -1;
                    setDragging(-1);
                    setDragOver(-1);
                    if (from >= 0) setFiles((cur) => reorder(cur, from, to));
                  }}
                  onDragOverIndex={() => setDragOver(index)}
                />
              ))}
            </div>
          )}

          {/*
           * Tool content that belongs on the canvas rather than in the sidebar
           * — page-picking grids for Remove/Extract/Split. The file cards are
           * hidden in that case: the pages themselves become the subject.
           */}
          {hasFiles && impl?.Workarea && (
            <div className="w-full" data-testid="workarea-tool">
              <WorkareaSlot
                impl={impl}
                files={files}
                values={values}
                setValue={setValue}
                requestUpdate={requestUpdate}
              />
            </div>
          )}

          {/* Drag-to-reorder hint, only where order matters. */}
          {hasFiles && files.length > 1 && !impl?.Workarea && (
            <p className="mt-4 text-[13px] text-muted">
              Drag a file to change its position.
            </p>
          )}

          {/* Form-driven tools (HTML to PDF) render their input here. */}
          {!tool.accept && impl && (
            <div className="mx-auto mt-2 max-w-[640px] text-left">
              <FormHost slug={slug} impl={impl} files={files} values={values} setValue={setValue} requestUpdate={requestUpdate} />
            </div>
          )}

          {hasFiles && files.length === 1 && !impl?.Workarea && (
            <div className="mt-2 text-sm text-muted">
              {/* Image tools describe the picture by its pixels; PDF tools by
                  its page count. Both then show the file size. */}
              {files[0].width && files[0].height
                ? `${files[0].width} x ${files[0].height} · `
                : files[0].pages
                  ? `${files[0].pages} page${files[0].pages === 1 ? '' : 's'} · `
                  : ''}
              {prettySize(files[0].size)}
            </div>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------- sidebar */}
      {/*
       * Desktop: a fixed-width column beside the work area.
       * Mobile: the reference turns this into a full-height slide-in sheet that
       * covers most of the screen behind a scrim, opened from the gear. We use
       * a bottom sheet — the same content, but easier to reach one-handed.
       */}
      {hasFiles && (
        <>
          {/* Scrim (mobile only) */}
          {sheetOpen && (
            <button
              type="button"
              aria-label="Close settings"
              onClick={() => setSheetOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            />
          )}
          <aside
            className={`tool-sidebar max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:max-h-[78vh] max-lg:shrink-0 max-lg:rounded-t-2xl max-lg:border-t max-lg:border-l-0 max-lg:border-line max-lg:shadow-[0_-8px_30px_rgba(0,0,0,0.22)] max-lg:transition-transform max-lg:duration-200 ${
              sheetOpen ? 'max-lg:translate-y-0' : 'max-lg:translate-y-full'
            }`}
            data-testid="sidebar"
            aria-hidden={!sheetOpen ? undefined : false}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-black/20 bg-surface py-3 lg:justify-center">
              <h2 className="px-4 text-[18px] leading-[26px] font-semibold text-ink-2 lg:px-0 lg:text-[22px] lg:leading-[30px]">
                {tool.panelTitle ?? tool.title}
              </h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Hide settings"
                className="mr-3 flex h-8 w-8 items-center justify-center rounded-full border-0 bg-canvas text-ink-2 hover:bg-subtle lg:hidden"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {Panel ? (
              /*
               * Panels supply their own controls but not the column padding, so
               * the shell owns it — that keeps every tool's content aligned to
               * the same 16px gutter instead of each panel guessing.
               */
              <div className="px-4 pt-3 pb-24 lg:pb-2" data-testid="panel">
                <Panel files={files} values={values} setValue={setValue} requestUpdate={requestUpdate} />
              </div>
            ) : null}

            {error && (
              <div className="mx-4 mt-3 rounded-lg border border-warn bg-brand-soft px-3 py-2 text-left text-[13px] leading-5 text-ink">
                {error}
              </div>
            )}
          </aside>
        </>
      )}

      {(hasFiles || formDriven) && (
        <ProcessButton
          label={tool.action}
          disabled={!ready}
          busy={busy}
          onClick={run}
          /*
           * 252px, not the reference's 330: its options column is 380px wide and
           * ours is 300px, so a 330px CTA hung past the sidebar edge and looked
           * like a layout bug.
           */
          width={252}
          family={family}
        />
      )}

      {busy && <ProgressOverlay stage={stage} percent={percent} />}
      {preview && <PreviewDialog result={preview} onClose={() => setPreview(null)} />}
      {zoomed && <FileZoom entry={zoomed} onClose={() => setZoomed(null)} />}
      {tool.accept && (
        <DropZone
          onFiles={addFiles}
          disabled={busy}
          message={`Drop it like it's hot`}
        />
      )}
    </div>
  );
}

/**
 * Renders a tool's optional work-area content.
 * Kept separate so the main render stays readable.
 */
function WorkareaSlot({
  impl,
  ...props
}: {
  impl: ToolImpl;
  files: WorkFile[];
  values: FieldValues;
  setValue: (name: string, value: string | boolean | null) => void;
  requestUpdate: () => void;
}) {
  const Slot = impl.Workarea;
  return Slot ? <Slot {...props} /> : null;
}

/**
 * Renders a tool's Panel for form-driven tools, which have no file slots.
 * Kept separate so the main work area stays readable.
 */
function FormHost({
  impl,
  ...props
}: {
  slug: string;
  impl: ToolImpl;
  files: WorkFile[];
  values: FieldValues;
  setValue: (name: string, value: string | boolean | null) => void;
  requestUpdate: () => void;
}) {
  const Panel = impl.Panel;
  return <Panel {...props} />;
}