/**
 * Icons for the image tools.
 *
 * Each is a rounded-square tile with a white glyph, the same construction the
 * PDF icons use, so the two families sit together on the home grid. They are
 * assembled once at module load into data URLs, which is what <img src> wants.
 */

const wrap = (body: string, tone = '#2d7ff9') =>
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">` +
      `<rect width="48" height="48" rx="11" fill="${tone}"/>` +
      body +
      '</svg>',
  );

const GLYPH = {
  /* Compress: four arrows pointing inward. */
  compress: `<g fill="#fff">` +
    `<path d="M20 12h3v9h-3z"/><path d="M12 20h9v3h-9z"/>` +
    `<path d="M12.7 13.4l2.1-2.1 5.1 5.1-2.1 2.1z"/>` +
    `<path d="M28 36h-3v-9h3z"/><path d="M36 28h-9v-3h9z"/>` +
    `<path d="M35.3 34.6l-2.1 2.1-5.1-5.1 2.1-2.1z"/>` +
    `<path d="M12.7 34.6l-2.1-2.1 5.1-5.1 2.1 2.1z"/>` +
    `<path d="M36.4 13.4l-5.1 5.1-2.1-2.1 5.1-5.1z"/>` +
  `</g>`,
  /* Resize: a corner handle dragging a frame. */
  resize: `<g fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round">` +
    `<rect x="11" y="11" width="20" height="20" rx="3"/>` +
    `<path d="M31 31h6v6h-6z" fill="#fff" stroke="none"/>` +
    `<path d="M20 30.5l9-9"/>` +
  `</g>`,
  /* Crop: two overlapping right angles. */
  crop: `<g fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round">` +
    `<path d="M17 10v20a2 2 0 0 0 2 2h20"/>` +
    `<path d="M11 17h20a2 2 0 0 1 2 2v20"/>` +
  `</g>`,
  /* Convert to JPG: picture frame with a J. */
  jpg: `<g fill="#fff"><path d="M11 13h26v22H11z" opacity=".22"/>` +
    `<path d="M11 35l7.5-10 5 6 4-4.6L35 35z"/>` +
    `<circle cx="31" cy="19" r="2.6"/>` +
    `<path d="M11 13h3v22h-3zM34 13h3v22h-3zM11 13h26v3H11zM11 32h26v3H11z"/>` +
  `</g>`,
  /* Photo editor: sliders. */
  edit: `<g fill="#fff">` +
    `<rect x="12" y="14" width="24" height="3.4" rx="1.7"/>` +
    `<circle cx="19" cy="15.7" r="4"/>` +
    `<rect x="12" y="23" width="24" height="3.4" rx="1.7"/>` +
    `<circle cx="30" cy="24.7" r="4"/>` +
    `<rect x="12" y="32" width="24" height="3.4" rx="1.7"/>` +
    `<circle cx="23" cy="33.7" r="4"/>` +
  `</g>`,
  /* Upscale: expanding arrows. */
  upscale: `<g fill="#fff">` +
    `<path d="M12 12h10v3.4h-6.6V22H12z"/>` +
    `<path d="M36 12v10h-3.4v-6.6H26V12z"/>` +
    `<path d="M36 36H26v-3.4h6.6V26H36z"/>` +
    `<path d="M12 36V26h3.4v6.6H22V36z"/>` +
  `</g>`,
  /* Remove background: checkerboard with a cut-out. */
  bg: `<g fill="#fff">` +
    `<path d="M11 11h6v6h-6zM23 11h6v6h-6zM35 11h2v6h-2zM17 17h6v6h-6zM29 17h6v6h-6zM11 23h6v6h-6zM35 23h2v6h-2zM23 29h6v6h-6zM35 29h2v6h-2zM11 35h6v2h-6zM29 35h6v2h-6z" opacity=".55"/>` +
    `<circle cx="24" cy="19" r="5.4"/>` +
    `<path d="M14 34c0-6.2 4.5-10.6 10-10.6S34 27.8 34 34z"/>` +
  `</g>`,
  /* Meme: speech bubble. */
  meme: `<g fill="#fff">` +
    `<path d="M11 13h26v17H22l-7 6v-6h-4z"/>` +
    `<circle cx="18" cy="21.5" r="2"/><circle cx="24" cy="21.5" r="2"/><circle cx="30" cy="21.5" r="2"/>` +
  `</g>`,
  /* Rotate: circular arrow. */
  rotate: `<g fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round">` +
    `<path d="M33.5 17.5A12 12 0 1 0 36 24"/>` +
    `<path d="M36 12v9h-9" fill="#fff" stroke-linejoin="round"/>` +
  `</g>`,
  /* Convert from JPG: two frames with an arrow. */
  fromjpg: `<g fill="#fff">` +
    `<path d="M10 14h13v20H10z" opacity=".5"/>` +
    `<path d="M25 17h13v14H25z"/>` +
    `<path d="M20 23h3v2h-3z"/>` +
  `</g>`,
  /* HTML to image: browser window. */
  html: `<g fill="#fff">` +
    `<rect x="10" y="13" width="28" height="22" rx="3" opacity=".25"/>` +
    `<path d="M10 16h28v3H10z"/>` +
    `<path d="M13 22h8v2.6h-8zM13 27h14v2.6H13z"/>` +
  `</g>`,
  /* Watermark: droplet over a picture. */
  watermark: `<g fill="#fff">` +
    `<path d="M11 12h26v24H11z" opacity=".22"/>` +
    `<path d="M24 15c3.6 4.4 5.6 7.3 5.6 9.8A5.6 5.6 0 0 1 24 30.4a5.6 5.6 0 0 1-5.6-5.6c0-2.5 2-5.4 5.6-9.8z"/>` +
    `<path d="M15 33l5-6 4 4.4 3-2.6 6 4.2z" opacity=".8"/>` +
  `</g>`,
  /* Blur face: a face behind a pixel grid. */
  blur: `<g fill="#fff">` +
    `<circle cx="24" cy="24" r="12" opacity=".3"/>` +
    `<rect x="14" y="14" width="6" height="6"/><rect x="26" y="14" width="6" height="6"/>` +
    `<rect x="20" y="20" width="6" height="6"/><rect x="32" y="20" width="6" height="6"/>` +
    `<rect x="14" y="26" width="6" height="6"/><rect x="26" y="26" width="6" height="6"/>` +
  `</g>`,
};

export const IMAGE_ICON: Record<string, string> = {
  'compress-image': wrap(GLYPH.compress),
  'resize-image': wrap(GLYPH.resize),
  'crop-image': wrap(GLYPH.crop),
  'convert-to-jpg': wrap(GLYPH.jpg),
  'photo-editor': wrap(GLYPH.edit, '#7b5cf0'),
  'upscale-image': wrap(GLYPH.upscale, '#0fa37f'),
  'remove-background': wrap(GLYPH.bg, '#7b5cf0'),
  'meme-generator': wrap(GLYPH.meme, '#e2842a'),
  'rotate-image': wrap(GLYPH.rotate, '#d4448e'),
  'jpg-to-image': wrap(GLYPH.fromjpg, '#0fa37f'),
  'html-to-image': wrap(GLYPH.html, '#4a5a7a'),
  'watermark-image': wrap(GLYPH.watermark, '#d4448e'),
  'blur-face': wrap(GLYPH.blur, '#e2842a'),
};