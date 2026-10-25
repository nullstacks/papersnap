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

Two families share one shell. The PDF half follows iLovePDF's layout; the image
half follows iLoveIMG's, down to its blue CTA — which is why `--color-brand`
(red) and `--color-img` (blue) exist as separate tokens.

The wording is now our own. The original catalogue reused iLovePDF's marketing
strings verbatim, which was both a legal grey area and useless for search: 30
pages carrying a competitor's copy, all behind one URL. `src/content/toolSeo.ts`
replaced it with original copy written to describe what these tools actually do.

**PDF — Organize** — Merge, Split, Remove pages, Extract pages
**PDF — Optimize** — Compress, Repair
**PDF — Convert to PDF** — JPG, Word, PowerPoint, Excel, HTML
**PDF — Convert from PDF** — JPG, Word\*, PowerPoint\*, Excel\*, PDF/A\*
**PDF — Edit** — Rotate, Page numbers, Watermark, Crop
**PDF — Security** — Unlock, Protect (AES-256), Sign

**IMAGE — Optimize** — Compress, Resize
**IMAGE — Edit** — Crop, Rotate, Photo editor, Watermark, Blur face
**IMAGE — Convert** — Convert to JPG, Convert from JPG, HTML to image
**IMAGE — Create** — Meme generator

\* Text-only recovery, so these are `hidden: true`: the route still works for an
old bookmark, but nothing advertises a tool whose output would disappoint. Six
entries are hidden in total — four PDF, two image — leaving 30 visible.

## Features

- **Nothing leaves the device, and the browser enforces it.** Files are read
  with `File.arrayBuffer()` and results handed back as `Blob` downloads. On top
  of that, `public/_headers` ships a Content-Security-Policy with
  `default-src 'none'` and `connect-src 'self'`, so a dependency that tried to
  send data anywhere would be blocked rather than merely caught in review.
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
| Convert from JPG | PNG or GIF output; GIF silently falls back to PNG in browsers that cannot encode it |
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
pnpm test           # pure-logic regression checks
pnpm build          # typecheck, build, prerender, CSP hash, service worker
pnpm preview        # serve the built output
pnpm deploy         # build, then wrangler deploy
```

`pnpm test` runs `scripts/check-regressions.mjs`: 30 assertions over the real
sources covering page-range parsing, the image accept filter, byte formatting,
the sanitiser's URL predicates, the pdf.js CMap/font wiring, and the SEO and
prerender coupling. It needs no test framework — the repo has no vitest/jest
dependency, and this was deliberately kept that way rather than adding one.

### Build steps

`pnpm build` chains these scripts after `vite build`, in this order:

| Step | What it adds |
| --- | --- |
| `scripts/prerender.mjs` | `dist/<slug>/index.html` per tool, sitemap, robots, 404 |
| `scripts/csp-hash.mjs` | the inline script's SHA-256 into `dist/_headers` |
| `scripts/build-sw.mjs` | a real precache list and content-hashed cache version |
| `vite` (already run) | bundles, plus pdf.js `cmaps/` and `standard_fonts/` |

Order matters: the CSP hash is computed from the built `index.html`, and the
service-worker precache list is built from whatever files exist in `dist/`.

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
  content/        tool catalogue, icons, nav groups, long-form SEO copy
  hooks/          theme, install prompt
  lib/            PDF engine, image engine, ranges, sanitiser, format helpers
  pages/          home, not-found
  styles/         Tailwind entry, design tokens, dark theme
  tools/          one module per tool family, plus the lazy registry
  types.ts        shared domain types

scripts/
  prerender.mjs      per-route HTML, sitemap, robots, 404
  csp-hash.mjs       inline-script hash -> _headers
  build-sw.mjs       service-worker precache list + cache version
  check-regressions.mjs   dependency-free assertions (pnpm test)
  cf-sim.mjs         serve dist/ with Cloudflare routing + header semantics
```

Note that `src/lib/` is split so the PDF engine stays off the landing page's
critical path: `format.ts`, `ranges.ts` and `sanitize.ts` have no heavy
dependencies, and `pdf.ts` is imported dynamically by the components that need
it. A static `import '@/lib/pdf'` anywhere on the landing graph re-couples
pdf-lib and pdf.js to first paint.

Each tool is a `ToolImpl`: a `Panel` for the options column, an optional
`Workarea` for canvas content such as page grids, and a `run()` returning
`ResultFile[]`. Tool modules load on demand, so the landing page never downloads
the PDF engine.

### Catalogues and copy

- `src/content/tools.ts` holds the 23 PDF entries and the nav groups;
  `src/content/imageTools.ts` holds the 13 image entries. Together they register
  36 routes, of which 30 are visible.
- `src/content/toolSeo.ts` holds the long-form copy each prerendered page
  carries: lead paragraph, how-to steps, FAQ and a tool-specific privacy note.

`_gen/gen-tools.mjs` was a one-off bootstrap that read the v1 catalogue from
`_legacy-src/` to carry the 23 original definitions over with their inline SVG
icons. **Do not re-run it.** It only knows that legacy set, and `tools.ts` has
been edited by hand many times since — running it would overwrite those edits.
It is kept for reference only.