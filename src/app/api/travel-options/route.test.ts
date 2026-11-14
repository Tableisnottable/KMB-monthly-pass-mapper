import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { routeOnStreets } from '../../../data/routeGeometry';
vi.mock('../../../lib/cloudflare', () => ({ getRateLimiter: vi.fn(async () => null) }));
vi.mock('../../../data/routeGeometry', () => ({ routeOnStreets: vi.fn(async (_points, profile) => profile === 'bike'
  ? { paths: [], source: 'UNAVAILABLE' } : { paths: [[[22.3, 114.1], [22.31, 114.11]]], source: 'OSM_ROAD', distanceMetres: 2000, durationSeconds: 601 }) }));
describe('Walking, cycling, taxi and driving API', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses a distinct real routing profile for each mode and preserves no-route results', async () => {
    const response = await GET(new NextRequest('http://localhost/api/travel-options?fromLat=22.3&fromLon=114.1&toLat=22.31&toLon=114.11'));
    const { data } = await response.json();
    expect(vi.mocked(routeOnStreets).mock.calls.map(call => call[1])).toEqual(['foot', 'bike', 'car']);
    expect(data.map((o: { available: boolean }) => o.available)).toEqual([true, false, true, true]); expect(data[0].minutes).toBe(11);
    expect(data.map((o: { mode: string }) => o.mode)).toEqual(['walk', 'cycle', 'taxi', 'drive']);
  });
  it('rejects missing and out-of-area coordinates', async () => {
    expect((await GET(new NextRequest('http://localhost/api/travel-options?fromLat=0'))).status).toBe(400);
  });
  it('only calculates enabled estimates, and supports switching all of them off', async () => {
    const url = 'http://localhost/api/travel-options?fromLat=22.3&fromLon=114.1&toLat=22.31&toLon=114.11&modes=';
    const response = await GET(new NextRequest(url + 'taxi'));
    expect((await response.json()).data.map((option: { mode: string }) => option.mode)).toEqual(['taxi']);
    expect(vi.mocked(routeOnStreets).mock.calls.map(call => call[1])).toEqual(['car']);
    vi.clearAllMocks();
    expect((await (await GET(new NextRequest(url))).json()).data).toEqual([]);
    expect(routeOnStreets).not.toHaveBeenCalled();
    expect((await GET(new NextRequest(url + 'SUBWAY'))).status).toBe(400);
  });
  it('shares a road profile between taxi and driving without inventing a driving fare', async () => {
    const url = 'http://localhost/api/travel-options?fromLat=22.3&fromLon=114.1&toLat=22.31&toLon=114.11&modes=';
    const { data } = await (await GET(new NextRequest(url + 'taxi,drive'))).json();
    expect(data.map((option: { mode: string }) => option.mode)).toEqual(['taxi', 'drive']);
    expect(vi.mocked(routeOnStreets)).toHaveBeenCalledTimes(1);
    expect(data[1]).toMatchObject({ mode: 'drive', minutes: 11, distanceMetres: 2000, available: true });
    expect(data[1].fare).toBeUndefined();
    vi.clearAllMocks();
    expect((await (await GET(new NextRequest(url + 'drive'))).json()).data[0].mode).toBe('drive');
    expect(vi.mocked(routeOnStreets).mock.calls.map(call => call[1])).toEqual(['car']);
  });
  it('validates and passes road preferences to all routed modes', async () => {
    const url = 'http://localhost/api/travel-options?fromLat=22.3&fromLon=114.1&toLat=22.31&toLon=114.11&modes=walk,cycle,taxi,drive&preferences=' + encodeURIComponent(JSON.stringify({ roads: { cht: 'ban' } }));
    await GET(new NextRequest(url));
    expect(vi.mocked(routeOnStreets).mock.calls.map(call => call[2]?.roads?.cht)).toEqual(['ban', 'ban', 'ban']);
    const invalid = 'http://localhost/api/travel-options?fromLat=22.3&fromLon=114.1&toLat=22.31&toLon=114.11&preferences=' + encodeURIComponent(JSON.stringify({ roads: { unknown: 'ban' } }));
    expect((await GET(new NextRequest(invalid))).status).toBe(400);
  });
});
