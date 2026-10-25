/*
 * Regression checks for the pure logic behind this round of fixes.
 *
 * The repo has no test runner, and adding one (vitest, jsdom, a config, a CI
 * step) is a larger decision than this change set should make on its own. So
 * this file is a plain Node script: it loads the REAL TypeScript sources,
 * transpiles them with the TypeScript compiler that is already installed, and
 * asserts on real behaviour. Run it with:
 *
 *   node scripts/check-regressions.mjs
 *
 * Everything here covers logic that was actually wrong or untested before:
 * page-range clamping, the image accept filter, byte formatting, and the two
 * predicates that decide what the HTML sanitiser strips.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log('       ' + String(err && err.message ? err.message : err).split('\n')[0]);
  }
}

/**
 * Load named exports out of a TypeScript module.
 *
 * Relative imports are followed, `@/` resolves against src/, and the result is
 * transpiled to CommonJS in memory — no build step, no bundler, no globals.
 */
function loadModule(entry, seen = new Map()) {
  const file = entry.startsWith('@/')
    ? path.join(root, 'src', entry.slice(2))
    : path.resolve(entry);
  const withExt = [file, file + '.ts', path.join(file, 'index.ts')].find((f) => {
    try {
      return readFileSync(f);
    } catch {
      return false;
    }
  });
  if (!withExt) throw new Error('cannot resolve ' + entry);
  if (seen.has(withExt)) return seen.get(withExt);

  const source = readFileSync(withExt, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });

  const exportsObj = {};
  seen.set(withExt, exportsObj);
  const moduleObj = { exports: exportsObj };
  const requireShim = (spec) => {
    if (spec.startsWith('.') || spec.startsWith('@/')) {
      const dir = path.dirname(withExt);
      const target = spec.startsWith('@/')
        ? path.join(root, 'src', spec.slice(2))
        : path.resolve(dir, spec);
      return loadModule(spec.startsWith('@/') ? target : target, seen);
    }
    /* Anything else is a real dependency this script does not need. */
    return {};
  };
  new Function('exports', 'module', 'require', outputText)(exportsObj, moduleObj, requireShim);
  return exportsObj;
}

/* ------------------------------------------------------------- page ranges */

console.log('\npage ranges (src/lib/ranges.ts)');
const { parseRanges, parseRangeGroups } = loadModule('@/lib/ranges');

test('parses a simple expression', () => {
  assert.deepEqual(parseRanges('1-3,5', 10), [0, 1, 2, 4]);
});

test('empty expression means every page', () => {
  assert.deepEqual(parseRanges('', 4), [0, 1, 2, 3]);
});

test('open-ended "3-" runs to the last page', () => {
  assert.deepEqual(parseRanges('3-', 5), [2, 3, 4]);
});

test('open-ended "-2" starts at page one', () => {
  assert.deepEqual(parseRanges('-2', 5), [0, 1]);
});

test('out-of-range pages are ignored', () => {
  assert.deepEqual(parseRanges('8-12', 10), [7, 8, 9]);
});

test('a reversed span still reads low-to-high', () => {
  assert.deepEqual(parseRanges('5-3', 6), [2, 3, 4]);
});

/*
 * The bug this guards: "-1000000000" used to drive a billion-iteration loop on
 * the main thread — measured at 39.6 seconds of a frozen tab — because the
 * panel re-parses on every keystroke.
 */
test('a huge open-ended start does not hang the thread', () => {
  const started = Date.now();
  parseRanges('-1000000000', 10);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 1000, `took ${elapsed}ms, expected well under a second`);
});

test('a huge closed span does not hang the thread', () => {
  const started = Date.now();
  const out = parseRanges('1-999999999', 1);
  const elapsed = Date.now() - started;
  assert.deepEqual(out, [0]);
  assert.ok(elapsed < 1000, `took ${elapsed}ms`);
});

test('splitting with no expression keeps the whole document', () => {
  assert.deepEqual(parseRangeGroups('', 3), [[0, 1, 2]]);
});

test('splitting groups each comma chunk separately', () => {
  assert.deepEqual(parseRangeGroups('1-2,4', 5), [[0, 1], [3]]);
});

/* ------------------------------------------------------------------- format */

console.log('\nformat helpers (src/lib/format.ts)');
const { prettySize, baseName, pageSize, isImage, isPdf } = loadModule('@/lib/format');

test('prettySize formats bytes, KB and MB', () => {
  assert.equal(prettySize(0), '0 KB');
  assert.equal(prettySize(512), '512 B');
  assert.equal(prettySize(2048), '2 KB');
  assert.equal(prettySize(5 * 1024 * 1024), '5 MB');
});

test('baseName strips only the last extension', () => {
  assert.equal(baseName('report.final.pdf'), 'report.final');
  assert.equal(baseName('noext'), 'noext');
});

test('pageSize falls back to A4 for unknown names', () => {
  assert.deepEqual(pageSize('nope'), { width: 595.28, height: 841.89 });
});

const file = (name, type) => ({ name, type });

test('accepts the image formats browsers really decode', () => {
  for (const [name, type] of [
    ['a.jpg', 'image/jpeg'],
    ['a.png', 'image/png'],
    ['a.webp', 'image/webp'],
    ['a.gif', 'image/gif'],
    ['a.bmp', 'image/bmp'],
    ['a.avif', 'image/avif'],
  ]) {
    assert.equal(isImage(file(name, type)), true, name);
  }
});

test('rejects image formats the decode path cannot handle', () => {
  for (const [name, type] of [
    ['a.tiff', 'image/tiff'],
    ['a.heic', 'image/heic'],
    ['a.raw', 'image/x-canon-cr2'],
  ]) {
    assert.equal(isImage(file(name, type)), false, name);
  }
});

test('recognises PDFs by type and by extension', () => {
  assert.equal(isPdf(file('a.pdf', '')), true);
  assert.equal(isPdf(file('a.bin', 'application/pdf')), true);
  assert.equal(isPdf(file('a.png', 'image/png')), false);
});

/* ---------------------------------------------------------------- sanitiser */

console.log('\nHTML sanitizer (src/lib/sanitize.ts)');

/*
 * The sanitiser itself needs a DOM, which this script deliberately does not
 * provide. What is testable without one — and what actually carries the
 * security decision — are the two predicates that classify a URL, so those are
 * exercised directly by pulling the module source and evaluating just them.
 */
const sanitizeSource = readFileSync(path.join(root, 'src/lib/sanitize.ts'), 'utf8');
const predicates = sanitizeSource.slice(
  sanitizeSource.indexOf('function isRemoteUrl'),
  sanitizeSource.indexOf('/** Strip scripts'),
);
const { outputText: predicateJs } = ts.transpileModule(
  predicates + '\nexport { isRemoteUrl, stripRemoteCss };',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
);
const predicateExports = {};
new Function('exports', 'module', predicateJs)(predicateExports, { exports: predicateExports });
const { isRemoteUrl, stripRemoteCss } = predicateExports;

test('remote URLs are recognised however they are spelled', () => {
  assert.equal(isRemoteUrl('https://attacker.example/x?d=1'), true);
  assert.equal(isRemoteUrl('http://attacker.example/x'), true);
  assert.equal(isRemoteUrl('//attacker.example/x'), true);
  assert.equal(isRemoteUrl('data:image/png;base64,AAA'), false);
  assert.equal(isRemoteUrl('blob:http://localhost/abc'), false);
});

test('remote CSS url() references are neutralised', () => {
  const out = stripRemoteCss("background:url('https://tracker.example/p.gif')");
  assert.ok(!out.includes('tracker.example'), out);
  assert.ok(out.includes('none'), out);
});

test('inline data: images survive sanitising', () => {
  const out = stripRemoteCss('background:url(data:image/png;base64,AAA)');
  assert.ok(out.includes('data:image/png'), out);
});

/* ------------------------------------------------------- pdf.js asset paths */

console.log('\npdf.js assets (src/lib/pdf.ts + vite.config.ts)');

/*
 * These guard a bug that was invisible until a Chinese PDF was opened: with no
 * cMapUrl the extracted text was empty and rendering failed outright, and
 * without standardFontDataUrl the same document rendered differently on every
 * operating system. Neither shows up in a build log, so the wiring is asserted
 * here.
 */
const pdfSource = readFileSync(path.join(root, 'src/lib/pdf.ts'), 'utf8');
const viteSource = readFileSync(path.join(root, 'vite.config.ts'), 'utf8');

test('the render loader passes cMapUrl and cMapPacked', () => {
  const loader = pdfSource.slice(pdfSource.indexOf('export async function loadForView'));
  const body = loader.slice(0, loader.indexOf('\n}'));
  assert.ok(/cMapUrl:/.test(body), 'cMapUrl is missing');
  assert.ok(/cMapPacked: true/.test(body), 'cMapPacked is missing');
});

test('the render loader passes standardFontDataUrl and stops using system fonts', () => {
  const loader = pdfSource.slice(pdfSource.indexOf('export async function loadForView'));
  const body = loader.slice(0, loader.indexOf('\n}'));
  assert.ok(/standardFontDataUrl:/.test(body), 'standardFontDataUrl is missing');
  assert.ok(/useSystemFonts: false/.test(body), 'useSystemFonts must be false');
});

test('the asset URLs honour the deployment base path', () => {
  assert.ok(
    /BASE_URL\}cmaps\//.test(pdfSource),
    'cmaps URL must be built from import.meta.env.BASE_URL or GitHub Pages will 404',
  );
  assert.ok(/BASE_URL\}standard_fonts\//.test(pdfSource), 'standard font URL must use BASE_URL');
});

test('the vite plugin copies both asset folders into the build', () => {
  for (const dir of ['cmaps', 'standard_fonts']) {
    assert.ok(viteSource.includes(`'${dir}'`), `vite config does not copy ${dir}`);
  }
  assert.ok(/closeBundle/.test(viteSource), 'assets are only copied on build, not dev');
});

test('the service worker does not precache the lazy pdf.js assets', () => {
  const swSource = readFileSync(path.join(root, 'scripts/build-sw.mjs'), 'utf8');
  assert.ok(
    /LAZY_DIRS/.test(swSource) && /'cmaps\/'/.test(swSource),
    'cmaps must be excluded from the precache list, or every first visit downloads 1.1 MB',
  );
});

/* ------------------------------------------------------- SEO / prerendering */

console.log('\nSEO wiring (toolSeo.ts, prerender.mjs, main.tsx)');

const seoSource = readFileSync(path.join(root, 'src/content/toolSeo.ts'), 'utf8');
const prerenderSource = readFileSync(path.join(root, 'scripts/prerender.mjs'), 'utf8');
const mainSource = readFileSync(path.join(root, 'src/main.tsx'), 'utf8');

test('every visible tool has long-form copy', () => {
  const catalogue = loadModule('@/content/tools');
  const seoKeys = new Set([...seoSource.matchAll(/^  '([a-z0-9-]+)': \{/gm)].map((m) => m[1]));
  const visible = Object.keys(catalogue.ALL_TOOL_BY_SLUG).filter(
    (s) => !catalogue.ALL_TOOL_BY_SLUG[s].hidden,
  );
  const missing = visible.filter((s) => !seoKeys.has(s));
  assert.deepEqual(missing, [], `no copy for: ${missing.join(', ')}`);
});

test('copy is substantial enough to rank, not a stub', () => {
  const entries = [...seoSource.matchAll(/lead:\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  assert.ok(entries.length >= 30, `expected >=30 leads, found ${entries.length}`);
  const short = entries.filter((t) => t.length < 200);
  assert.deepEqual(short, [], `${short.length} leads under 200 chars`);
});

test('the router no longer hides routes behind a hash', () => {
  assert.ok(/BrowserRouter/.test(mainSource), 'BrowserRouter is required for crawlable paths');
  /* Assert on the JSX usage, not the word: the file's comment legitimately
   * explains why HashRouter was abandoned, and matching prose would report a
   * regression that does not exist. */
  assert.ok(!/<HashRouter/.test(mainSource), 'HashRouter element would collapse every route into one URL');
  assert.ok(!/from 'react-router-dom'[^;]*HashRouter/.test(mainSource), 'HashRouter must not be imported');
});

test('legacy hash links are migrated, not broken', () => {
  assert.ok(/#\//.test(mainSource) && /replaceState/.test(mainSource), 'hash redirect shim missing');
});

test('prerender emits canonical, per-page title and structured data', () => {
  for (const token of ['rel="canonical"', 'og:url', 'application/ld+json', 'canonical']) {
    assert.ok(prerenderSource.includes(token), `prerender does not emit ${token}`);
  }
});

test('prerender injects crawlable body content', () => {
  assert.ok(
    /<div id="root">\$\{bodyFor/.test(prerenderSource),
    'prerendered pages must carry real content in #root, not an empty div',
  );
});

/* -------------------------------------------------------- PDF unlock logic */

console.log('\nunlock decision path (src/tools/security.tsx)');

/*
 * Guests this bug: the empty string is a REAL password.
 *
 * Most "protected" PDFs carry an owner password only, with an empty user
 * password — they open in any viewer without prompting. The tool converted
 * "no password typed" to `undefined`, pdf-lib refused the encrypted document,
 * the error matched /encrypt/, and the visitor was told their file needed a
 * password they had never set. Every owner-only PDF failed.
 */
const securitySource = readFileSync(path.join(root, 'src/tools/security.tsx'), 'utf8');

/*
 * Bound the slice to the unlock implementation. Running to end-of-file would
 * also capture the Protect tool, which genuinely calls doc.save() on a document
 * it just encrypted — that is correct behaviour there, and matching it here
 * would report a regression that does not exist.
 */
const unlockStart = securitySource.indexOf('async function openDecrypted');
const protectAt = securitySource.indexOf('export const protectTool');
const openFn = securitySource.slice(unlockStart, protectAt > 0 ? protectAt : undefined);
assert.ok(protectAt > unlockStart, 'could not bound the unlock block; fix this test rather than the code');

test('an empty password is attempted, not converted to undefined', () => {
  assert.ok(
    /candidates\.push\(''\)/.test(openFn),
    'openDecrypted must try "" — passing undefined makes pdf-lib refuse owner-only PDFs',
  );
});

test('a typed password takes precedence over the empty fallback', () => {
  assert.ok(/if \(typed\)/.test(openFn), 'typed passwords must be tried first');
  /* Assert on executable code, not prose: the comment above the function quotes
   * the old `password || undefined` expression to explain the bug, so a naive
   * source-wide match reports a regression that does not exist. */
  const codeOnly = securitySource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert.ok(
    !/password \|\| undefined/.test(codeOnly),
    'the old "password || undefined" coercion is the bug; it must not return',
  );
});

test('unlock rebuilds instead of re-saving the opened document', () => {
  assert.ok(/out\.copyPages/.test(openFn), 'unlock must rebuild pages into a fresh document');
  /* Strip comments first: the doc comment explains that save() re-emits the
   * trailer, and that mention is not a regression. */
  const codeOnly = openFn
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert.ok(
    !/doc\.save\(\)/.test(codeOnly),
    'saving the opened document preserves /Encrypt and leaves the file still locked',
  );
});

test('the /Encrypt dictionary check exists so plain files pass through untouched', () => {
  assert.ok(/bytesHasEncryptDict/.test(securitySource), 'plain files must not be rewritten');
});

/* ------------------------------------------------------------------ report */

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
