/**
 * Tool registry.
 *
 * Implementations are loaded on demand: the PDF engine (pdf-lib + pdf.js)
 * weighs close to a megabyte, and the landing page has no use for it. Each slug
 * maps to a dynamic import, so only the tool the visitor opens is fetched.
 *
 * `import.meta.glob` keeps this list from drifting out of sync with the files
 * on disk — adding a tool module is enough to register it.
 */
import type { ToolImpl } from '@/types';

type Loader = () => Promise<ToolImpl>;

/* Eager (but still separate) import maps: each file is its own async chunk. */
const modules = import.meta.glob<Record<string, ToolImpl>>('./*.tsx');

/** Resolve an exported implementation by module file and export name. */
function pick(file: string, exportName: string): Loader {
  const key = `./${file}`;
  const load = modules[key];
  if (!load) return () => Promise.reject(new Error(`Missing tool module ${file}`));
  return async () => {
    const mod = await load();
    const impl = mod[exportName];
    if (!impl) throw new Error(`${file} does not export ${exportName}`);
    return impl;
  };
}

const REGISTRY: Record<string, Loader> = {
  'merge-pdf': pick('organize.tsx', 'mergeTool'),
  'split-pdf': pick('organize.tsx', 'splitTool'),
  'remove-pages': pick('pages.tsx', 'removePagesTool'),
  'extract-pages': pick('pages.tsx', 'extractPagesTool'),
  'compress-pdf': pick('compress.tsx', 'compressTool'),
  'repair-pdf': pick('security.tsx', 'repairTool'),
  'unlock-pdf': pick('security.tsx', 'unlockTool'),
  'protect-pdf': pick('security.tsx', 'protectTool'),
  'sign-pdf': pick('stamp.tsx', 'signTool'),
  'watermark-pdf': pick('stamp.tsx', 'watermarkTool'),
  'rotate-pdf': pick('edit.tsx', 'rotateTool'),
  'page-numbers': pick('edit.tsx', 'pageNumbersTool'),
  'crop-pdf': pick('edit.tsx', 'cropTool'),
  'jpg-to-pdf': pick('convert.tsx', 'jpgToPdfTool'),
  'pdf-to-jpg': pick('convert.tsx', 'pdfToJpgTool'),
  'word-to-pdf': pick('office.tsx', 'wordToPdfTool'),
  'pdf-to-word': pick('office.tsx', 'pdfToWordTool'),
  'excel-to-pdf': pick('office.tsx', 'excelToPdfTool'),
  'pdf-to-excel': pick('office.tsx', 'pdfToExcelTool'),
  'html-to-pdf': pick('office.tsx', 'htmlToPdfTool'),
  'powerpoint-to-pdf': pick('slides.tsx', 'powerpointToPdfTool'),
  'pdf-to-powerpoint': pick('slides.tsx', 'pdfToPowerpointTool'),
  'convert-pdf-to-pdfa': pick('slides.tsx', 'pdfToPdfATool'),

  /* ---------------- image family (iLoveIMG parity) ---------------- */
  'compress-image': pick('imgOptimize.tsx', 'compressImageTool'),
  'resize-image': pick('imgOptimize.tsx', 'resizeImageTool'),
  'upscale-image': pick('imgOptimize.tsx', 'upscaleImageTool'),
  'crop-image': pick('imgEdit.tsx', 'cropImageTool'),
  'rotate-image': pick('imgEdit.tsx', 'rotateImageTool'),
  'watermark-image': pick('imgWatermark.tsx', 'watermarkImageTool'),
  'blur-face': pick('imgWatermark.tsx', 'blurFaceTool'),
  'remove-background': pick('imgWatermark.tsx', 'removeBgTool'),
  'meme-generator': pick('imgCreate.tsx', 'memeTool'),
  'photo-editor': pick('imgPhoneEditor.tsx', 'photoEditorTool'),
  'convert-to-jpg': pick('imgConvert.tsx', 'toJpgTool'),
  'jpg-to-image': pick('imgConvert.tsx', 'fromJpgTool'),
  'html-to-image': pick('imgConvert.tsx', 'htmlToImageTool'),
};

/** Load a tool's implementation. Resolves to null when the slug is unknown. */
export async function loadImplementation(slug: string): Promise<ToolImpl | null> {
  const loader = REGISTRY[slug];
  if (!loader) return null;
  return loader();
}

export const IMPLEMENTED_SLUGS = Object.keys(REGISTRY);
