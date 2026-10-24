/**
 * Site footer.
 *
 * Deliberately one compact band: a link row, a language note and the
 * copyright. The reference's four-column sitemap made every page feel like it
 * ended in a second, larger document; this keeps the app's weight.
 */
import { Link } from 'react-router-dom';

const LINKS: Array<[string, string]> = [
  ['/', 'Home'],
  ['/merge-pdf', 'PDF tools'],
  ['/compress-image', 'Image tools'],
  ['/photo-editor', 'Photo editor'],
  ['/html-to-image', 'HTML to image'],
  ['/protect-pdf', 'Privacy'],
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface px-6 py-5">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center justify-between gap-3 sm:flex-row">
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {LINKS.map(([to, label]) => (
            <Link
              key={label}
              to={to}
              className="text-[13px] text-muted no-underline hover:text-ink-2"
            >
              {label}
            </Link>
          ))}
        </nav>
        <p className="text-center text-[12.5px] text-muted sm:text-right">
          © PaperSnap — every tool runs in your browser.
        </p>
      </div>
    </footer>
  );
}