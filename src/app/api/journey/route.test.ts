import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { scoreRoutes } from '../../../engine/UpgradedScoringEngine';
import { networkPatterns, networkRoutes, weightingDate } from '../../../data/transportNetwork';
import { GET } from './route';
import { enrichJourneyArrivals } from '../../../data/multimodalLive';

vi.mock('../../../lib/cloudflare', () => ({ getRateLimiter: vi.fn(async () => null) }));
vi.mock('../../../data/multimodalLive', () => ({ enrichJourneyArrivals: vi.fn(async () => undefined) }));
const now = new Date('2026-11-13T04:00:00Z');
const cheungShaWan = { lat: 22.33882, lng: 114.15387 };
const airport = { lat: 22.31367, lng: 113.93763 };

async function journey(from = cheungShaWan, to = airport, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ fromLat: String(from.lat), fromLon: String(from.lng),
    toLat: String(to.lat), toLon: String(to.lng), lang: 'en', ...extra });
  const response = await GET(new NextRequest('http://localhost/api/journey?' + params));
  expect(response.status).toBe(200);
  return response.json();
}

describe('Multimodal journey API', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); });
  afterEach(() => { vi.useRealTimers(); });

  it('includes adult-priced direct airport buses and useful Cheung On feeder alternatives', async () => {
    const { data, meta } = await journey();
    expect(data.length).toBeGreaterThan(0);
    expect(meta.coverage.routes).toBeGreaterThan(2400);
    expect(meta.candidates).toBeGreaterThan(0);
    expect(meta.farePassenger).toBe('NORMAL_ADULT');
    const names = data.map((r: { legs: { routeNumber: string }[] }) => r.legs.map(l => l.routeNumber).join('>'));
    expect(names).toContain('A23'); expect(names).toContain('A20');
    expect(names).toContain('44>A31'); expect(names).toContain('44>E32');
    expect(data.some((r: { legs: { operator: string; routeNumber: string }[] }) => r.legs.some(l => l.operator === 'CTB' && /^A2[013]/.test(l.routeNumber)))).toBe(true);
    for (const route of data) {
      expect(route.discountedFare).toBeGreaterThan(0);
      expect(route.legs.every((l: { fareStatus: string }) => l.fareStatus !== 'UNAVAILABLE')).toBe(true);
      expect(route.finalScore).toBe(scoreRoutes([route], weightingDate(now))[0].finalScore);
      for (const leg of route.legs) {
        if (leg.mode === 'WALK') continue;
        const pattern = networkPatterns[leg.networkPattern];
        expect(leg.alightingIndex).toBeGreaterThan(leg.boardingIndex);
        expect(pattern.p[leg.boardingIndex]).toBe(0);
        expect(pattern.a[leg.alightingIndex]).toBe(0);
        expect(networkRoutes[pattern.r][2]).toBe(leg.routeNumber);
      }
    }
  }, 20000);

  it('plans future departure times without borrowing live ETAs from now', async () => {
    const time = '2026-11-14T10:00:00+08:00';
    const { data, meta } = await journey(cheungShaWan, airport, { timeMode: 'depart', time });
    expect(data.length).toBeGreaterThan(0); expect(meta.timeMode).toBe('depart');
    expect(enrichJourneyArrivals).not.toHaveBeenCalled();
    for (const r of data) expect(Date.parse(r.departureTime)).toBe(Date.parse(time));
  }, 30000);

  it('searches backwards for arrive-by and returns only journeys meeting the deadline', async () => {
    const time = '2026-11-14T14:00:00+08:00';
    const { data, meta } = await journey(cheungShaWan, airport, { timeMode: 'arrive', time });
    expect(data.length).toBeGreaterThan(0); expect(meta.timeMode).toBe('arrive');
    expect(enrichJourneyArrivals).not.toHaveBeenCalled();
    for (const r of data) {
      expect(Date.parse(r.arrivalTime)).toBeLessThanOrEqual(Date.parse(time));
      expect(Date.parse(r.departureTime)).toBeLessThan(Date.parse(r.arrivalTime));
      for (let i = 1; i < r.legs.length; i++) expect(Date.parse(r.legs[i].departureTime)).toBeGreaterThanOrEqual(Date.parse(r.legs[i - 1].arrivalTime) + (r.legs[i].accessWalkMinutes ?? 3) * 60000 - 1);
    }
  }, 30000);

  it('also finds the return airport journey', async () => {
    const { data } = await journey(airport, cheungShaWan);
    expect(data.length).toBeGreaterThan(0);
    expect(data.some((r: { legs: { mode: string }[] }) => r.legs.some(l => l.mode === 'BUS' || l.mode === 'SUBWAY'))).toBe(true);
  }, 20000);

  it('reports uncovered endpoints separately from unavailable connections', async () => {
    const { data, meta } = await journey({ lat: 0, lng: 0 }, airport);
    expect(data).toEqual([]); expect(meta.originUncovered).toBe(true);
  });

  it('rejects missing or invalid coordinates', async () => {
    const response = await GET(new NextRequest('http://localhost/api/journey?fromLat=nope'));
    expect(response.status).toBe(400);
  });

  it('returns a walking comparison for nearby places', async () => {
    const { data } = await journey(cheungShaWan, { lat: 22.3395, lng: 114.1545 });
    expect(data.some((r: { legs: { mode: string }[] }) => r.legs.every(l => l.mode === 'WALK'))).toBe(true);
  }, 20000);
});
