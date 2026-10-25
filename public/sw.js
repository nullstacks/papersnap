/*
 * Offline service worker.
 *
 * The whole point of this app is that files never leave the device, so once it
 * has been installed it should keep working with no network at all.
 *
 * Strategy:
 *   - navigations: network-first, falling back to the cached shell. That is what
 *     lets a new deployment take effect on the next visit.
 *   - assets: stale-while-revalidate. Hashed filenames are immutable, so serving
 *     the cached copy is safe and the refresh only matters for unhashed files.
 *   - anything cross-origin: passthrough.
 *
 * The cache is filled by the PRECACHE list injected at build time (see
 * scripts/build-sw.mjs). Before that, the list held only './', './index.html'
 * and the manifest: no hashed bundle was ever cached, so a second, offline
 * visit fell back to an index.html whose script tags pointed at files the
 * browser had never stored. The offline claim was simply untrue.
 */
/* __PRECACHE__ */

const CACHE = 'papersnap-__VERSION__';
const PRECACHE = self.__PRECACHE__ || ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          /* Offline: the shell is what the app needs, at any route, because the
           * router reads the hash rather than the path. */
          const hit =
            (await caches.match(request)) ||
            (await caches.match('./index.html')) ||
            (await caches.match('./'));
          return hit || new Response('Offline and this page was never cached.', {
            status: 503,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          });
        }),
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
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(
          () =>
            cached ||
            new Response('', { status: 504, statusText: 'Offline' }),
        );
      return cached || network;
    }),
  );
});
