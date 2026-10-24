/**
 * The red "process" button pinned to the bottom-right corner of the work area.
 *
 * Fixed at 24px from the viewport edges and 252px wide inside the tool layout,
 * with a 12px radius and a soft shadow — the reference CTA exactly.
 */
import { ICONS } from './Icons';

interface Props {
  label: string;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
  width: number;
  /** 'image' paints the CTA iLoveIMG blue instead of the PDF red. */
  family?: 'pdf' | 'image';
}

export function ProcessButton({ label, disabled, busy, onClick, width, family = 'pdf' }: Props) {
  return (
    <button
      type="button"
      id="processTask"
      onClick={onClick}
      disabled={disabled || busy}
      /* Desktop keeps the reference's fixed 252px CTA; on phones it becomes a
         comfortable full-width target pinned above the safe area. */
      style={{ ['--cta-w' as string]: `${width}px` }}
      className={`fixed right-3 bottom-3 left-3 z-30 flex min-h-[52px] items-center justify-center rounded-xl border-0 px-3 py-2 text-[19px] leading-6 font-bold text-white shadow-cta transition-colors disabled:cursor-not-allowed sm:min-h-[56px] lg:right-6 lg:bottom-6 lg:left-auto lg:min-h-[64px] lg:w-[var(--cta-w)] lg:text-[22px] lg:leading-[26px] ${
        /*
         * A disabled button swaps to a pale tint with dark ink instead of fading
         * out. At 45% opacity the white label fell below the contrast floor,
         * which is exactly when the visitor needs to read it to learn why the
         * action is unavailable.
         *
         * The label is set bold and at least 19px so it counts as large text:
         * white on the reference's #4d90fe measures 3.1:1, which clears the 3:1
         * floor for large text but not the 4.5:1 one for body text. Darkening
         * the brand blue instead would have cost the identity the whole image
         * family is built on.
         */
        family === 'image'
          ? 'bg-img hover:bg-img-dark disabled:bg-[#dbe7fb] disabled:text-ink-2 disabled:hover:bg-[#dbe7fb]'
          : 'bg-brand hover:bg-brand-dark disabled:bg-[#fbdcdb] disabled:text-ink-2 disabled:hover:bg-[#fbdcdb]'
      }`}
    >
      <span className="flex items-center justify-center px-1.5">{busy ? 'Working…' : label}</span>
      <span className="ml-1.5 flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">
        <img src={ICONS.arrowCircle} alt="" className="h-6 w-6" />
      </span>
    </button>
  );
}