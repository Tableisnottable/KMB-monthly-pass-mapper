import { NextRequest } from './platform';
import { GET as journey } from '../app/api/journey/route';
import { GET as geometry } from '../app/api/journey-geometry/route';
import { GET as network } from '../app/api/network/route';
import { GET as places } from '../app/api/places/route';
import { GET as transit } from '../app/api/transit/route';
import { GET as updates } from '../app/api/updates/route';
import { GET as traffic } from '../app/api/traffic/route';
import { GET as travelOptions } from '../app/api/travel-options/route';
import { GET as placeLabel } from '../app/api/place-label/route';

// Reuse the actual application handlers and scoring engine. Only the execution
// environment changes: expensive graph searches never run on the free Worker.
const handlers: Record<string, (request: import('next/server').NextRequest) => Promise<Response>> = {
  '/api/journey': journey, '/api/journey-geometry': geometry, '/api/network': network,
  '/api/places': places, '/api/transit': transit, '/api/updates': updates, '/api/traffic': traffic,
  '/api/travel-options': travelOptions,
  '/api/place-label': placeLabel,
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
    const url = new URL(data.url, worker.location.origin), handler = handlers[url.pathname];
    if (!handler) throw new Error('Unsupported transport operation.');
    const response = await handler(new NextRequest(url) as unknown as import('next/server').NextRequest);
    const body = await response.text();
    if (!cancelled.has(data.id)) worker.postMessage({ id: data.id, status: response.status,
      headers: Array.from(response.headers.entries()), body });
  } catch (error) {
    if (!cancelled.has(data.id)) worker.postMessage({ id: data.id,
      error: error instanceof Error ? error.message : 'Transport calculation failed.' });
  } finally { active.delete(data.id); cancelled.delete(data.id); }
};
