/**
 * Full-screen progress overlay.
 *
 * The reference shows a bare brand logo, a status line and a spinner while the
 * server works. Here the work is local, so the same shell also carries a real
 * determinate bar — the percentage reflects actual pages processed rather than
 * a decorative animation.
 */
import brandMark from '@/assets/img/brand.svg';

interface Props {
  stage: string;
  percent: number;
}

export function ProgressOverlay({ stage, percent }: Props) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-canvas"
      role="status"
      aria-live="polite"
    >
      <img src={brandMark} alt="PDFDock" className="mb-12 h-10 w-auto" />

      <div className="mb-6 text-[22px] leading-8 font-semibold text-ink-2">{stage}</div>

      <div
        className="mb-3 h-1.5 w-[280px] overflow-hidden rounded-full bg-subtle"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-200 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      <div className="text-sm tabular-nums text-muted">{Math.round(percent)}%</div>
    </div>
  );
}
