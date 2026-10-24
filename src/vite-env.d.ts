/// <reference types="vite/client" />

/*
 * Vite's client types cover CSS side-effect imports and `?url` asset imports,
 * but the pdf.js worker is resolved through a subpath that the default
 * declarations do not know about, so declare it explicitly.
 */
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const src: string;
  export default src;
}
