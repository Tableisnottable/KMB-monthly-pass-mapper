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

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data?.json() ?? {}; } catch { /* Always show a visible fallback for a push. */ }
    await self.registration.showNotification(payload.title || 'Transit Compass', {
      body: payload.body || 'Open Transit Compass to check your journey.',
      icon: '/icons/app-192.png', badge: '/icons/app-192.png',
      tag: 'transit-compass-boarding', renotify: false, silent: true,
      data: { url: payload.url === '/en' ? '/en' : '/', id: payload.id, token: payload.token },
      actions: [{ action: 'stop', title: payload.stopLabel || 'Stop updates' }],
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    if (event.action === 'stop' && data.id && data.token) {
      const result = await fetch('/api/notifications', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.id, token: data.token }) });
      if (result.ok) for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) client.postMessage({ type: 'boarding-watch-stopped' });
      return;
    }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.focus(); return; }
    await self.clients.openWindow(data.url === '/en' ? '/en' : '/');
  })());
});
