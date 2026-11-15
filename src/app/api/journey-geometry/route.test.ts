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
  it('draws the transfer walk through Via, keeping both transit stages', async () => {
    const pattern = networkPatterns.findIndex(p => p.p[0] === 0 && p.a.at(-1) === 0);
    const token = `${pattern}:0:${networkPatterns[pattern].s.length - 1}`;
    const response = await request(endpointParams + '&viaLat=22.32&viaLon=114.12&viaIndex=1&legs=' + [token, token].join(','));
    expect(response.status).toBe(200);
    expect(vi.mocked(routeOnStreets).mock.calls[1][0][1]).toEqual([22.32, 114.12]);
    expect(transitGeometry).toHaveBeenCalledTimes(2);
  });
  it('draws walking-only Via paths and mixed walking/transit stages', async () => {
    const query = endpointParams + '&viaLat=22.32&viaLon=114.12';
    expect((await request(query + '&walk=true')).status).toBe(200);
    expect(vi.mocked(routeOnStreets).mock.calls[0][0]).toEqual([[22.8, 114.057], [22.32, 114.12], [22.244, 114.156]]);
    vi.clearAllMocks();
    const pattern = networkPatterns.findIndex(p => p.p[0] === 0 && p.a.at(-1) === 0);
    const token = `${pattern}:0:${networkPatterns[pattern].s.length - 1}`;
    expect((await request(query + '&viaIndex=1&legs=w:22.8:114.057:22.32:114.12,' + token)).status).toBe(200);
    expect(transitGeometry).toHaveBeenCalledTimes(1);
    expect((await request(query + '&viaIndex=5&legs=' + token)).status).toBe(400);
    expect((await request(query + '&legs=' + token)).status).toBe(400);
  });
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
