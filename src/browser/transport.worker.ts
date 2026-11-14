import { NextRequest } from './platform';

// Reuse the actual application handlers and scoring engine. Only the execution
// environment changes: expensive graph searches never run on the free Worker.
const handlers = {
  '/api/journey': () => import('../app/api/journey/route'),
  '/api/journey-geometry': () => import('../app/api/journey-geometry/route'),
  '/api/network': () => import('../app/api/network/route'),
  '/api/places': () => import('../app/api/places/route'),
  '/api/transit': () => import('../app/api/transit/route'),
  '/api/updates': () => import('../app/api/updates/route'),
  '/api/traffic': () => import('../app/api/traffic/route'),
  '/api/travel-options': () => import('../app/api/travel-options/route'),
  '/api/place-label': () => import('../app/api/place-label/route'),
};
const worker = self as unknown as {
  location: Location; fetch: typeof fetch;
  onmessage: (event: MessageEvent<{ id: number; url: string; cancel?: boolean }>) => void;
  postMessage: (value: unknown) => void;
};
const nativeFetch = worker.fetch.bind(self);
worker.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), worker.location.origin);
  if (url.origin === worker.location.origin) return nativeFetch(url, init);
  // Upstream providers are fetched through a tightly restricted, cached proxy.
  return nativeFetch(new URL('/api/upstream?url=' + encodeURIComponent(url.href), worker.location.origin), init);
};
const active = new Set<number>(), cancelled = new Set<number>();
worker.onmessage = async ({ data }) => {
  if (data.cancel) { if (active.has(data.id)) cancelled.add(data.id); return; }
  active.add(data.id);
  try {
    const url = new URL(data.url, worker.location.origin), load = handlers[url.pathname as keyof typeof handlers];
    if (!load) throw new Error('Unsupported transport operation.');
    const { GET } = await load();
    if (cancelled.has(data.id)) return;
    const response = await GET(new NextRequest(url) as unknown as import('next/server').NextRequest);
    const body = await response.text();
    if (!cancelled.has(data.id)) worker.postMessage({ id: data.id, status: response.status,
      headers: Array.from(response.headers.entries()), body });
  } catch (error) {
    if (!cancelled.has(data.id)) worker.postMessage({ id: data.id,
      error: error instanceof Error ? error.message : 'Transport calculation failed.' });
  } finally { active.delete(data.id); cancelled.delete(data.id); }
};
