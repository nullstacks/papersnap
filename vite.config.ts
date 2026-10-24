import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';

/*
 * GitHub Pages project sites are served from /<repo>/ — pass
 * `--base=/<repo>/` (npm run build:pages) or set BASE_PATH in CI.
 * HashRouter keeps every deep link working without a 404.html shim.
 */
export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwind()],
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
