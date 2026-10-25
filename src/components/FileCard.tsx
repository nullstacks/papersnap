/**
 * One file card in the work area.
 *
 * Matches the reference card exactly:
 *  - 198x244 tile, 8px radius, soft shadow, white cover
 *  - a hover pill of round actions (zoom / rotate / remove) at the top-right
 *  - a "27.65 MB - 349 pages" dark tooltip above the card on hover
 *  - the file name centred in a 32px footer strip
 *
 * The card is also the drag handle: dropping it on a sibling reorders the list.
 */
import { useState, type DragEvent } from 'react';
import { CloseIcon, RotateGlyphIcon, ZoomIcon } from './Icons';
import type { WorkFile } from '@/types';
import { prettySize } from '@/lib/format';

interface Props {
  entry: WorkFile;
  index: number;
  onRotate: (id: number) => void;
  onRemove: (id: number) => void;
  onZoom: (entry: WorkFile) => void;
  onDragStart: (index: number) => void;
  onDropOn: (index: number) => void;
  /** True while this card is the one being dragged. */
  dragging: boolean;
  /** True while another card is hovering over this one. */
  dropTarget: boolean;
  /** Reports this card's index while a sibling hovers it. */
  onDragOverIndex: () => void;
}

export function FileCard({
  entry,
  index,
  onRotate,
  onRemove,
  onZoom,
  onDragStart,
  onDropOn,
  dragging,
  dropTarget,
  onDragOverIndex,
}: Props) {
  const [hovered, setHovered] = useState(false);

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move';
    /* Firefox needs payload data before a drag will start. */
    e.dataTransfer.setData('text/plain', String(index));
    onDragStart(index);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onDropOn(index);
  };

  /* "27.65 MB - 349 pages", the summary the reference shows on hover. */
  const meta = [prettySize(entry.size), entry.pages ? `${entry.pages} pages` : null]
    .filter(Boolean)
    .join(' - ');

  return (
    <div
      className={`file-card group ${dragging ? 'opacity-40' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={() => onDragStart(-1)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverIndex();
      }}
      onDrop={handleDrop}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid="file-card"
    >
      {/*
       * Reorder affordances. A soft ring marks the hovered drop target and an
       * insertion bar shows which side the card would land on, so it is obvious
       * where the file will go before releasing.
       */}
      {dropTarget && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-brand ring-inset"
          />
          <span
            aria-hidden="true"
            className="absolute top-2 bottom-2 -left-1.5 w-[3px] rounded-full bg-brand"
          />
        </>
      )}

      {/* Drag handle: hints that the card itself is draggable. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-2 left-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-subtle text-muted transition-opacity ${
          hovered && !dragging ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.7" />
          <circle cx="15" cy="6" r="1.7" />
          <circle cx="9" cy="12" r="1.7" />
          <circle cx="15" cy="12" r="1.7" />
          <circle cx="9" cy="18" r="1.7" />
          <circle cx="15" cy="18" r="1.7" />
        </svg>
      </span>

      {/* Hover tooltip: size and page count. Anchored above the card and kept
          clear of the header bar so it is never clipped. */}
      <div
        className={`pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded bg-body px-2.5 py-1.5 text-[13px] leading-none font-medium text-white transition-opacity duration-150 ${
          hovered ? 'opacity-100' : 'opacity-0'
        }`}
        role="tooltip"
      >
        {meta}
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-body"
        />
      </div>

      {/* Action pill: zoom / rotate / remove. Sits over the cover's top-right
          corner, which is empty space inside the card. */}
      <div className="file-actions absolute top-2.5 right-2.5 z-20 flex">
        <button
          type="button"
          title="View"
          aria-label={`View ${entry.name}`}
          onClick={() => onZoom(entry)}
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border-0 bg-subtle p-[5px] text-brand shadow-chip transition-colors hover:bg-brand hover:text-white"
        >
          <ZoomIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Rotate"
          aria-label={`Rotate ${entry.name}`}
          onClick={() => onRotate(entry.id)}
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border-0 bg-subtle p-[5px] text-brand shadow-chip transition-colors hover:bg-brand hover:text-white"
        >
          <RotateGlyphIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Remove"
          aria-label={`Remove ${entry.name}`}
          onClick={() => onRemove(entry.id)}
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border-0 bg-subtle p-[5px] text-ink-2 shadow-chip transition-colors hover:bg-brand hover:text-white"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {/*
       * Cover area. A fixed height keeps every card aligned whatever the
       * page's aspect ratio, and the name strip below is a real row rather than
       * an overlay, so it never covers the artwork.
       */}
      <div className="flex h-[178px] w-full items-center justify-center overflow-hidden">
        <div
          className="flex items-center justify-center transition-transform duration-200"
          style={{ transform: entry.rotation ? `rotate(${entry.rotation}deg)` : undefined }}
        >
          {entry.thumb ? (
            /*
             * The thumbnail is inert on purpose. Left draggable it starts a
             * NATIVE image drag, which publishes "Files" in dataTransfer - the
             * exact signature the global DropZone listens for - so dragging a
             * card flashed "Drop it like it is hot" and on release tried to
             * re-upload the preview. The card itself is the drag handle; the
             * cover must not be a second, competing one.
             */
            <img
              src={entry.thumb}
              alt=""
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              className="pointer-events-none max-h-[178px] max-w-[150px] bg-white shadow-[0_0_5px_2px_rgba(0,0,0,0.1)]"
            />
          ) : (
            /*
             * A file the engine could not read used to show a bare "!" and
             * nothing else, which told the visitor neither what went wrong nor
             * what to do about it — and the usual cause is simply a format the
             * browser cannot decode. The reason now sits on the card itself,
             * matching the message the tool surfaces when it refuses to run.
             */
            <div
              className={`flex h-[178px] w-[127px] flex-col items-center justify-center gap-1.5 rounded bg-canvas px-2 text-center ${
                entry.error ? 'text-brand' : 'text-muted'
              }`}
            >
              {entry.error ? (
                <>
                  <span className="text-lg leading-none font-bold">!</span>
                  <span className="text-[11px] leading-[14px] font-normal normal-case tracking-normal text-brand">
                    {entry.error}
                  </span>
                </>
              ) : (
                <span className="text-xs font-bold tracking-widest">
                  {(entry.name.split('.').pop() || 'file').toUpperCase()}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="w-full shrink-0 pb-2">
        <span className="file-name text-body" title={entry.name}>
          {entry.name}
        </span>
        {/* Image files also carry their pixel size, matching the reference's
            "1600 x 1200" line under the name. */}
        {entry.width && entry.height ? (
          <span className="file-name -mt-1 block text-muted">
            {entry.width} x {entry.height}
          </span>
        ) : null}
      </div>
    </div>
  );
}