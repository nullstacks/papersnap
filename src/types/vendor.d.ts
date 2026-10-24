/**
 * Minimal declarations for vendor modules that ship no usable types.
 *
 * `mammoth`'s published typings describe its Node entry point, which pulls in
 * `fs`/`path` at import time. The prebuilt browser bundle is what we actually
 * load (it is self-contained), so it gets its own small shape here instead of
 * dragging the Node-only definitions into a browser build.
 *
 * The bundle is UMD/CommonJS, so only the synthesized `default` export is
 * reliable — named export detection does not work through `module.exports = f()`.
 */
declare module 'mammoth/mammoth.browser.js' {
  export interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  export interface MammothBrowser {
    /** Convert a .docx to simple HTML. */
    convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
    /** Convert a .docx to plain text. */
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
  }

  const mammoth: MammothBrowser;
  export default mammoth;
}
