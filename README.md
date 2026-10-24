# PDFDock

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

### Why HashRouter

GitHub Pages serves static files with no rewrite rules, so path-based routes
would 404 on refresh and on shared deep links. Every route lives under `#/`
(`/#/merge-pdf`), which always resolves to `index.html`. A copy of
`index.html` is also published as `404.html` so stray paths still boot the app.

## Tools (23)

**Organize** — Merge, Split, Remove pages, Extract pages
**Optimize** — Compress, Repair
**Convert to PDF** — JPG, Word, PowerPoint, Excel, HTML
**Convert from PDF** — JPG, Word, PowerPoint, Excel, PDF/A
**Edit** — Rotate, Page numbers, Watermark, Crop
**Security** — Unlock, Protect (AES-256), Sign

## Features

- **Nothing leaves the device.** Files are read with `File.arrayBuffer()` and
  results handed back as `Blob` downloads.
- **Drag & drop** anywhere on the tool page, with a full-bleed drop overlay.
- **Drag to reorder** file cards; the order is what gets merged.
- **Light and dark themes**, remembered across visits and applied before first
  paint (no flash).
- **Fully responsive** — a 300px options column on desktop, a slide-up settings
  sheet on phones.
- **Offline-capable** once loaded.

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
  components/     shell, tool page, cards, uploader, result + preview views
  content/        generated tool catalogue (copy + icons + nav groups)
  hooks/          theme
  lib/            PDF engine (pdf-lib + pdf.js) and format helpers
  pages/          home, not-found
  styles/         Tailwind entry, design tokens, dark theme
  tools/          one module per tool family, plus the lazy registry
  types.ts        shared domain types
```

Each tool is a `ToolImpl`: a React `Panel` plus a `run()` that returns
`ResultFile[]`. Tool modules are loaded on demand, so the landing page never
downloads the PDF engine.

`src/content/tools.ts` is generated from `_gen/gen-tools.mjs`; edit the
generator (not the output) when changing catalogue copy or the header nav.
