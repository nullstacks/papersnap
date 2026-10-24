import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import './styles/index.css';

/*
 * HashRouter deliberately: GitHub Pages serves static files with no rewrite
 * rules, so path-based routes 404 on refresh and on shared deep links.
 * `/#/merge-pdf` always resolves to index.html.
 */
const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

createRoot(root).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

/*
 * Register the offline worker so the app keeps working without a network once
 * it has been installed. Only meaningful over https or localhost, which are the
 * only contexts service workers are allowed in.
 */
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* Offline support is a bonus; never break the app over it. */
    });
  });
}
