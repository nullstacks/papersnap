/*
 * Keep the CSP in step with the inline theme script.
 *
 * index.html carries a tiny inline <script> that applies the saved theme
 * before first paint, which is what stops a light-to-dark flash on every
 * visit. `script-src 'self'` blocks inline scripts, so the policy needs its
 * SHA-256 hash — and a hand-maintained hash silently rots the moment that
 * snippet changes, taking the anti-flash behaviour with it.
 *
 * This recomputes the hash from the BUILT index.html and writes it into
 * dist/_headers, so the two can never disagree.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dist = path.resolve('dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

const hashes = [];
const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
let match;
while ((match = re.exec(html))) {
  const body = match[1];
  if (!body.trim()) continue;
  hashes.push(`'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`);
}

const headersPath = path.join(dist, '_headers');
if (!fs.existsSync(headersPath)) {
  console.warn('csp-hash: dist/_headers missing, nothing to patch');
  process.exit(0);
}

let headers = fs.readFileSync(headersPath, 'utf8');
headers = headers.replace(
  /script-src 'self'[^;]*;/,
  `script-src 'self'${hashes.length ? ' ' + hashes.join(' ') : ''};`,
);
fs.writeFileSync(headersPath, headers);

console.log(`csp-hash: script-src now allows ${hashes.length} inline hash(es)`);
