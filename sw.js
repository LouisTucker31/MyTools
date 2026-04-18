/* ============================================================
   SERVICE WORKER — sw.js
   Caches core app files so MyMoney works offline and from
   the iPhone Home Screen without an internet connection.

   HOW TO UPDATE THE CACHE:
   Whenever you change a file (styles.css, app.js, etc.),
   bump the version number below (e.g. 'v2' → 'v3').
   This tells the browser to download fresh files on the
   next visit and discard the old cached version.
   ============================================================ */

const CACHE_VERSION = 'mymoney-v20';

const CORE_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './pages/budget.js',
  './pages/bills.js',
  './pages/savings.js',
  './pages/debts.js',
  './icons/icon-180-v3.png',
  './icons/icon-192-v3.png',
  './icons/icon-512-v3.png',
  './manifest.json',
];

/* ── Install: cache all core files ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(CORE_FILES))
  );
  // Activate immediately without waiting for old tabs to close
  self.skipWaiting();
});

/* ── Activate: delete any old cache versions ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))
      )
    )
  );
  // Take control of all open tabs straight away
  self.clients.claim();
});

/* ── Fetch: serve from cache, fall back to network ── */
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
