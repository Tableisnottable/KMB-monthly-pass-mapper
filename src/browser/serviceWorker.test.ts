import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function runtime() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const page = new Response('Offline help');
  const cache = { add: vi.fn(async () => undefined), match: vi.fn(async () => page) };
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => [] as string[]), delete: vi.fn(async () => true) };
  const fetch = vi.fn(async () => new Response('Current page'));
  const self = { location: { origin: 'https://planner.example' },
    addEventListener: (type: string, handler: (event: unknown) => void) => { handlers[type] = handler; },
    skipWaiting: vi.fn(async () => undefined), clients: { claim: vi.fn(async () => undefined) } };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches, fetch, URL, Response });
  return { handlers, page, cache, caches, fetch, self };
}

describe('Installed app network and offline behavior', () => {
  it('does not intercept live data, transport bundles or map requests', () => {
    const app = runtime();
    for (const request of [
      { url: 'https://planner.example/api/upstream?url=arrivals', method: 'GET', mode: 'cors' },
      { url: 'https://planner.example/__planner/transport.worker.js', method: 'GET', mode: 'same-origin' },
      { url: 'https://tiles.example/map.png', method: 'GET', mode: 'cors' },
      { url: 'https://other.example/', method: 'GET', mode: 'navigate' },
      { url: 'https://planner.example/', method: 'POST', mode: 'navigate' },
    ]) {
      const respondWith = vi.fn(); app.handlers.fetch({ request, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    }
    expect(app.fetch).not.toHaveBeenCalled();
  });
  it('always fetches the current online document instead of a cached planner', async () => {
    const app = runtime(); let response!: Promise<Response>;
    app.handlers.fetch({ request: { url: 'https://planner.example/en', method: 'GET', mode: 'navigate' },
      respondWith: (value: Promise<Response>) => { response = value; } });
    expect(await (await response).text()).toBe('Current page');
    expect(app.caches.open).not.toHaveBeenCalled();
  });
  it('shows cached connection instructions when navigation is offline', async () => {
    const app = runtime(); app.fetch.mockRejectedValueOnce(new TypeError('Offline'));
    let response!: Promise<Response>;
    app.handlers.fetch({ request: { url: 'https://planner.example/en', method: 'GET', mode: 'navigate' },
      respondWith: (value: Promise<Response>) => { response = value; } });
    expect(await response).toBe(app.page); expect(app.cache.match).toHaveBeenCalledWith('/offline.html');
  });
  it('only removes its obsolete offline caches when activating', async () => {
    const app = runtime();
    app.caches.keys.mockResolvedValueOnce(['transit-compass-offline-v0', 'transit-compass-offline-v1', 'another-feature']);
    let done!: Promise<void>; app.handlers.activate({ waitUntil: (value: Promise<void>) => { done = value; } });
    await done;
    expect(app.caches.delete.mock.calls).toEqual([['transit-compass-offline-v0']]);
    expect(app.self.clients.claim).toHaveBeenCalledOnce();
  });
  it('caches the offline page before activating the new worker', async () => {
    const app = runtime(); let done!: Promise<void>;
    app.handlers.install({ waitUntil: (value: Promise<void>) => { done = value; } }); await done;
    expect(app.cache.add).toHaveBeenCalledWith('/offline.html'); expect(app.self.skipWaiting).toHaveBeenCalledOnce();
  });
});
