# PaperSnap

A complete, fully local PDF toolkit — a React + TypeScript single-page app.
Every tool runs inside the browser tab: no server, no uploads, no accounts.

## Stack

| Concern | Choice |
| --- | --- |
| UI | React 19 + TypeScript (strict) |
| Build | Vite 6 |
| Styling | Tailwind CSS v4 (design tokens in `src/styles/index.css`) |
| Routing | React Router 7, **HashRouter** |
| PDF structure | `@cantoo/pdf-lib` |
| PDF rendering / text | `pdfjs-dist` (real worker, bundled) |
| DOCX / XLSX / PPTX / HTML | `mammoth`, `jszip`, `xlsx`, `pptxgenjs`, `html2canvas` |
| Wordmark | Bodoni Moda Bold (self-hosted Latin subset) |

### Why HashRouter

GitHub Pages serves static files with no rewrite rules, so path-based routes
would 404 on refresh and on shared deep links. Every route lives under `#/`
(`/#/merge-pdf`), which always resolves to `index.html`. A copy of
`index.html` is also published as `404.html` so stray paths still boot the app.

## Tools (36)

Two families share one shell. The PDF half follows iLovePDF's layout and
wording; the image half follows iLoveIMG's, down to its blue CTA — which is why
`--color-brand` (red) and `--color-img` (blue) exist as separate tokens.

**PDF — Organize** — Merge, Split, Remove pages, Extract pages
**PDF — Optimize** — Compress, Repair
**PDF — Convert to PDF** — JPG, Word, PowerPoint, Excel, HTML
**PDF — Convert from PDF** — JPG, Word, PowerPoint, Excel, PDF/A
**PDF — Edit** — Rotate, Page numbers, Watermark, Crop
**PDF — Security** — Unlock, Protect (AES-256), Sign

**IMAGE — Optimize** — Compress, Resize, Upscale
**IMAGE — Edit** — Crop, Rotate, Photo editor, Watermark, Blur face,
Remove background
**IMAGE — Convert** — Convert to JPG, Convert from JPG, HTML to image
**IMAGE — Create** — Meme generator

## Features

- **Nothing leaves the device.** Files are read with `File.arrayBuffer()` and
  results handed back as `Blob` downloads.
- **Drag & drop** anywhere on the tool page, with a full-bleed drop overlay.
- **Drag to reorder** file cards; the order is what gets merged.
- **Page picking** for Remove / Extract / Split happens on the canvas, where
  the thumbnails are legible — click to toggle, shift-click for a range.
- **Light and dark themes**, remembered across visits and applied before first
  paint (no flash).
- **Installable app** with an offline service worker.
- **Fully responsive** — a 300px options column on desktop, a slide-up settings
  sheet on phones.
- **Two accent identities.** PDF tools use the iLovePDF red (`--color-brand`);
  image tools use the iLoveIMG blue (`--color-img`). `isImageTool(slug)` in
  `src/lib/accent.ts` is the only place that decision is made, and the shell
  threads it through the uploader, the CTA, the drop outline and the result page.
- **A real image engine.** `src/lib/image.ts` decodes and re-encodes through
  `<canvas>` only: progressive halving for clean downscales, a hand-written
  24-bit BMP encoder, a flood-fill background remover, and a text/logo watermark
  renderer. No image dependency is installed for this.

## Image tools (iLoveIMG parity)

The image half mirrors iloveimg.com's tool set, its panel wording and its
layout, rebuilt to run locally:

| Tool | What it does locally |
| --- | --- |
| Compress IMAGE | Re-encode at three levels; refuses to return a bigger file |
| Resize IMAGE | Pixels or percentage, ratio lock, no-enlarge guard |
| Upscale | 2x/4x progressive resample plus a sharpen pass |
| Crop IMAGE | Draggable 8-handle box, aspect presets, flip, rotate |
| Rotate IMAGE | Per-file right/left queue with flips, matching the card control |
| Photo editor | Tabbed editor: filters, resize, crop, transform, draw, text, shapes, frame, background |
| Watermark IMAGE | Text or logo, position, opacity, angle, tiled mode |
| Blur face | Optional skin-tone detection plus a hand-drawn region editor |
| Remove background | Edge-colour flood fill, transparent or flat colour |
| Convert to JPG | Quality presets, transparency flattened onto white |
| Convert from JPG | PNG or GIF output with static/animated choice |
| HTML to image | Renders pasted markup off-screen and rasterises it |
| Meme generator | Top/bottom or in-picture captions, draggable layers |

Where a reference feature fundamentally needs a server — face detection models,
fetching another site's page, server-side SVG rendering — the tool says so in
its own panel rather than faking the result.

## Brand

The wordmark is `PAPER [mark] SNAP`: two words in Bodoni Moda Bold, all caps,
with the document-and-heart mark set between them. Assets are generated from the
source artwork by `_gen/make-brand.py`:

| File | Purpose |
| --- | --- |
| `public/img/brand.svg` | Vector mark used in the header lockup |
| `public/img/app-icon-{192,512}.png` | PWA "any" icons |
| `public/img/app-icon-maskable-*.png` | Android maskable icons (safe-zone inset) |
| `public/img/apple-touch-icon.png` | iOS home-screen icon |
| `public/img/favicons-pdf/favicon-*` | Browser tabs |

The font lives at `src/assets/fonts/BodoniModa-Bold.woff2` and is referenced as
`var(--font-brand)`.

## Develop

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm typecheck      # tsc, strict
pnpm build          # typecheck + production build into dist/
pnpm preview        # serve the built output
```

## Deploy to GitHub Pages

Pushing to `main` runs `.github/workflows/deploy.yml`, which typechecks, builds
with `BASE_PATH=/<repo-name>/`, and publishes `dist/`.

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.

To build for a project site manually:

```bash
BASE_PATH=/your-repo-name/ pnpm build
```

The `BASE_PATH` environment variable sets Vite's `base`, so hashed asset URLs
and the bundled PDF worker resolve correctly under `/<repo>/`.

## Architecture

```
src/
  assets/         fonts (Graphik, Bodoni Moda) and the brand mark
  components/     shell, tool page, cards, uploader, page grid, result views
  content/        generated tool catalogue (copy + icons + nav groups)
  hooks/          theme, install prompt
  lib/            PDF engine (pdf-lib + pdf.js) and format helpers
  pages/          home, not-found
  styles/         Tailwind entry, design tokens, dark theme
  tools/          one module per tool family, plus the lazy registry
  types.ts        shared domain types
```

Each tool is a `ToolImpl`: a `Panel` for the options column, an optional
`Workarea` for canvas content such as page grids, and a `run()` returning
`ResultFile[]`. Tool modules load on demand, so the landing page never downloads
the PDF engine.

`src/content/tools.ts` is generated from `_gen/gen-tools.mjs`; edit the generator
(not the output) when changing catalogue copy or the header nav.
