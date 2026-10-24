/*
 * Offline service worker.
 *
 * The whole point of this app is that files never leave the device, so once it
 * has been installed it should keep working with no network at all.
 *
 * Strategy:
 *   - navigations: network-first, falling back to the cached shell. This is what
 *     lets a new deployment take effect on the next visit.
 *   - assets: stale-while-revalidate. Hashed filenames are immutable, so serving
 *     the cached copy is safe and the refresh only matters for the rare
 *     unhashed file.
 *   - anything cross-origin: passthrough.
 */
const VERSION = 'pdfdock-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Navigations: always try the network first so a deploy is picked up. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html')).then((hit) => hit || Response.error())),
    );
    return;
  }

  /* Assets: serve from cache, refresh in the background. */
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});
