/**
 * Long-form copy that gives each tool page something worth indexing.
 *
 * The catalogue in `tools.ts`/imageTools.ts holds one line per tool — the
 * headline and a sentence — which was fine when every route lived behind a
 * hash and no crawler could see it. Prerendering turned those routes into real
 * pages, and a real page carrying 16 words is a thin-content liability rather
 * than an asset: it gives a search engine a reason to index a URL and nothing
 * to rank it for.
 *
 * So each entry below adds, per tool:
 *   - `lead`     one substantial paragraph of plain explanation
 *   - `how`      the numbered steps a person actually takes
 *   - `faq`      question/answer pairs, also emitted as FAQPage structured data
 *   - `privacy`  what happens to the file, specific to this tool
 *
 * Written to be true of the implementation, not aspirational. Where a tool has
 * a real limitation (text-only conversion, rasterised compression) the copy
 * says so — an honest page converts better than a page that oversells and
 * disappoints on first use.
 *
 * Only visible tools are prerendered, so retired entries need no copy here.
 */

export interface ToolFaqItem {
  q: string;
  a: string;
}

export interface ToolSeo {
  /** One paragraph, roughly 60-90 words, stating what the tool does and why local matters. */
  lead: string;
  /** Ordered steps for the page's "How to" block. */
  how: string[];
  /** Two to four honest Q&A pairs. */
  faq: ToolFaqItem[];
  /** What happens to the uploaded file, specific to this tool. */
  privacy: string;
}

export const TOOL_SEO: Record<string, ToolSeo> = {
  'merge-pdf': {
    lead: 'Merge PDF combines several documents into one file, in exactly the order you arrange them. Drag the file cards to reorder, then combine: page structure, bookmarks and text stay intact because the merge copies whole pages rather than flattening them. Because the work happens in your browser, a confidential contract can be combined with an appendix without either file being uploaded to a server first.',
    how: [
      'Select two or more PDF files, or drop them onto the page.',
      'Drag the file cards into the order you want the pages to appear.',
      'Press Merge PDF and download the combined document.',
    ],
    faq: [
      { q: 'Is there a limit on how many PDFs I can merge?', a: 'No fixed limit is imposed by the tool. The practical ceiling is your device\'s memory, since every page is held in the tab while the new document is built.' },
      { q: 'Can I merge a password-protected PDF?', a: 'Not directly. Merge PDF reports that the file is protected and asks you to unlock it first, rather than silently producing a document with blank pages.' },
      { q: 'Does merging reduce quality?', a: 'No. Pages are copied as-is; the text layer, embedded images and vector content are not re-rendered or re-compressed.' },
    ],
    privacy: 'Both PDFs are read with the File API and the merged result is handed back as a download. Neither file is transmitted anywhere — the network tab stays empty for the whole operation.',
  },
  'split-pdf': {
    lead: 'Split PDF breaks one document into several, either at every page or at the ranges you specify. Type an expression such as 1-3,7,10-12 and each comma-separated group becomes its own file, which is the fast way to turn a scanned batch into separate documents. The split copies pages into fresh PDFs, so the original is never modified.',
    how: [
      'Select the PDF you want to divide.',
      'Enter the ranges you want, one file per comma-separated group — or leave it empty to split every page.',
      'Press Split PDF and download the resulting files.',
    ],
    faq: [
      { q: 'What range syntax does it accept?', a: 'Comma-separated groups such as 1-3,5,8-10. An open range like 3- means page 3 to the end, and -4 means pages 1 through 4.' },
      { q: 'What happens if I type a page that does not exist?', a: 'Out-of-range pages are ignored rather than causing an error, and the expression is clamped to the document length so a typo cannot hang the tab.' },
      { q: 'Can I split into single pages?', a: 'Yes — leave the range box empty and every page becomes a separate PDF.' },
    ],
    privacy: 'The PDF is opened in the tab and the pieces are written back as downloads. No upload takes place.',
  },
  'compress-pdf': {
    lead: 'Compress PDF reduces file size by re-encoding each page as an image at the quality you choose. That is the same trade-off the online services make, and it is worth understanding before you use it: at the strongest setting the text layer is replaced, so the result is no longer selectable or searchable. If the re-encoded file would not be smaller than the original, the original is returned unchanged rather than a larger file with a smaller-sounding name.',
    how: [
      'Select the PDF you want to shrink.',
      'Choose a compression level — extreme, recommended or less compression.',
      'Press Compress PDF and check the before/after figures on the result page.',
    ],
    faq: [
      { q: 'Will my text still be selectable?', a: 'No. Compression rasterises each page, so text becomes part of the image. If you need a searchable file, keep the original.' },
      { q: 'Why is my file the same size after compressing?', a: 'The tool will not hand back a bigger file. When rasterising would increase the size — common with already-image-heavy PDFs — you get the original bytes back and the result page says so plainly.' },
      { q: 'Can I compress a password-protected PDF?', a: 'Unlock it first. Compression needs to render every page, which a protected document will not allow without the password.' },
    ],
    privacy: 'Every page is rendered to a canvas inside your browser and re-embedded into a new PDF. Nothing is uploaded.',
  },
  'remove-pages': {
    lead: 'Remove pages deletes the pages you do not want and returns a clean copy. The page grid is the point of this tool: thumbnails are rendered at a legible size so you can click the pages that should go rather than trusting a page number, and shift-click selects a range. The original file is untouched — you get a new document containing only the pages you kept.',
    how: [
      'Select the PDF you want to edit.',
      'Click pages in the grid to mark them for removal, using shift-click for a range — or type the numbers instead.',
      'Press Remove pages and download the result.',
    ],
    faq: [
      { q: 'Can I undo a removal?', a: 'Yes, before you download: click a marked page again to unmark it. The source file is never modified, so you can also simply run the tool again.' },
      { q: 'How do I remove a large range quickly?', a: 'Click the first page, then shift-click the last one. You can also type a range such as 4-9 in the box.' },
      { q: 'What if I remove every page?', a: 'The tool stops and asks for at least one page to remain, since a PDF cannot have zero pages.' },
    ],
    privacy: 'Pages are dropped by copying the kept ones into a new document in the tab. Nothing leaves the device.',
  },
  'extract-pages': {
    lead: 'Extract pages produces a new PDF containing only the pages you select, leaving the original file completely untouched. It is the inverse of Remove pages and the right tool when you need to pull a chapter, an invoice or a signed page out of a longer document without disturbing anything else.',
    how: [
      'Select the PDF to extract from.',
      'Click the pages you want to keep, or type a range.',
      'Press Extract pages and download the new document.',
    ],
    faq: [
      { q: 'Does this change my original file?', a: 'No. The original is never written to; extraction reads it and produces a separate file.' },
      { q: 'Can I extract non-consecutive pages?', a: 'Yes. Click any combination of pages, or type ranges like 1-2,5,9-11.' },
      { q: 'Are bookmarks and links preserved?', a: 'Page content is preserved. Document-level bookmarks that point outside the extracted set may no longer resolve.' },
    ],
    privacy: 'The document is opened locally and the extracted pages are saved as a new download. No upload.',
  },
  'repair-pdf': {
    lead: 'Repair PDF rebuilds a damaged or unreadable PDF by copying its readable pages into a fresh document with a clean file structure. It is the recovery step for a file that a viewer refuses to open, or that opens with an error about a damaged cross-reference table — usually the result of an interrupted download or a partial copy. What it cannot do is reconstruct content that is genuinely absent from the file.',
    how: [
      'Select the damaged PDF.',
      'Press Repair PDF.',
      'Download the rebuilt document and check that the pages you need are present.',
    ],
    faq: [
      { q: 'What kind of damage can it fix?', a: 'Structural problems — a broken cross-reference table, an incomplete object tree, trailing garbage from an interrupted transfer. It rebuilds the file around the pages it can still read.' },
      { q: 'Can it recover a zero-byte file?', a: 'No. If the bytes are not there, there is nothing to rebuild.' },
      { q: 'Will the repaired file be identical to the original?', a: 'For the recovered pages, yes in content. Document-level metadata and any damaged outline entries may be lost.' },
    ],
    privacy: 'The damaged file is repaired in the browser tab and the rebuilt document is downloaded. Nothing is uploaded — which matters when the broken file is the only copy you have.',
  },
  'blur-face': {
    lead: 'Blur face obscures faces in a photo before you share it. Automatic detection scans for skin-toned regions and blurs what it finds; where that guess is wrong, or misses someone, you can draw the regions yourself with the region editor. Manual drawing is the reliable path — it is what you should use for anything where being wrong actually matters.',
    how: [
      'Select a photo.',
      'Run the automatic scan, or draw over the faces you want hidden.',
      'Adjust the strength, then download the blurred image.',
    ],
    faq: [
      { q: 'Is the automatic detection reliable?', a: 'No, and the panel says so. It is a skin-tone heuristic, not a face-recognition model — recognition models are large enough that shipping one would mean downloading tens of megabytes and running a neural network in the tab. Treat the automatic pass as a starting point and check the result.' },
      { q: 'Which should I use for a photo I am publishing?', a: 'Draw the blur regions manually, then look at the result closely. A heuristic can miss a face in profile, in shadow, or with unusual lighting.' },
      { q: 'Is the blur reversible?', a: 'The blurred pixels are re-encoded into the output image, so the original detail in those regions is gone. Your source file is untouched.' },
    ],
    privacy: 'The photo is decoded and blurred on a canvas in your browser. Face detection runs locally — no image is sent to a recognition service, which is the whole reason this tool exists.',
  },
  'jpg-to-pdf': {
    lead: 'JPG to PDF turns images into a single PDF, one image per page, with control over page size, orientation and margins. It is the usual way to submit photographed documents or scanned receipts as one file. Each image is embedded at its original resolution, so nothing is softened or re-compressed on the way in.',
    how: [
      'Select the images you want to combine, in any common format.',
      'Choose page size, orientation and margin.',
      'Press Convert to PDF and download the result.',
    ],
    faq: [
      { q: 'Which image formats can I use?', a: 'JPG, PNG, WebP, GIF, BMP and AVIF — the formats a browser can decode natively. TIFF and HEIC are not supported.' },
      { q: 'Does the image quality drop?', a: 'No. Images are embedded as they are; they are not resized or re-encoded.' },
      { q: 'Can I control the page order?', a: 'Yes — drag the file cards to reorder before converting.' },
    ],
    privacy: 'Images are decoded by the browser and embedded into a PDF built in the tab. Nothing is uploaded.',
  },
  'pdf-to-jpg': {
    lead: 'PDF to JPG renders each page of a PDF as a JPEG image. It is what you need when a page has to go somewhere that will not accept a PDF — a slide, a chat message, a preview thumbnail. Pages are rendered at a resolution you can read, and because the rendering is local, the document never has to be handed to a third party just to become a picture.',
    how: [
      'Select the PDF you want to convert.',
      'Press Convert to JPG.',
      'Download the images, one per page.',
    ],
    faq: [
      { q: 'What resolution are the images?', a: 'Pages are rendered at roughly twice their nominal size, which keeps text sharp on screen without producing enormous files.' },
      { q: 'Can I convert only some pages?', a: 'Yes — use the page range field to limit which pages are rendered.' },
      { q: 'Why do my JPEGs look slightly soft?', a: 'JPEG is lossy by design. If you need crisp output for print, keep the PDF or use a lossless format.' },
    ],
    privacy: 'Each page is drawn to a canvas in your browser and encoded to JPEG there. The PDF is never uploaded.',
  },
  'rotate-pdf': {
    lead: 'Rotate PDF turns pages that were scanned sideways or upside down, without re-rendering them. The rotation is written into the page geometry, so the text stays selectable and the file size barely changes — unlike the common workaround of screenshotting a page and re-inserting it.',
    how: [
      'Select the PDF.',
      'Use the rotate control on each file card to queue a clockwise turn.',
      'Press Rotate PDF and download the corrected document.',
    ],
    faq: [
      { q: 'Does rotating change the file size?', a: 'Only marginally. The page content is not re-encoded; the rotation is recorded in the page structure.' },
      { q: 'Will the text still be selectable?', a: 'Yes. Unlike rasterising, rotation preserves the original text layer.' },
      { q: 'Can I rotate only some pages?', a: 'The rotation applies to the pages you queue it on; all pages of a selected file rotate together in this version.' },
    ],
    privacy: 'The rotation is applied to the document structure in the tab and the new bytes are downloaded. No upload.',
  },
  'page-numbers': {
    lead: 'Page numbers stamps a numbering sequence onto your PDF — useful when you have merged several documents and need continuous numbering across the result. You choose the position, the starting number and the format, and the numbers are drawn as real PDF text, so they remain selectable and searchable.',
    how: [
      'Select the PDF you want to number.',
      'Choose the position, format and starting number.',
      'Press Add page numbers and download the result.',
    ],
    faq: [
      { q: 'Can I start numbering at a number other than 1?', a: 'Yes, set the starting number in the options panel.' },
      { q: 'Can I skip the first page?', a: 'Yes — set the range so numbering begins on the page you want.' },
      { q: 'Are the numbers real text?', a: 'Yes, they are drawn with an embedded font, so they stay selectable rather than becoming part of an image.' },
    ],
    privacy: 'Numbers are drawn onto the existing pages in the browser. The file is never uploaded.',
  },
  'watermark-pdf': {
    lead: 'Watermark PDF overlays text or an image onto every page — a draft notice, a company mark, a confidentiality warning. You control the position, rotation, opacity and size, so the mark can be a subtle corner stamp or a bold diagonal across the page. Because it is applied on your device, an unreleased document can be watermarked before it is ever shared.',
    how: [
      'Select the PDF.',
      'Choose a text or image watermark and adjust position, angle, opacity and size.',
      'Press Add watermark and download the result.',
    ],
    faq: [
      { q: 'Can I use a logo instead of text?', a: 'Yes — switch the watermark type to image and pick a PNG. Transparency is preserved.' },
      { q: 'Can the watermark be removed afterwards?', a: 'It is drawn into the page content, so it cannot be dismissed as a layer in a viewer. It is not a cryptographic guarantee, but it is not a toggle either.' },
      { q: 'Does it apply to every page?', a: 'Yes, by default the watermark is placed on all pages.' },
    ],
    privacy: 'The mark is composited onto each page locally. Neither the PDF nor your logo is uploaded.',
  },
  'crop-pdf': {
    lead: 'Crop PDF trims the margins from every page by adjusting the visible page box. That is the right way to crop a PDF: rather than rasterising the page and cutting pixels, it changes what the viewer displays, so the file stays small and the text stays sharp and selectable.',
    how: [
      'Select the PDF.',
      'Set the margins you want to trim from each edge.',
      'Press Crop PDF and download the result.',
    ],
    faq: [
      { q: 'Does cropping delete the trimmed content?', a: 'It becomes invisible rather than deleted — the crop box defines what is shown, which is how PDF cropping is defined. That keeps the operation reversible and lossless.' },
      { q: 'Will the text stay selectable?', a: 'Yes. Nothing is re-rendered.' },
      { q: 'Can I crop to an exact size?', a: 'The panel trims by margin, which covers the usual case of removing scanner borders.' },
    ],
    privacy: 'Page geometry is rewritten in the tab and the new file is downloaded. No upload.',
  },
  'unlock-pdf': {
    lead: 'Unlock PDF removes password protection from a document you own, so it can be opened without a prompt. If the file needs a password to open at all, you supply it once here. The output is rebuilt page by page into a genuinely unencrypted document — not a re-saved copy that still carries the original encryption dictionary.',
    how: [
      'Select the protected PDF.',
      'Enter its password if it requires one to open.',
      'Press Unlock PDF and download the unprotected copy.',
    ],
    faq: [
      { q: 'What if I do not know the password?', a: 'Then the file cannot be unlocked. This tool removes protection from documents you can already open; it does not break encryption.' },
      { q: 'Is the password stored anywhere?', a: 'No. It lives only in the page\'s memory for the duration of the operation and is never written to storage, a URL, or a log.' },
      { q: 'Why did my file stay protected?', a: 'Older builds re-saved the document, which preserved the encryption dictionary. The current version rebuilds the file, which genuinely removes it.' },
    ],
    privacy: 'Decryption happens in the tab using the password you type. Neither the file nor the password is transmitted.',
  },
  'protect-pdf': {
    lead: 'Protect PDF encrypts a document with a password, so that opening it requires the password you set. Encryption uses AES-256, the current standard, and is applied before the file ever leaves the tab — which means the unencrypted version never exists anywhere except your device.',
    how: [
      'Select the PDF you want to protect.',
      'Type the password you want to require.',
      'Press Protect PDF and download the encrypted file.',
    ],
    faq: [
      { q: 'What encryption is used?', a: 'AES-256, applied by pdf-lib inside the browser.' },
      { q: 'Can I protect a PDF that is already protected?', a: 'Unlock it first, then protect the unlocked copy with a new password.' },
      { q: 'What happens if I forget the password?', a: 'There is no recovery. The file cannot be opened without it, by us or by anyone else.' },
    ],
    privacy: 'Encryption runs in the tab. The password and the document never leave your device.',
  },
  'sign-pdf': {
    lead: 'Sign PDF places your signature onto the page at the position and size you choose. You can draw or upload a signature image, then place it precisely rather than printing, signing and rescanning. The signature is embedded as an image in the page content.',
    how: [
      'Select the PDF to sign.',
      'Add your signature and position it on the page.',
      'Press Sign PDF and download the signed document.',
    ],
    faq: [
      { q: 'Is this a legally binding digital signature?', a: 'It is an image of a signature, which is what most everyday documents require. It is not a certificate-based cryptographic signature and will not satisfy workflows that demand one.' },
      { q: 'Can I place it on a specific page only?', a: 'Yes, the position controls let you place the signature precisely.' },
      { q: 'What image formats work for a signature?', a: 'PNG with a transparent background gives the cleanest result.' },
    ],
    privacy: 'Your signature image is placed onto the page in the browser. Neither the document nor your signature is uploaded.',
  },
  'word-to-pdf': {
    lead: 'Word to PDF converts a .docx file into a PDF by laying the document out in the browser and capturing the result. Text, headings, lists, tables and basic formatting carry across. Complex constructs — tracked changes, embedded charts, unusual fonts — will not survive intact, and the page says so rather than pretending otherwise.',
    how: [
      'Select the .docx file.',
      'Press Convert to PDF.',
      'Download the resulting PDF.',
    ],
    faq: [
      { q: 'Does it support .doc files?', a: 'No, only .docx. Older binary .doc files would need to be re-saved as .docx first.' },
      { q: 'Will my layout be pixel-perfect?', a: 'No. Layout is reproduced by the browser rather than by Word, so expect close but not identical pagination. For a layout-critical document, print to PDF from Word itself.' },
      { q: 'Are images preserved?', a: 'Images embedded in the document are carried across; some complex floating arrangements may shift.' },
    ],
    privacy: 'The document is parsed and rendered inside your browser. A confidential contract never leaves your machine.',
  },
  'powerpoint-to-pdf': {
    lead: 'PowerPoint to PDF converts a .pptx deck to PDF. It is honest about its scope: the converter recovers the text content of each slide and lays it out as pages. Images and charts inside the deck are not reproduced. For a text-first deck that is enough; for a designed presentation, use PowerPoint\'s own export.',
    how: [
      'Select the .pptx file.',
      'Press Convert to PDF.',
      'Download the text-based PDF.',
    ],
    faq: [
      { q: 'Are slide images and charts included?', a: 'No. This converter extracts text only, and the panel states that before you run it.' },
      { q: 'Why is the output text-only?', a: 'Rendering a full slide layout accurately requires a layout engine comparable to PowerPoint itself. Rather than produce a misleading approximation, the tool does the part it can do correctly.' },
      { q: 'What is the alternative?', a: 'PowerPoint, Keynote or LibreOffice can export a deck to PDF with full fidelity.' },
    ],
    privacy: 'The .pptx archive is unpacked and read in the browser. Nothing is uploaded.',
  },
  'excel-to-pdf': {
    lead: 'Excel to PDF converts a spreadsheet into a PDF, with control over page size, orientation and margins. Sheets are laid out as tables, which suits reports and simple data dumps. Very wide sheets are the usual problem case — set the orientation to landscape and widen the page before converting.',
    how: [
      'Select the .xlsx file.',
      'Choose page size, orientation and margin.',
      'Press Convert to PDF and download the result.',
    ],
    faq: [
      { q: 'Are formulas preserved?', a: 'The converted values are what you see; formulas are not carried into the PDF, which is normal for PDF output.' },
      { q: 'What about very wide spreadsheets?', a: 'Switch to landscape and a larger page size. If the content still does not fit, split the sheet before converting.' },
      { q: 'Does it handle multiple sheets?', a: 'Yes, each sheet becomes part of the resulting document.' },
    ],
    privacy: 'The workbook is read and laid out locally in the tab. No upload.',
  },
  'html-to-pdf': {
    lead: 'HTML to PDF renders markup into a paginated PDF using the browser as the layout engine. Because the browser is doing the layout, complex CSS — flexbox, tables, web fonts — renders the way it would on screen. Pasted markup is sanitised first: scripts, frames and any remote image or stylesheet reference are stripped, so a page cannot fetch anything from the network while it is being converted.',
    how: [
      'Paste your HTML into the editor.',
      'Press Convert to PDF.',
      'Download the rendered document.',
    ],
    faq: [
      { q: 'Can I use an external stylesheet?', a: 'Inline styles work. Remote stylesheets and remote images are deliberately removed, because fetching them would break the promise that the page is processed without any network request.' },
      { q: 'Can I include images?', a: 'Yes, if they are embedded as data URIs. Remote image URLs are stripped for the same reason.' },
      { q: 'How are long documents paginated?', a: 'The rendered page is sliced into page-height strips. Very long documents can exceed what a single canvas can hold.' },
    ],
    privacy: 'The markup is rendered in a hidden container on your device. Sanitising removes every remote reference, so the conversion makes no network requests at all.',
  },
  'compress-image': {
    lead: 'Compress IMAGE reduces the file size of JPG, PNG, WebP or GIF images by re-encoding them at a lower quality and, where it helps, a smaller pixel size. It is the quick way to get a photo under an upload limit without opening an editor. If re-encoding would make a file larger, the original is returned instead.',
    how: [
      'Select one or more images.',
      'Choose a compression level.',
      'Press Compress IMAGES and download the results.',
    ],
    faq: [
      { q: 'Which formats are supported?', a: 'JPG, PNG, WebP, GIF, BMP and AVIF — whatever your browser can decode. TIFF and HEIC are not supported, and the tool says so instead of silently ignoring the file.' },
      { q: 'Will my PNG stay a PNG?', a: 'Yes, the output format follows the input unless you ask for JPG.' },
      { q: 'Why did one file come back the same size?', a: 'Re-encoding an already-optimised image often makes it bigger. When that happens the original is returned rather than a larger file.' },
    ],
    privacy: 'Images are decoded and re-encoded by the canvas API in your browser. Nothing is uploaded.',
  },
  'resize-image': {
    lead: 'Resize IMAGE changes an image\'s pixel dimensions, by exact width and height or by percentage, with an optional aspect-ratio lock so nothing stretches. Large downscales use progressive halving, which avoids the aliased, shimmering edges a single-step resize produces.',
    how: [
      'Select the images to resize.',
      'Enter the target width and height, or a percentage.',
      'Press Resize IMAGES and download the results.',
    ],
    faq: [
      { q: 'Do I need to keep the aspect ratio?', a: 'The lock is on by default. Turn it off when you deliberately want to stretch or squash to an exact size.' },
      { q: 'Can I enlarge an image?', a: 'Yes, though enlarging cannot invent detail. The tool warns rather than silently producing a blurry result that looks uncropped.' },
      { q: 'Does resizing hurt quality?', a: 'Downscaling is lossless in the sense that it uses a high-quality filter; upscaling inevitably softens.' },
    ],
    privacy: 'The image is resampled on a canvas in the tab. No upload.',
  },
  'crop-image': {
    lead: 'Crop IMAGE trims an image to the area you select with a draggable eight-handle box, with aspect presets for the common shapes. You can flip and rotate in the same step, and the preview shows exactly what the output will be.',
    how: [
      'Select an image.',
      'Drag the crop box or pick an aspect preset.',
      'Press Crop IMAGE and download the result.',
    ],
    faq: [
      { q: 'Can I crop to a fixed aspect ratio?', a: 'Yes — presets for square, 4:3, 16:9 and the original ratio are provided.' },
      { q: 'Can I straighten and crop at once?', a: 'Yes, rotation and flip controls sit alongside the crop box.' },
      { q: 'Is the crop destructive?', a: 'Your original file is untouched; you get a new image.' },
    ],
    privacy: 'The crop is performed on a canvas in your browser. Nothing is uploaded.',
  },
  'rotate-image': {
    lead: 'Rotate IMAGE turns photos by 90-degree steps and can mirror them horizontally or vertically. It is the fix for a phone photo that arrived sideways — and because it uses the browser\'s own decoder, the result is re-encoded cleanly rather than being a metadata flag that some apps ignore.',
    how: [
      'Select one or more images.',
      'Use the rotate and flip controls on each card.',
      'Press Rotate IMAGES and download.',
    ],
    faq: [
      { q: 'Does rotating lose quality?', a: 'A 90-degree rotation of an image that stays in a lossless format is lossless. Converting to JPEG does re-encode once.' },
      { q: 'Can I rotate different images differently?', a: 'Yes, rotations are queued per file.' },
      { q: 'Can I flip an image?', a: 'Yes, horizontally and vertically.' },
    ],
    privacy: 'Rotation happens on a canvas in the tab. No upload.',
  },
  'watermark-image': {
    lead: 'Watermark IMAGE overlays text or a logo onto your pictures, with control over position, opacity, angle and size — including a tiled mode that repeats the mark across the whole image. It is the practical way to mark proofs before sending them to a client.',
    how: [
      'Select the images.',
      'Choose a text or logo watermark and set position, opacity, angle and size.',
      'Press Watermark IMAGES and download.',
    ],
    faq: [
      { q: 'Can I tile the watermark across the image?', a: 'Yes, tiled mode repeats the mark so it cannot simply be cropped off one corner.' },
      { q: 'Does it support a transparent logo?', a: 'Yes — PNG transparency is preserved in the output.' },
      { q: 'Can I preview before downloading?', a: 'Yes, the preview updates as you change the controls.' },
    ],
    privacy: 'The watermark is composited on a canvas locally. Your images and your logo stay on your device.',
  },
  'meme-generator': {
    lead: 'Meme generator adds the familiar top and bottom captions to an image — or in-picture text anywhere you like. Each text layer is draggable and independently sized, so a line can sit outside the two traditional bands, which is what the format has drifted toward anyway. Text is rendered as pixels into the exported PNG rather than stamped as a separate layer, so the result looks identical everywhere it is posted.',
    how: [
      'Select an image.',
      'Type your captions and drag the text into place.',
      'Press Create and download.',
    ],
    faq: [
      { q: 'Can I add more than two captions?', a: 'Yes, in-picture text layers can be added and dragged independently.' },
      { q: 'Does it work on a phone?', a: 'Yes, the layout adapts and the text layers respond to touch.' },
      { q: 'What format is the output?', a: 'A PNG, so the text stays sharp.' },
    ],
    privacy: 'Text is drawn onto the image on a canvas in your browser. Nothing is uploaded.',
  },
  'photo-editor': {
    lead: 'Photo editor is a full retouching surface in the browser tab: filters, brightness and contrast, rotation, crop, drawing, text and shapes, plus frame and background controls. It exists for the case where you need to adjust one image and do not want to install an application or upload a personal photo to a web service to do it.',
    how: [
      'Select an image to edit.',
      'Work through the tabs — filters, crop, transform, draw, text, shapes.',
      'Press Save to render and download the finished image.',
    ],
    faq: [
      { q: 'Is my photo uploaded?', a: 'No. Every adjustment is applied to a canvas in the tab.' },
      { q: 'Can I undo a change?', a: 'Yes, the editor keeps a history you can step back through.' },
      { q: 'Why does the preview slow down as I add adjustments?', a: 'Each change replays the full stack of operations. With many adjustments on a large photo, the preview deliberately trades speed for accuracy.' },
    ],
    privacy: 'Editing happens entirely on-device. A personal photograph is never transmitted.',
  },
  'convert-to-jpg': {
    lead: 'Convert to JPG turns PNG, WebP, GIF or BMP images into JPEGs, flattening transparency onto white. That last part matters: JPEG has no alpha channel, so a transparent logo saved as JPG would otherwise come out with a black background.',
    how: [
      'Select the images to convert.',
      'Choose the quality.',
      'Press Convert to JPG and download.',
    ],
    faq: [
      { q: 'What happens to transparency?', a: 'It is composited onto white, which is what a JPEG requires.' },
      { q: 'Can I control the quality?', a: 'Yes, the quality slider trades file size against artefacts.' },
      { q: 'Can I convert animated GIFs?', a: 'The first frame is what converts; JPEG is a single-image format.' },
    ],
    privacy: 'Conversion happens on a canvas in the browser. No upload.',
  },
  'jpg-to-image': {
    lead: 'Convert from JPG re-encodes JPEG photographs into PNG or GIF. PNG is the right choice when you need a lossless copy, transparency, or a format that will not degrade further each time it is saved; GIF only when something downstream insists on it. Be aware of one thing before you convert: JPEG compression is already baked into the source, so neither output can recover detail that was discarded — the file will usually get larger without getting sharper.',
    how: [
      'Select the JPEG images.',
      'Choose PNG or GIF as the output.',
      'Press Convert and download.',
    ],
    faq: [
      { q: 'Will converting to PNG recover lost detail?', a: 'No. JPEG compression is already baked in; PNG preserves what remains without adding further loss.' },
      { q: 'Will the file get bigger?', a: 'Usually yes — PNG is lossless, so photos stored as PNG are considerably larger than the JPEG original.' },
      { q: 'Is GIF or PNG better?', a: 'PNG for still images: it is lossless and supports full transparency. GIF is limited to 256 colours.' },
    ],
    privacy: 'Re-encoding happens on a canvas in the tab. No upload.',
  },
  'html-to-image': {
    lead: 'HTML to image renders pasted markup to a PNG or JPG using the browser\'s own layout engine, so the picture matches what the markup would look like on screen. It is useful for turning a styled table, card or snippet into an image without installing a screenshot tool.',
    how: [
      'Paste your HTML into the editor.',
      'Press Convert and download the image.',
    ],
    faq: [
      { q: 'Can I load an external image by URL?', a: 'No. Remote references are stripped before rendering, so the conversion makes no network requests.' },
      { q: 'What size will the output be?', a: 'The rendered content size at 2x, so text stays crisp.' },
      { q: 'Can I use web fonts?', a: 'Fonts already available to the page work; remote font stylesheets are removed.' },
    ],
    privacy: 'Rendering happens in a hidden container on your device, with all remote references stripped first.',
  },
};
