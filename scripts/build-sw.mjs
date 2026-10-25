/*
 * Post-build step: give the service worker a real precache list.
 *
 * Vite fingerprints every bundle, so a hand-written precache list can only ever
 * name files that no longer exist — the shipped worker listed './index.html'
 * and nothing else, which meant an offline second visit booted a shell whose
 * script tags pointed at bundles the browser had never stored. The app claimed
 * to work offline and did not.
 *
 * This walks dist/ after the build and writes the actual asset list plus a
 * content-derived cache version into dist/sw.js. Any change to the bundles
 * changes the version, so the old cache is dropped on the next visit.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dist = path.resolve(process.argv[2] || 'dist');
const swPath = path.join(dist, 'sw.js');

if (!fs.existsSync(swPath)) {
  console.error('build-sw: no dist/sw.js found; run vite build first.');
  process.exit(1);
}

/**
 * Folders that are fetched lazily and must NOT be precached.
 *
 * pdf.js pulls a CMap or a standard font only when a document actually needs
 * one — 1.85 MB of them exist, and precaching the whole set would make every
 * first visit download all of it to serve the rare CJK file. They are still
 * cached after use by the worker's stale-while-revalidate handler, so the
 * second visit to the same document works offline.
 */
const LAZY_DIRS = ['cmaps/', 'standard_fonts/'];

/** Every file the app needs to boot and run offline. */
function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, rel));
      continue;
    }
    /* The worker cannot cache itself usefully, and sourcemaps are dev-only. */
    if (rel === 'sw.js' || rel.endsWith('.map')) continue;
    /* Lazy-by-design payloads: see LAZY_DIRS. */
    if (LAZY_DIRS.some((d) => rel.startsWith(d))) continue;
    out.push(rel);
  }
  return out;
}

const files = walk(dist).sort();
const precache = ['./', ...files.map((f) => `./${f}`)];

/* Hash the file list together with the entry bundle's name: that name already
 * changes whenever any source file changes, so it is a cheap, stable version. */
const entry = files.find((f) => /^assets\/index-.*\.js$/.test(f)) || '';
const version = crypto
  .createHash('sha256')
  .update(files.join('\n'))
  .update(entry)
  .digest('hex')
  .slice(0, 10);

let source = fs.readFileSync(swPath, 'utf8');
source = source.replace('/* __PRECACHE__ */', `self.__PRECACHE__ = ${JSON.stringify(precache, null, 0)};`);
source = source.replace(/__VERSION__/g, version);
fs.writeFileSync(swPath, source);

const bytes = precache.length;
const lazy = files.length - (precache.length - 1);
console.log(
  `build-sw: precached ${bytes} files (${lazy} lazy assets left to on-demand caching), cache version ${version}`,
);
