/*
 * Prerender one real HTML file per tool route.
 *
 * THE PROBLEM THIS SOLVES
 * PaperSnap used a HashRouter, so every tool lived behind a fragment:
 * /#/merge-pdf. A fragment is never sent to the server, so all 30 tools
 * collapsed into a single indexable URL — and because the app also shipped one
 * <title> and one description for the whole site, a search engine had exactly
 * one page of 16-word content to rank and 29 more it could not see at all.
 *
 * WHAT THIS DOES
 * Writes dist/<slug>/index.html for every visible tool, each carrying its own
 * <title>, description, canonical URL, Open Graph tags, JSON-LD (SoftwareApp +
 * FAQPage + BreadcrumbList) and a plain-HTML summary of the page. Cloudflare
 * serves a folder index.html as a real 200 response, so /merge-pdf is a
 * genuine, crawlable page.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It does not render the React tree. Calling react-dom/server here would mean
 * executing components that touch window.matchMedia at import time (the theme
 * and install-prompt hooks), which throws outside a browser. Instead the
 * document a crawler sees is generated from the catalogue — the same source of
 * truth the app uses — and the client bundle hydrates the interactive version
 * on top. Crawlers get real content; people get the tool.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname ?? '.', '..');
const dist = path.join(root, 'dist');
const base = process.env.BASE_PATH || '/';

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('prerender: dist/index.html missing; run vite build first.');
  process.exit(1);
}

/* --------------------------------------------------------------- catalogue */

/** Transpile a TS module and evaluate it, following relative imports. */
function load(dir, file, seen = new Map()) {
  const full = path.join(dir, file);
  if (seen.has(full)) return seen.get(full);
  const src = fs.readFileSync(full, 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exportsObj = {};
  seen.set(full, exportsObj);
  const req = (spec) => {
    if (spec.startsWith('.')) {
      const p = path.resolve(path.dirname(full), spec);
      for (const cand of [p + '.ts', p + '.tsx', path.join(p, 'index.ts')]) {
        if (fs.existsSync(cand)) return load(path.dirname(cand), path.basename(cand), seen);
      }
    }
    return {};
  };
  new Function('exports', 'module', 'require', outputText)(exportsObj, { exports: exportsObj }, req);
  return exportsObj;
}

const catalogue = load(path.join(root, 'src/content'), 'tools.ts');
const seoModule = load(path.join(root, 'src/content'), 'toolSeo.ts');
const ALL_TOOL_BY_SLUG = catalogue.ALL_TOOL_BY_SLUG;
const TOOL_SEO = seoModule.TOOL_SEO;

const visibleSlugs = Object.keys(ALL_TOOL_BY_SLUG).filter((s) => !ALL_TOOL_BY_SLUG[s].hidden);

/* ------------------------------------------------------------------ helpers */

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const SITE = 'PaperSnap';

/*
 * The absolute origin, needed for canonical URLs, Open Graph and the sitemap.
 * A relative canonical is worse than useless, so this has to be a real origin:
 * set SITE_ORIGIN at build time. The default is the workers.dev address this
 * project deploys to, so a plain build still produces a valid site.
 */
const ORIGIN = (process.env.SITE_ORIGIN || 'https://papersnap.nullstacks.workers.dev').replace(/\/$/, '');
const BASE_PATH = base.endsWith('/') ? base.slice(0, -1) : base;
const abs = (route) => `${ORIGIN}${BASE_PATH}${route}`;

/* Applies the shared <head> substitutions to a copy of the shell. */
function shell() {
  return fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
}

/**
 * Replace the head metadata of the shell with values for one route.
 *
 * The shell is regenerated from the built index.html for every page, so the
 * hashed script/link tags stay exactly as Vite emitted them.
 */
function headFor(def, seo, route) {
  const title = `${def.title} — ${SITE}`;
  const description = seo ? seo.lead.slice(0, 158) : def.sub;
  const canonical = abs(route);

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: def.title,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any (browser)',
      description: def.sub,
      url: canonical,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: def.sub,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'PaperSnap', item: `${ORIGIN}${base}` },
        { '@type': 'ListItem', position: 2, name: def.title, item: canonical },
      ],
    },
  ];

  if (seo && seo.faq.length) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: seo.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }

  return { title, description, canonical, jsonLd };
}

/** Crawlable body: what this tool is, how it works, the FAQ, the privacy line. */
function bodyFor(def, seo) {
  if (!seo) {
    return `<main><h1>${esc(def.h1)}</h1><p>${esc(def.sub)}</p></main>`;
  }
  return `<main>
  <h1>${esc(def.h1)}</h1>
  <p>${esc(def.sub)}</p>
  <section>
    <h2>What ${esc(def.title)} does</h2>
    <p>${esc(seo.lead)}</p>
  </section>
  <section>
    <h2>How to ${esc(def.title.toLowerCase())}</h2>
    <ol>${seo.how.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  </section>
  <section>
    <h2>Privacy</h2>
    <p>${esc(seo.privacy)}</p>
  </section>
  <section>
    <h2>Questions</h2>
    ${seo.faq
      .map((f) => `<div><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`)
      .join('\n    ')}
  </section>
</main>`;
}

/* -------------------------------------------------------------------- write */

let written = 0;
let missingSeo = [];

for (const slug of visibleSlugs) {
  const def = ALL_TOOL_BY_SLUG[slug];
  const seo = TOOL_SEO[slug];
  if (!seo) missingSeo.push(slug);

  const route = `/${slug}/`;
  const { title, description, canonical, jsonLd } = headFor(def, seo, route);

  let html = shell();

  /* Swap the head metadata in place. Vite already rewrote asset URLs for the
   * configured base, so nothing else in the document needs touching. */
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${esc(description)}" />`,
  );
  html = html.replace(/<meta property="og:title"[\s\S]*?\/>/, `<meta property="og:title" content="${esc(title)}" />`);
  html = html.replace(
    /<meta\s+property="og:description"[\s\S]*?\/>/,
    `<meta property="og:description" content="${esc(description)}" />`,
  );

  const extra = [
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    ...jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`),
  ].join('\n    ');
  html = html.replace('</head>', `  ${extra}\n  </head>`);

  /* Put the crawlable content inside #root.
   *
   * createRoot().render() clears this container the moment React mounts, which
   * is exactly what we want: a crawler that does not run JavaScript reads the
   * full text, and a real visitor gets the interactive tool a few hundred
   * milliseconds later. Serving the text instead of an empty div is the whole
   * point of prerendering. */
  html = html.replace(
    /<div id="root"><\/div>/,
    `<div id="root">${bodyFor(def, seo)}</div>`,
  );

  const outDir = path.join(dist, slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  written++;
}

/* ------------------------------------------------------- landing + sitemap */

const homeHtml = shell().replace(
  '</head>',
  `  <link rel="canonical" href="${esc(abs('/'))}" />\n  </head>`,
);
fs.writeFileSync(path.join(dist, 'index.html'), homeHtml);

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  `  <url><loc>${esc(abs('/'))}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
  ...visibleSlugs.map(
    (s) => `  <url><loc>${esc(abs(`/${s}/`))}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>`,
  ),
  '</urlset>',
].join('\n');
fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap);

const robots = ['User-agent: *', 'Allow: /', `Sitemap: ${abs('/sitemap.xml')}`].join('\n') + '\n';
fs.writeFileSync(path.join(dist, 'robots.txt'), robots);

/*
 * 404.html is served by Cloudflare's "404-page" not_found_handling for paths
 * that match no file. It is the shell WITHOUT a canonical tag — a canonical on
 * a 404 would tell a crawler which URL is authoritative for a page that does
 * not exist. noindex is the honest signal here.
 */
const notFound = shell().replace('</head>', '  <meta name="robots" content="noindex" />\n  </head>');
fs.writeFileSync(path.join(dist, '404.html'), notFound);

console.log(`prerender: wrote ${written} tool pages, sitemap (${written + 1} URLs), robots.txt`);
if (missingSeo.length) {
  console.warn(`prerender: no long-form copy for: ${missingSeo.join(', ')}`);
}
