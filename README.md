# PaperSnap

A complete, fully local PDF toolkit — a React + TypeScript single-page app.
Every tool runs inside the browser tab: no server, no uploads, no accounts.

## Stack

| Concern | Choice |
| --- | --- |
| UI | React 19 + TypeScript (strict) |
| Build | Vite 6 |
| Styling | Tailwind CSS v4 (design tokens in `src/styles/index.css`) |
| Routing | React Router 7, **BrowserRouter** over prerendered paths |
| Hosting | Cloudflare Workers static assets (no Worker script) |
| PDF structure | `@cantoo/pdf-lib` |
| PDF rendering / text | `pdfjs-dist` (real worker, bundled; cMaps + standard fonts shipped) |
| DOCX / XLSX / PPTX / HTML | `mammoth`, `jszip`, `xlsx`, `html2canvas` |
| Wordmark | Bodoni Moda Bold (self-hosted Latin subset) |

### Why the routes are prerendered

Every tool lives at a real path — `/merge-pdf`, `/compress-image` — not behind a
hash. `scripts/prerender.mjs` writes `dist/<slug>/index.html` for each visible
tool at build time, each with its own title, description, canonical URL, Open
Graph tags and JSON-LD, plus a plain-HTML summary of the page. That summary is
rendered inside `#root`; React replaces it on mount.

This is what makes the tools findable. The app previously used a HashRouter
because GitHub Pages has no rewrite rules, which meant all 30 tools shared a
single indexable URL and the site shipped one description for the whole thing.

Old `/#/slug` links still work: `main.tsx` rewrites them to the path form
before the router mounts.

## Tools (30)

Two families share one shell. The PDF half follows iLovePDF's layout and
wording; the image half follows iLoveIMG's, down to its blue CTA — which is why
`--color-brand` (red) and `--color-img` (blue) exist as separate tokens.

**PDF — Organize** — Merge, Split, Remove pages, Extract pages
**PDF — Optimize** — Compress, Repair
**PDF — Convert to PDF** — JPG, Word, PowerPoint, Excel, HTML
**PDF — Convert from PDF** — JPG, Word, PowerPoint, Excel, PDF/A
**PDF — Edit** — Rotate, Page numbers, Watermark, Crop
**PDF — Security** — Unlock, Protect (AES-256), Sign

**IMAGE — Optimize** — Compress, Resize
**IMAGE — Edit** — Crop, Rotate, Photo editor, Watermark, Blur face
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
| Crop IMAGE | Draggable 8-handle box, aspect presets, flip, rotate |
| Rotate IMAGE | Per-file right/left queue with flips, matching the card control |
| Photo editor | Tabbed editor: filters, resize, crop, transform, draw, text, shapes, frame, background |
| Watermark IMAGE | Text or logo, position, opacity, angle, tiled mode |
| Blur face | Optional skin-tone detection plus a hand-drawn region editor |
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

## Deploy

The site is served from **Cloudflare Workers static assets**. `wrangler.toml`
declares no Worker script — the deployment is just `dist/` — so a request that
matches a file never invokes a runtime, is free and unlimited, and the "no
server" property holds structurally rather than by convention.

```bash
pnpm deploy          # build, then wrangler deploy
```

Pushing to `main` runs `.github/workflows/deploy.yml`: typecheck, regression
checks, build, an assertion that the prerendered routes actually exist, then
`wrangler deploy`. It needs two repository secrets:

| Secret | Where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → *Edit Cloudflare Workers* template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Account ID |

`SITE_ORIGIN` in the workflow supplies the absolute origin used for canonical
URLs, Open Graph tags and the sitemap. Change it if you attach a custom domain.

### Response headers

`public/_headers` is copied verbatim into the build and applied by Cloudflare.
It carries the Content-Security-Policy that enforces the privacy promise —
`default-src 'none'`, `connect-src 'self'`, `frame-ancestors 'none'` — plus
`immutable` caching for hashed bundles. GitHub Pages has no mechanism for
custom headers at all, which is the main reason the site moved.

The inline theme script in `index.html` needs its SHA-256 in the policy, so
`scripts/csp-hash.mjs` recomputes it from the built HTML on every build. Do not
hand-edit that hash.

`scripts/cf-sim.mjs` serves `dist/` with Cloudflare's routing and header
semantics so you can check a change locally before deploying.

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