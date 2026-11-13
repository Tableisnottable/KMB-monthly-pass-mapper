import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { scoreRoutes } from '../../../engine/UpgradedScoringEngine';
import { getStaticCitybusRouteStops, getStaticCitybusStops } from '../../../data/citybusStopsStatic';
import { getCitybusEta, getKmbStops } from '../../../data/hkTransitApi';
import { GET } from './route';

vi.mock('../../../lib/cloudflare', () => ({ getRateLimiter: vi.fn(async () => null) }));
vi.mock('../../../data/hkTransitApi', () => ({
  getKmbStops: vi.fn(async () => []),
  getKmbStopEta: vi.fn(async () => []),
  getKmbRouteStops: vi.fn(async () => []),
  getCitybusRouteStops: vi.fn(async () => []),
  getCitybusEta: vi.fn(async (_stop: string, route: string) => ['I', 'O'].map(dir => ({
    route, dir, eta: new Date(Date.now() + 5 * 60000).toISOString(),
    co: 'CTB', seq: 1, dest_tc: '', remarks_tc: '',
  }))),
}));

const cheungShaWan = { lat: 22.33882, lng: 114.15387 };
const airport = { lat: 22.31367, lng: 113.93763 };

async function journey(from = cheungShaWan, to = airport) {
  const params = new URLSearchParams({
    fromLat: String(from.lat), fromLon: String(from.lng),
    toLat: String(to.lat), toLon: String(to.lng),
  });
  const response = await GET(new NextRequest('http://localhost/api/journey?' + params));
  expect(response.status).toBe(200);
  return response.json();
}

describe('Citybus journey coverage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('finds the airport trip from the reported screenshot', async () => {
    const { data, meta } = await journey();
    expect(meta.citybusCandidates).toBeGreaterThan(0);
    expect(data.some((route: { legs: { routeNumber: string }[] }) =>
      route.legs.some(leg => /^A2[013]/.test(leg.routeNumber)),
    )).toBe(true);
    const stops = new Map(getStaticCitybusStops().map(stop => [stop.stop, stop]));
    for (const route of data) {
      const leg = route.legs[0];
      expect(leg.operator).toBe('CTB');
      expect(stops.has(leg.originStop.id)).toBe(true);
      const sequence = getStaticCitybusRouteStops(leg.routeNumber,
        route.id.includes('-outbound-') ? 'outbound' : 'inbound')!;
      expect(sequence.findIndex(row => row.stop === leg.destinationStop.id))
        .toBeGreaterThan(sequence.findIndex(row => row.stop === leg.originStop.id));
      expect(leg.realtimeEta.isLive).toBe(true);
      expect(route.finalScore).toBe(scoreRoutes([route])[0].finalScore);
    }
  });

  it('also finds the return trip in the correct direction', async () => {
    const { data } = await journey(airport, cheungShaWan);
    expect(data.length).toBeGreaterThan(0);
    expect(data.some((route: { legs: { routeNumber: string }[] }) =>
      route.legs.some(leg => /^A2[013]/.test(leg.routeNumber)),
    )).toBe(true);
  });

  it('retains topology when live ETA calls fail', async () => {
    vi.mocked(getCitybusEta).mockRejectedValueOnce(new Error('ETA unavailable'));
    const { data } = await journey();
    expect(data.length).toBeGreaterThan(0);
    expect(data.some((route: { legs: { realtimeEta: unknown; serviceEnded: boolean }[] }) =>
      route.legs.some(leg => leg.realtimeEta === null && !leg.serviceEnded),
    )).toBe(true);
  });

  it('reports uncovered places separately from disconnected places', async () => {
    vi.mocked(getKmbStops).mockResolvedValueOnce([]);
    const { data, meta } = await journey({ lat: 0, lng: 0 }, airport);
    expect(data).toEqual([]);
    expect(meta.originUncovered).toBe(true);
  });
});
