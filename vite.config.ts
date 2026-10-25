import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

/*
 * pdf.js loads two OPTIONAL asset sets at runtime, by URL, and only when a
 * document needs them:
 *
 *   cmaps/          – character maps for CJK and other non-Latin encodings.
 *                     Without them, text extraction throws "Ensure that the
 *                     cMapUrl and cMapPacked API parameters are provided" and
 *                     the page fails to render.
 *   standard_fonts/ – the 14 standard PDF fonts. Without them pdf.js falls
 *                     back to whatever font the OS happens to have, so the
 *                     same document renders differently on every machine.
 *
 * They are copied verbatim into the build output instead of being imported,
 * because they are fetched lazily by path — bundling them would put 1.85 MB
 * on the wire for every visitor who never opens a CJK document. Vite only
 * copies `public/`, so this plugin does it, in both dev and build.
 */
function pdfjsAssets(): Plugin {
  const pairs = ['cmaps', 'standard_fonts'].map(
    (dir) => [path.resolve(__dirname, 'node_modules/pdfjs-dist', dir), dir] as const,
  );
  return {
    name: 'papersnap:pdfjs-assets',
    /* Dev: serve them straight off disk so behaviour matches production. */
    configureServer(server) {
      for (const [from, to] of pairs) {
        if (!fs.existsSync(from)) continue;
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        server.middlewares.use(`/${to}`, (req, res, next) => {
          const rel = decodeURIComponent((req.url || '/').split('?')[0]);
          const file = path.join(from, rel);
          if (!file.startsWith(from) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            next();
            return;
          }
          fs.createReadStream(file).pipe(res as unknown as NodeJS.WritableStream);
        });
      }
    },
    /* Build: emit them at the top of dist/, next to the html. */
    closeBundle() {
      for (const [from, to] of pairs) {
        if (!fs.existsSync(from)) continue;
        fs.cpSync(from, path.resolve(__dirname, 'dist', to), { recursive: true });
      }
    },
  };
}

/*
 * GitHub Pages project sites are served from /<repo>/ — pass
 * `--base=/<repo>/` (npm run build:pages) or set BASE_PATH in CI.
 * HashRouter keeps every deep link working without a 404.html shim.
 */
export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwind(), pdfjsAssets()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    target: 'es2022',
    sourcemap: mode !== 'production',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          /* pdf-lib and pdf.js are both large; keep them out of the entry chunk
             so the landing page loads fast and the viewer loads on demand. */
          pdflib: ['@cantoo/pdf-lib'],
          pdfjs: ['pdfjs-dist'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  worker: { format: 'es' },
  server: {
    port: 5173,
    watch: {
      /*
       * The editor that writes this repo's files leaves short-lived temp
       * directories behind (".NAME.<pid>.<uuid>.tmpdir"), and watching one of
       * them throws EBUSY on Windows, which kills the whole dev server. Nothing
       * under these paths is ever served, so ignoring them is both safe and
       * what keeps a long editing session alive.
       */
      ignored: ['**/*.tmpdir/**', '**/.*.tmp', '**/_ref/**', '**/_gen/**', '**/dist/**'],
    },
  },
}));
