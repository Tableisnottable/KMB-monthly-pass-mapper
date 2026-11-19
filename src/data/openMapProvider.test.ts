import { describe, it, expect, vi } from 'vitest';
import { openMapResponse } from './openMapProvider';
describe('Account-free map provider', () => {
  it('rejects arbitrary queries and unsupported regions without contacting an upstream', async () => {
    const fetcher = vi.fn();
    for (const suffix of ['region=invalid&lat=25&lon=121', 'region=taiwan&lat=abc&lon=121', 'region=japan&lat=35&lon=-120', 'region=japan&lon=139']) {
      expect((await openMapResponse(new Request('https://example.com/api/open-map?' + suffix), fetcher)).status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('streams a cacheable extract without authentication or server-side parsing', async () => {
    const raw = '{"elements":[]}', fetcher = vi.fn(async () => new Response(raw, { headers: { 'Content-Type': 'application/json' } }));
    const response = await openMapResponse(new Request('https://example.com/api/open-map?region=taiwan&lat=25.0123&lon=121.5234'), fetcher);
    expect(response.status).toBe(200); expect(await response.text()).toBe(raw);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/api\.openstreetmap\.org\/api\/0.6\/map.json\?bbox=/);
    expect(options.headers).not.toHaveProperty('Authorization'); expect(options.headers).not.toHaveProperty('X-API-Key');
    expect(response.headers.get('X-Open-Map-Bounds')?.split(',')).toHaveLength(4);
    expect(response.headers.get('Cache-Control')).toContain('max-age=86400');
  });
  it('reports unavailable data instead of inventing a network', async () => {
    const result = await openMapResponse(new Request('https://example.com/api/open-map?region=japan&lat=35.6&lon=139.7'), vi.fn(async () => new Response('', { status: 429 })));
    expect(result.status).toBe(503); expect(await result.json()).toEqual({ error: 'OPEN_MAP_UNAVAILABLE' });
  });
});
