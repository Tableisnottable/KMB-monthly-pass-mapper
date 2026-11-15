import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { networkPatterns } from '../../../data/transportNetwork';
import { routeOnStreets, transitGeometry } from '../../../data/routeGeometry';

vi.mock('../../../lib/cloudflare', () => ({ getRateLimiter: vi.fn(async () => null) }));
vi.mock('../../../data/routeGeometry', () => ({
  routeOnStreets: vi.fn(async () => ({ paths: [], source: 'OSM_FOOT' })),
  transitGeometry: vi.fn(async () => ({ paths: [], source: 'TD_CSDI' })),
}));
const endpointParams = 'fromLat=22.8&fromLon=114.057&toLat=22.244&toLon=114.156';
const request = (query: string) => GET(new NextRequest('http://localhost/api/journey-geometry?' + query));

describe('Journey map geometry', () => {
  beforeEach(() => vi.clearAllMocks());
  it('draws every leg of a journey with more than three transfers, including northern endpoints', async () => {
    const pattern = networkPatterns.findIndex(p => p.p[0] === 0 && p.a.at(-1) === 0);
    const token = `${pattern}:0:${networkPatterns[pattern].s.length - 1}`;
    const response = await request(endpointParams + '&legs=' + Array(5).fill(token).join(','));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(transitGeometry).toHaveBeenCalledTimes(5);
    expect(routeOnStreets).toHaveBeenCalledTimes(6);
    expect(payload.pieces).toHaveLength(11);
    expect(payload.missing).toBe(0);
  });
  it('keeps walking-only map preferences consistent with the calculated route', async () => {
    const preferences = { harbour: '', shatin: '', airport: '', roads: { cht: 'ban' } };
    expect((await request(endpointParams + '&walk=true&preferences=' + encodeURIComponent(JSON.stringify(preferences)))).status).toBe(200);
    expect(vi.mocked(routeOnStreets).mock.calls[0][2]).toEqual(preferences);
  });
  it.each(['fromLat=23&fromLon=114&toLat=22.3&toLon=114&walk=true',
    endpointParams + '&legs=not-a-leg', endpointParams + '&legs=999999:0:1', endpointParams,
    endpointParams + '&walk=true&preferences=' + encodeURIComponent('{"roads":{"unknown":"ban"}}')])(
    'rejects invalid map requests without calling the routers', async query => {
      expect((await request(query)).status).toBe(400);
      expect(routeOnStreets).not.toHaveBeenCalled(); expect(transitGeometry).not.toHaveBeenCalled();
    });
});
