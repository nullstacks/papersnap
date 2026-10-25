import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const headersFile = fs.existsSync(path.join(root, '_headers')) ? fs.readFileSync(path.join(root, '_headers'), 'utf8') : '';

/* Parse _headers the way Cloudflare does: blocks of "pattern" + indented headers. */
const rules = [];
let cur = null;
for (const line of headersFile.split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) { cur = { pattern: line.trim(), headers: {} }; rules.push(cur); continue; }
  const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
  if (m && cur) cur.headers[m[1]] = m[2];
}
const matchRules = (p) => {
  const out = {};
  for (const r of rules) {
    const pat = r.pattern.replace(/\*/g, '.*');
    if (new RegExp('^' + pat + '$').test(p) || (r.pattern.endsWith('/*') && p.startsWith(r.pattern.slice(0, -1)))) {
      Object.assign(out, r.headers);
    }
  }
  return out;
};

const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.xml':'application/xml','.txt':'text/plain','.webmanifest':'application/manifest+json','.bcmap':'application/octet-stream','.pfb':'application/octet-stream','.woff2':'font/woff2' };

http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(root, urlPath);
  let status = 200;

  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    /* Cloudflare html_handling auto-trailing-slash: /slug -> /slug/index.html */
    const alt = path.join(root, urlPath, 'index.html');
    if (fs.existsSync(alt)) { file = alt; }
    else { file = path.join(root, '404.html'); status = 404; }
  }
  if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }

  const ext = path.extname(file).toLowerCase();
  const extra = matchRules(urlPath);
  res.writeHead(status, { 'content-type': MIME[ext] || 'application/octet-stream', ...extra });
  fs.createReadStream(file).pipe(res);
}).listen(4402, '127.0.0.1', () => console.log('cf-sim on 4402'));
