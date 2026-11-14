import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { routeOnStreets } from '../../../data/routeGeometry';
vi.mock('../../../lib/cloudflare', () => ({ getRateLimiter: vi.fn(async () => null) }));
vi.mock('../../../data/routeGeometry', () => ({ routeOnStreets: vi.fn(async (_points, profile) => profile === 'bike'
  ? { paths: [], source: 'UNAVAILABLE' } : { paths: [[[22.3, 114.1], [22.31, 114.11]]], source: 'OSM_ROAD', distanceMetres: 2000, durationSeconds: 601 }) }));
describe('Walking, cycling and taxi API', () => {
  it('uses a distinct real routing profile for each mode and preserves no-route results', async () => {
    const response = await GET(new NextRequest('http://localhost/api/travel-options?fromLat=22.3&fromLon=114.1&toLat=22.31&toLon=114.11'));
    const { data } = await response.json();
    expect(vi.mocked(routeOnStreets).mock.calls.map(call => call[1])).toEqual(['foot', 'bike', 'car']);
    expect(data.map((o: { available: boolean }) => o.available)).toEqual([true, false, true]); expect(data[0].minutes).toBe(11);
  });
  it('rejects missing and out-of-area coordinates', async () => {
    expect((await GET(new NextRequest('http://localhost/api/travel-options?fromLat=0'))).status).toBe(400);
  });
});
