const CACHE = 'mnemonica-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate for same-origin GETs; navigations fall back to the cached shell.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const key = req.mode === 'navigate' ? '/index.html' : req;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(key);
      const network = fetch(req)
        .then(res => { if (res.ok) cache.put(key, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
