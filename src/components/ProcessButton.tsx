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
}

export function ProcessButton({ label, disabled, busy, onClick, width }: Props) {
  return (
    <button
      type="button"
      id="processTask"
      onClick={onClick}
      disabled={disabled || busy}
      /* Desktop keeps the reference's fixed 252px CTA; on phones it becomes a
         comfortable full-width target pinned above the safe area. */
      style={{ ['--cta-w' as string]: `${width}px` }}
      className="fixed right-3 bottom-3 left-3 z-30 flex min-h-[52px] items-center justify-center rounded-xl border-0 bg-brand px-3 py-2 text-[17px] leading-6 font-medium text-white shadow-cta transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-brand sm:min-h-[56px] lg:right-6 lg:bottom-6 lg:left-auto lg:min-h-[64px] lg:w-[var(--cta-w)] lg:text-[22px] lg:leading-[26px]"
    >
      <span className="flex items-center justify-center px-1.5">{busy ? 'Working…' : label}</span>
      <span className="ml-1.5 flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">
        <img src={ICONS.arrowCircle} alt="" className="h-6 w-6" />
      </span>
    </button>
  );
}
