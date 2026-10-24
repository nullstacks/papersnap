/**
 * The primary file picker.
 *
 * Two states, matching the reference exactly:
 *  - empty: a large centred red button with a drop hint beneath it
 *  - with files: a compact round "+" in the floating side rail, with a count
 *    badge and a hover label
 */
import { useRef } from 'react';
import { ICONS } from './Icons';

interface Props {
  compact: boolean;
  count: number;
  label: string;
  title: string;
  dropLabel: string;
  accept: string;
  multiple: boolean;
  onFiles: (files: File[]) => void;
  /** 'image' swaps the red picker for iLoveIMG's blue one. */
  family?: 'pdf' | 'image';
}

export function Uploader({
  compact,
  count,
  label,
  title,
  dropLabel,
  accept,
  multiple,
  onFiles,
  family = 'pdf',
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const solid = family === 'image' ? 'bg-img hover:bg-img-dark' : 'bg-brand hover:bg-brand-dark';

  const pick = () => inputRef.current?.click();

  return (
    <>
      {/*
       * The input is visually hidden and driven by the button below, so it needs
       * its own accessible name — axe reports an unlabelled file input as
       * critical otherwise, and a screen reader would announce "button" twice.
       */}
      <input
        ref={inputRef}
        type="file"
        id="fileInput"
        className="sr-only"
        aria-label={title}
        multiple={multiple}
        accept={accept}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          /* Reset so picking the same file twice still fires a change. */
          e.target.value = '';
        }}
      />

      {compact ? (
        /*
         * The count badge sits on the button's top-left corner. It is anchored
         * with explicit offsets rather than a transform: a transformed
         * absolutely-positioned box resolves against its static position, which
         * left the badge half-clipped by the column edge.
         */
        <div className="relative">
          <span
            className="pointer-events-none absolute -top-1.5 -left-1.5 z-10 grid h-[20px] min-w-[20px] place-items-center rounded-full border-2 border-brand bg-[#161616] px-[3px] text-[11px] font-semibold text-white tabular-nums"
            style={{ lineHeight: 1 }}
            aria-hidden="true"
          >
            {count > 99 ? '99+' : count}
          </span>
          <button
            type="button"
            onClick={pick}
            title={title}
            aria-label={`${title} (${count} selected)`}
            className={`group relative flex h-[42px] w-[42px] items-center justify-center rounded-full border-0 shadow-btn ${solid}`}
          >
            <img src={ICONS.plus} alt="" aria-hidden="true" className="h-5 w-5" />
            <span className="pointer-events-none absolute top-1/2 right-[calc(100%+10px)] -translate-y-1/2 rounded bg-body px-2.5 py-2 text-[13px] leading-none font-medium whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              Add more files
            </span>
          </button>
        </div>
      ) : (
        <div className="relative mx-auto mb-20 flex flex-col items-center">
          <button
            type="button"
            onClick={pick}
            className={`inline-flex max-w-[60vw] items-center justify-center rounded-xl border-0 px-12 py-6 text-[24px] leading-7 font-medium text-white shadow-btn transition-colors ${solid}`}
            style={{ minHeight: 80, minWidth: 330 }}
          >
            {label}
          </button>
          <div className="mt-3 text-sm text-body">{dropLabel}</div>
        </div>
      )}
    </>
  );
}
