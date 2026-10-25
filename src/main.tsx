import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles/index.css';

/*
 * BrowserRouter, not HashRouter.
 *
 * The app used to route behind a fragment (/#/merge-pdf) because GitHub Pages
 * serves static files with no rewrite rules, so path-based routes 404'd on
 * refresh. Every tool therefore shared one indexable URL, and a search engine
 * could see exactly one page of content no matter how many tools existed.
 *
 * The build now prerenders a real <slug>/index.html for every visible tool
 * (see scripts/prerender.mjs), so each route is a genuine file that a static
 * host answers with 200. That removes the original reason for the hash.
 *
 * Vite's BASE_URL carries the deployment prefix, so the same build works at a
 * domain root and under a project path.
 */
const BASE = import.meta.env.BASE_URL;

/*
 * Old links look like /#/merge-pdf. Those URLs are still in bookmarks and
 * possibly in search results, so rewrite them to the path form before the
 * router mounts rather than dropping the visitor on the landing page.
 */
(function migrateHashLinks() {
  const { hash } = window.location;
  if (!hash.startsWith('#/')) return;
  const route = hash.slice(1);
  /* Only rewrite to a route this build knows about; anything else is a typo. */
  const known = /^\/[a-z0-9-]+\/?$/i.test(route);
  window.history.replaceState(null, '', BASE.replace(/\/$/, '') + (known ? route : '/'));
})();

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={BASE}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

/*
 * Register the offline worker so the app keeps working without a network once
 * it has been installed. Only meaningful over https or localhost, which are the
 * only contexts service workers are allowed in.
 */
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${BASE}sw.js`).catch(() => {
      /* Offline support is a bonus; never break the app over it. */
    });
  });
}
