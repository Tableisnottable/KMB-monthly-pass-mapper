import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { scoreRoutes } from '../../../engine/UpgradedScoringEngine';
import { networkPatterns, networkRoutes, weightingDate } from '../../../data/transportNetwork';
import { GET } from './route';
import { enrichJourneyArrivals } from '../../../data/multimodalLive';
import { DEFAULT_WEIGHTS } from '../../../engine/routeWeights';
import { routeCorridors } from '../../../domain/routePreferences';

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
  it.each(['depart', 'arrive'])('enforces hard time and transfer maximums during %s searches', async timeMode => {
    const limits = { transfers: 0, walk: 20, ride: 120, wait: 25, change: null };
    const { data, meta } = await journey(cheungShaWan, airport, { timeMode, time: '2026-11-14T14:00:00+08:00', limits: JSON.stringify(limits) });
    expect(data.length).toBeGreaterThan(0); expect(meta.limits).toEqual(limits);
    for (const route of data) {
      expect(route.transferCount).toBe(0); expect(route.walkTransferTimeMinutes).toBeLessThanOrEqual(20);
      expect(route.legs.reduce((sum: number, leg: { journeyTimeMinutes: number }) => sum + leg.journeyTimeMinutes, 0)).toBeLessThanOrEqual(120);
      expect(route.legs.every((leg: { scheduledWaitMinutes: number }) => leg.scheduledWaitMinutes <= 25)).toBe(true);
    }
    const empty = await journey(cheungShaWan, airport, { timeMode, time: '2026-11-14T14:00:00+08:00', limits: '{"ride":0}' });
    expect(empty.data).toEqual([]);
  }, 30000);
  it('rechecks waiting maximums after a live arrival changes', async () => {
    vi.mocked(enrichJourneyArrivals).mockImplementation(async routes => {
      for (const route of routes) route.legs![0].realtimeEta = { etaMinutes: 60, isLive: true, source: 'DATAGOVHK', dataTime: now.toISOString() };
    });
    const { data } = await journey(cheungShaWan, airport, { limits: '{"wait":5}' });
    expect(data).toEqual([]);
  }, 30000);

  it('searches backwards for arrive-by and returns only journeys meeting the deadline', async () => {
    const time = '2026-11-14T14:00:00+08:00';
    const { data, meta } = await journey(cheungShaWan, airport, { timeMode: 'arrive', time, changeMinutes: '15' });
    expect(data.length).toBeGreaterThan(0); expect(meta.timeMode).toBe('arrive');
    expect(data.some((r: { legs: unknown[] }) => r.legs.length > 1)).toBe(true);
    expect(enrichJourneyArrivals).not.toHaveBeenCalled();
    for (const r of data) {
      expect(Date.parse(r.arrivalTime)).toBeLessThanOrEqual(Date.parse(time));
      expect(Date.parse(r.departureTime)).toBeLessThan(Date.parse(r.arrivalTime));
      for (let i = 1; i < r.legs.length; i++) expect(Date.parse(r.legs[i].departureTime)).toBeGreaterThanOrEqual(Date.parse(r.legs[i - 1].arrivalTime) + Math.max(15, r.legs[i].accessWalkMinutes ?? 3) * 60000 - 1);
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

  it('enforces company Must/Ban rules and a 15-minute change buffer after live retiming, using custom importance', async () => {
    const weights = { ...DEFAULT_WEIGHTS, fare: .9 };
    const { data, meta } = await journey(cheungShaWan, airport, { operators: 'KMB,LWB', requiredOperators: 'KMB', changeMinutes: '15',
      weights: JSON.stringify(weights), preferences: JSON.stringify({ airport: 'lantau' }) });
    expect(data.length).toBeGreaterThan(0); expect(meta.customWeights).toBe(true); expect(meta.minimumChangeMinutes).toBe(15);
    for (const route of data) {
      expect(route.legs.some((l: { operator: string }) => l.operator === 'KMB')).toBe(true);
      expect(route.legs.every((l: { networkOperator: string }) => ['KMB', 'LWB'].includes(l.networkOperator))).toBe(true);
      expect(route.finalScore).toBe(scoreRoutes([route], weightingDate(now), weights)[0].finalScore);
      for (let i = 1; i < route.legs.length; i++) {
        expect(Date.parse(route.legs[i].departureTime) - Date.parse(route.legs[i - 1].arrivalTime)).toBeGreaterThanOrEqual(15 * 60000 - 1);
      }
    }
  }, 30000);

  it('rejects inconsistent Must/Ban choices and invalid change times', async () => {
    for (const query of ['operators=CTB&requiredOperators=KMB', 'changeMinutes=-1', 'changeMinutes=61', 'changeMinutes=1.5', 'changeMinutes=', 'modes=BUS&requiredModes=SUBWAY', 'modes=INVALID', 'weights=%7B%22fare%22%3A-1%7D', 'limits=%7B%22walk%22%3A-1%7D', 'limits=%7B%22transfers%22%3A4%7D', 'changeMinutes=15&limits=%7B%22change%22%3A10%7D']) {
      const response = await GET(new NextRequest('http://localhost/api/journey?fromLat=22.33882&fromLon=114.15387&toLat=22.31367&toLon=113.93763&' + query));
      expect(response.status).toBe(400);
    }
  });
  it.each([0, 31, 60])('accepts a %i-minute transfer minimum and keeps physical walking time', async minutes => {
    const { data, meta } = await journey(cheungShaWan, airport, { timeMode: 'depart', time: '2026-11-14T10:00:00+08:00',
      changeMinutes: String(minutes), operators: 'KMB,LWB', requiredOperators: 'KMB', modes: 'BUS', requiredModes: 'BUS' });
    expect(data.length).toBeGreaterThan(0); expect(meta.minimumChangeMinutes).toBe(minutes);
    expect(data.some((route: { legs: unknown[] }) => route.legs.length > 1)).toBe(true);
    for (const route of data) for (let i = 1; i < route.legs.length; i++) {
      const gap = Date.parse(route.legs[i].departureTime) - Date.parse(route.legs[i - 1].arrivalTime);
      expect(gap).toBeGreaterThanOrEqual(Math.max(minutes, route.legs[i].accessWalkMinutes ?? 3) * 60000 - 1);
    }
  }, 30000);
  it.each(['depart', 'arrive'])('filters transit types during %s searches and enforces required types', async timeMode => {
    const { data, meta } = await journey(cheungShaWan, airport, { timeMode, time: '2026-11-14T14:00:00+08:00',
      modes: 'SUBWAY', requiredModes: 'SUBWAY', changeMinutes: '60' });
    expect(data.length).toBeGreaterThan(0); expect(meta.selectedModes).toEqual(['SUBWAY']); expect(meta.requiredModes).toEqual(['SUBWAY']);
    for (const route of data) expect(route.legs.every((leg: { mode: string }) => leg.mode === 'SUBWAY')).toBe(true);
  }, 30000);
  it('allows all transit types to be banned and the walking comparison switched off', async () => {
    const { data } = await journey(cheungShaWan, { lat: 22.3395, lng: 114.1545 }, { modes: '', walkComparison: 'false' });
    expect(data).toEqual([]);
  });
  it.each(['depart', 'arrive'])('excludes banned road intervals during %s graph search while retaining alternatives', async mode => {
    const { data } = await journey(cheungShaWan, airport, { timeMode: mode, time: '2026-11-14T14:00:00+08:00', preferences: '{"roads":{"lantau":"ban"}}' });
    const transit = data.filter((route: { legs: { mode: string }[] }) => route.legs.some(leg => leg.mode !== 'WALK'));
    expect(transit.length).toBeGreaterThan(0);
    for (const route of transit) expect(routeCorridors(route)).not.toContain('lantau');
    expect(transit.some((route: Parameters<typeof routeCorridors>[0]) => routeCorridors(route).includes('tmclk'))).toBe(true);
  }, 30000);
});
