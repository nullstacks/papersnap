/**
 * Icon set.
 *
 * Icons are inline SVG data URLs so a tool definition stays a plain string and
 * can be rendered with `<img src>`. Keeping them out of React components avoids
 * shipping a component per glyph.
 */

/** Wrap raw SVG markup as a data URL usable in `src`. */
const url = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;

/* --------------------------------------------------------------- UI glyphs */

export const ICONS = {
  plus: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M10 1.833v16.333M1.833 10h16.333"/></svg>',
  ),
  disk: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="19" viewBox="0 0 20 19" fill="#fff"><path d="M4.8 19c-.442 0-.8-.448-.8-1s.358-1 .8-1h10.4c.442 0 .8.448.8 1s-.358 1-.8 1H4.8z"/><path d="M7 15h6l-1 3H8z"/><path d="M2 2v11h16V2H2zM1 0h18a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V1a1 1 0 0 1 1-1z"/></svg>',
  ),
  rotateRight: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e5322d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  ),
  rotateLeft: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.64-6.36"/><path d="M3 3v6h6"/></svg>',
  ),
  close: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#47474f" stroke-width="1.8" stroke-linecap="round"><path d="M10 2 2 10M2 2l8 8"/></svg>',
  ),
  download: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  ),
  arrowLeft: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>',
  ),
  arrowRight: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
  ),
  chevronRight: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  ),
  chevronDown: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  ),
  eye: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 22 19" fill="currentColor"><path d="M11 4c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92A11.82 11.82 0 0 0 21.99 9c-1.73-4.4-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C9.74 4.13 10.35 4 11 4zM1 1.27L3.74 4A11.8 11.8 0 0 0 0 9c1.73 4.4 6 7.5 11 7.5a11.78 11.78 0 0 0 4.38-.84l.42.42L18.73 19 20 17.73 2.27 0 1 1.27zM6.53 6.8l1.55 1.55A2.82 2.82 0 0 0 8 9c0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.4.53-2.2.53-2.76 0-5-2.24-5-5 0-.8.2-1.53.53-2.2zm4.3-.78L14 9.17V9c0-1.66-1.34-3-3-3l-.17.01z"/></svg>',
  ),
  zoom: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e5322d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  ),
  sort: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="22" viewBox="0 0 20 22" fill="%23currentColor"><path d="M2.947 15.297V.23c0-.067.026-.123.077-.166S3.14 0 3.22 0h1.635c.08 0 .145.022.196.065s.077.1.077.166v15.066h2.5a.39.39 0 0 1 .261.087.28.28 0 0 1 .102.222c0 .077-.038.154-.114.23l-3.62 3.076a.42.42 0 0 1-.261.087c-.09 0-.178-.03-.26-.087L.11 15.828c-.113-.103-.14-.215-.08-.338.06-.13.174-.193.34-.193h2.577z"/><path d="M11.222 20.2l2.94-7.52c.194-.496.555-.67 1.1-.67h.54c.513 0 .97.12 1.22.804l2.746 7.386c.083.214.222.603.222.845 0 .536-.485.965-1.068.965-.5 0-.86-.174-1.026-.603l-.582-1.6h-3.66l-.596 1.6c-.153.43-.47.603-1.012.603-.624 0-1.054-.375-1.054-.965 0-.24.14-.63.222-.845zm5.602-1.93l-1.3-3.874h-.028L14.15 18.27h2.663z"/></svg>',
  ),
  alert: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
  ),
  check: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  ),
  files: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6z"/><path d="M15 2v4h4"/></svg>',
  ),
  infoDoc: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9 2.5h6l5 5V21a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 21V4A1.5 1.5 0 0 1 9.5 2.5z" fill="#ffe9a8" stroke="#e0b341" stroke-width="1.1"/><path d="M15 2.5V8h5" fill="none" stroke="#e0b341" stroke-width="1.1"/><path d="M12 11v6M12 19.4v.2" stroke="#b98b16" stroke-width="1.8" stroke-linecap="round"/></svg>',
  ),
  arrowCircle: url(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26" width="24" height="24" fill="#fff" fill-rule="evenodd"><path d="M13 0a13 13 0 1 1 0 26 13 13 0 0 1 0-26zm0 1.6a11.4 11.4 0 1 0 0 22.8 11.4 11.4 0 0 0 0-22.8z"/><path d="M12 17.4V9.9l-3 3a1.06 1.06 0 0 1-1.5-1.5l4.8-4.8a1.06 1.06 0 0 1 1.5 0l4.8 4.8a1.06 1.06 0 0 1-1.5 1.5l-3-3v7.5a1.06 1.06 0 0 1-2.1 0z" transform="rotate(45 13 13)"/></svg>',
  ),
  emptyDoc: url(
    '<svg xmlns="http://www.w3.org/2000/svg" width="75" height="66" viewBox="0 0 150 132" fill="none"><rect x="30" y="10" width="90" height="112" rx="8" fill="#fff" fill-opacity=".18" stroke="#fff" stroke-opacity=".5" stroke-width="2"/><rect x="44" y="30" width="62" height="7" rx="3.5" fill="#fff" fill-opacity=".45"/><rect x="44" y="48" width="46" height="7" rx="3.5" fill="#fff" fill-opacity=".32"/><rect x="44" y="66" width="56" height="7" rx="3.5" fill="#fff" fill-opacity=".32"/><rect x="44" y="84" width="38" height="7" rx="3.5" fill="#fff" fill-opacity=".22"/></svg>',
  ),
} as const;

export type IconName = keyof typeof ICONS;

/** A monochrome glyph that inherits `currentColor`. */
export function Icon({
  name,
  className,
  size = 20,
}: {
  name: IconName;
  className?: string;
  size?: number;
}) {
  return (
    <img
      src={ICONS[name]}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

/** Inline check mark, used inside checkbox/radio ticks. */
export function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 14 12"
      aria-hidden="true"
      className={className}
      style={{ width: 14, height: 12 }}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 6l3.6 3.6L12.5 1.6" />
    </svg>
  );
}

/*
 * Card action glyphs, drawn inline so they inherit `currentColor` and follow
 * the light/dark theme. SVGs loaded via <img src="data:..."> are isolated from
 * page CSS, so a baked-in colour could never adapt.
 */
export function ZoomIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function RotateGlyphIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M10 2 2 10M2 2l8 8" />
    </svg>
  );
}

/*
 * The sort glyph is drawn inline rather than as an <img src="data:...">.
 * SVGs loaded through <img> are isolated from the page, so `currentColor`
 * cannot resolve and the icon would not follow the light/dark theme.
 */
export function SortIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="22"
      viewBox="0 0 20 22"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M2.947 15.297V.23c0-.067.026-.123.077-.166S3.14 0 3.22 0h1.635c.08 0 .145.022.196.065s.077.1.077.166v15.066h2.5a.39.39 0 0 1 .261.087.28.28 0 0 1 .102.222c0 .077-.038.154-.114.23l-3.62 3.076a.42.42 0 0 1-.261.087c-.09 0-.178-.03-.26-.087L.11 15.828c-.113-.103-.14-.215-.08-.338.06-.13.174-.193.34-.193h2.577z" />
      <path d="M11.222 20.2l2.94-7.52c.194-.496.555-.67 1.1-.67h.54c.513 0 .97.12 1.22.804l2.746 7.386c.083.214.222.603.222.845 0 .536-.485.965-1.068.965-.5 0-.86-.174-1.026-.603l-.582-1.6h-3.66l-.596 1.6c-.153.43-.47.603-1.012.603-.624 0-1.054-.375-1.054-.965 0-.24.14-.63.222-.845zm5.602-1.93l-1.3-3.874h-.028L14.15 18.27h2.663z" />
    </svg>
  );
}

