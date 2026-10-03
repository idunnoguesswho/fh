/* sw.js — caches the app shell so the site works offline once visited. */
const CACHE = 'dshc-field-v3';
const FILES = ['./', 'index.html', 'css/styles.css', 'js/core.js', 'js/modules.js', 'js/docs.js', 'js/visit.js', 'js/pack.js', 'js/vendor/html2canvas.min.js', 'js/vendor/jspdf.umd.min.js', 'js/vendor/jszip.min.js', 'js/main.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
// Network first (so updates arrive), fall back to cache when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).pathname.includes('/api/')) return;   // records always come from the server
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
