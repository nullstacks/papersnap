/**
 * Full-work-area drop target shown while files are dragged in from outside the
 * browser.
 *
 * The reference dims the whole work area to 85% black and centres one white
 * line of copy — no dashed border, no icon.
 *
 * Only genuine external drops trigger this. Reordering a card carries
 * `text/plain` (never `Files`), so dragging within the page never flashes the
 * overlay.
 */
import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Called with the dropped files. */
  onFiles: (files: File[]) => void;
  message?: string;
  /** Suppress the overlay (e.g. while a job is running). */
  disabled?: boolean;
}

/**
 * True only for a drag originating outside the page.
 *
 * `types` lists what the drag carries. Internal card drags publish
 * `text/plain`, and an OS file drag publishes `Files`. Requiring `Files` and
 * rejecting `text/plain` keeps the two gestures apart.
 */
/**
 * Exported because the work area needs the same test: it must highlight only
 * for a drag that carries real files, never for an internal card reorder.
 */
export function isExternalFileDrag(e: DragEvent | React.DragEvent): boolean {
  const types = Array.from(e.dataTransfer?.types ?? []);
  return types.includes('Files');
}

export function DropZone({ onFiles, message = "Drop it like it's hot", disabled }: Props) {
  const [active, setActive] = useState(false);
  /*
   * dragenter/dragleave fire for every descendant, so a plain boolean flickers
   * as the pointer crosses child elements. Counting enters against leaves keeps
   * the overlay stable while inside the window.
   */
  const depth = useRef(0);

  useEffect(() => {
    if (disabled) {
      setActive(false);
      return;
    }

    const reset = () => {
      depth.current = 0;
      setActive(false);
    };

    const onEnter = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      depth.current += 1;
      setActive(true);
    };

    const onOver = (e: DragEvent) => {
      /* Always prevent default over the page, or the browser navigates to the
         dropped file. The overlay is only shown for external file drags. */
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const onLeave = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      /*
       * Leaving the window reports no relatedTarget and can skip the matching
       * dragleave, which would strand the overlay on screen. Treat that as an
       * immediate reset.
       */
      if (!e.relatedTarget) {
        reset();
        return;
      }
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };

    const onDrop = (e: DragEvent) => {
      if (!isExternalFileDrag(e)) return;
      e.preventDefault();
      reset();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) onFiles(files);
    };

    /* A cancelled drag (Escape) or a blurred window ends the gesture too. */
    const onEnd = () => reset();

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragend', onEnd);
    window.addEventListener('blur', onEnd);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', onEnd);
      window.removeEventListener('blur', onEnd);
    };
  }, [onFiles, disabled]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[60px] bottom-0 z-[90] flex items-center justify-center bg-[rgba(22,22,22,0.85)] px-6"
      data-testid="dropzone"
      aria-hidden="true"
    >
      <span className="text-center text-[26px] leading-tight font-semibold text-white sm:text-[34px] md:text-[38px]">
        {message}
      </span>
    </div>
  );
}
