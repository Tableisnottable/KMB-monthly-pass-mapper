import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
vi.mock('../../../lib/cloudflare', () => ({ getRateLimiter: vi.fn(async () => null) }));
vi.mock('../../../data/streetRouting', () => ({ routeOnStreets: vi.fn(async () => ({ paths: [], source: 'UNAVAILABLE' })) }));
const base = 'http://localhost/api/macau?';
const query = 'resource=journey&fromLat=22.183668&fromLon=113.529413&toLat=22.159403&toLon=113.574648&time=2026-11-14T14:00:00%2B08:00';
const get = (p: string) => GET(new NextRequest(base + p));
afterEach(() => vi.unstubAllGlobals());
describe('Macau browser API', () => {
  it('provides the catalogue and bounds local search to Macau', async () => {
    const response = await get('resource=routes'); expect(response.status).toBe(200); const p = await response.json();
    expect(p.data.length).toBe(117); expect(p.coverage.routes).toBe(90); expect(p.data.every((r: { paths?: unknown }) => !r.paths)).toBe(true);
    const places = await (await get('resource=places&scope=local&q=airport&lang=en')).json(); expect(places.data.length).toBeGreaterThan(0);
  });
  it('returns live position-derived bus ETAs for valid public routes', async () => {
    const feed = Array.from({ length: 17 }, (_, index) => ({
      bus: index === 1 ? [{ ref: '#HE147', lat: '22.207115', lng: '113.543920', speed: 4 }] : [],
    }));
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...feed })));
    const response = await get('resource=live&id=MO%3ABUS%3A1A%3A0');
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.vehicleCount).toBe(1);
    expect(payload.data.etaByStop[16].minutes).toBeGreaterThan(0);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await get('resource=live&id=MO%3ABUS%3A999%3A0')).status).toBe(400);
  });
  it('uses independent MOP fares and excludes bus estimates by default', async () => {
    const response = await get(query); expect(response.status).toBe(200); const p = await response.json();
    expect(p.meta).toMatchObject({ city: 'macau', currency: 'MOP', live: false, busEstimates: false });
    expect(p.data.length).toBeGreaterThan(0); expect(p.data.every((r: { unverifiedBus: boolean }) => !r.unverifiedBus)).toBe(true);
  });
  it.each(['resource=other', 'resource=route&id=hk:104', 'resource=geometry&legs=[]', 'resource=journey', query + '&time=bad',
    query + '&operators=KMB', query + '&operators=MO_TCM&requiredOperators=MO_LRT', query + '&payment=kmb-pass', query + '&busEstimates=yes',
    query + '&changeMinutes=61', query + '&timeMode=yesterday', query + '&fromLon=114.1', query + '&weights={"ride":-2}', query + '&limits={"walk":-1}',
    'resource=geometry&legs=[{"id":"MO:BUS:26A:0","board":-1,"alight":2}]'])('rejects invalid/cross-city input %s', async p => {
    expect((await get(p)).status).toBe(400);
  });
  it('does not use Hong Kong taxi fares or invent times for unavailable roads', async () => {
    const p = await (await get(query.replace('resource=journey', 'resource=street') + '&mode=taxi')).json();
    expect(p.data).toMatchObject({ fare: null, currency: 'MOP', minutes: null, source: 'UNAVAILABLE' });
  });
});
