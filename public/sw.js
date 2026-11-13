const OFFLINE_CACHE = 'transit-compass-offline-v1';
const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.add(OFFLINE_PAGE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('transit-compass-offline-') && key !== OFFLINE_CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  // Never intercept API data, maps, transport workers or Next.js chunks.
  // Online navigations always use the current deployment; only offline help is cached.
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate'
    || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(async () =>
    (await (await caches.open(OFFLINE_CACHE)).match(OFFLINE_PAGE)) ?? Response.error()));
});
