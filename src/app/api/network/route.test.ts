import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { networkPatterns, networkRoutes, networkStops } from '../../../data/transportNetwork';
import { enrichJourneyArrivals } from '../../../data/multimodalLive';

vi.mock('../../../lib/cloudflare', () => ({ getRateLimiter: vi.fn(async () => null) }));
vi.mock('../../../data/multimodalLive', () => ({ enrichJourneyArrivals: vi.fn(async () => undefined) }));
const lookup = (params: string) => GET(new NextRequest('http://localhost/api/network?' + params));
afterEach(() => { vi.mocked(enrichJourneyArrivals).mockReset(); vi.useRealTimers(); });

describe('All-network catalogue', () => {
  it('reports the actual snapshot coverage', async () => {
    const response = await lookup('resource=coverage');
    const data = await response.json();
    expect(data.counts.operators.GMB).toBe(779);
    expect(data.counts.operators.FERRY).toBe(58);
    expect(data.counts.operators.MTR).toBe(10);
  });
  it('preserves regional minibuses that share a route number', async () => {
    const { data } = await (await lookup('resource=routes&operator=GMB&q=1&limit=500')).json();
    const ones = data.filter((r: { number: string }) => r.number === '1');
    expect(ones.length).toBeGreaterThan(1);
    expect(new Set(ones.map((r: { id: string }) => r.id)).size).toBe(ones.length);
  });
  it('finds ferry piers with a mode filter', async () => {
    const { data } = await (await lookup('resource=stops&mode=FERRY&q=Mui%20Wo')).json();
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((s: { mode: string }) => s.mode === 'FERRY')).toBe(true);
  });
  it('understands station suffixes in the station search', async () => {
    const { data } = await (await lookup('resource=stops&q=Central%20Station')).json();
    expect(data.some((s: { mode: string; nameEn: string }) => s.mode === 'SUBWAY' && s.nameEn === 'Central')).toBe(true);
  });
  it('does not invent rail departures when the live feed is unavailable', async () => {
    const { data } = await (await lookup('resource=departures&stop=mtr%3A18&lang=en')).json();
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((r: { status: string; minutes: unknown }) => r.status === 'UNVERIFIED' && r.minutes === null)).toBe(true);
  });
  it('rejects unknown stops and resources', async () => {
    expect((await lookup('resource=departures&stop=unknown')).status).toBe(400);
    expect((await lookup('resource=unknown')).status).toBe(400);
  });
  it('returns exactly the requested native stop interval, rejecting invalid boundaries', async () => {
    const pattern = networkPatterns.find(pattern => pattern.s.length >= 5)!;
    const params = new URLSearchParams({ resource: 'pattern-stops', pattern: pattern.id, board: '1', alight: '4', lang: 'en' });
    const payload = await (await lookup(params.toString())).json();
    expect(payload.stopCount).toBe(3);
    expect(payload.data.map((stop: { id: string }) => stop.id)).toEqual(pattern.s.slice(1, 5).map(stop => networkStops[stop][0]));
    expect(payload.data[0].name).toBe(networkStops[pattern.s[1]][2]);
    for (const [board, alight] of [['-1', '2'], ['2', '2'], ['1.5', '3'], ['0', String(pattern.s.length)]]) {
      params.set('board', board); params.set('alight', alight);
      expect((await lookup(params.toString())).status).toBe(400);
    }
    params.delete('board');
    expect((await lookup(params.toString())).status).toBe(400);
  });
  it('restricts leg arrival lookups to the chosen pattern and boarding position', async () => {
    const pattern = networkPatterns.find(pattern => pattern.s.length >= 4 && pattern.p[1] === 0)!;
    const params = new URLSearchParams({ resource: 'departures', pattern: pattern.id, board: '1', stop: networkStops[pattern.s[1]][0] });
    const { data } = await (await lookup(params.toString())).json();
    expect(data).toHaveLength(1);
    expect(data[0].patternId).toBe(pattern.id);
    const candidate = vi.mocked(enrichJourneyArrivals).mock.calls[0][0];
    expect(candidate).toHaveLength(1);
    expect(candidate[0].legs?.[0].boardingIndex).toBe(1);
    params.set('board', '0');
    expect((await (await lookup(params.toString())).json()).data).toEqual([]);
  });
  it('preserves inferred changes and their non-live provider timing in the response', async () => {
    const pattern = networkPatterns.find(pattern => networkRoutes[pattern.r][1] === 'KMB' && pattern.s.length > 1)!;
    vi.mocked(enrichJourneyArrivals).mockImplementation(async routes => {
      routes[0].legs![0].liveDepartures = [{ time: new Date(Date.now() + 15 * 60000).toISOString(), minutes: 15,
        operator: 'KMB', remark: 'Scheduled Bus', scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE', departureType: 'CHANGED', changedReason: 'OBSERVED_SPACING' }];
    });
    const params = new URLSearchParams({ resource: 'departures', pattern: pattern.id, board: '0', stop: networkStops[pattern.s[0]][0] });
    const { data } = await (await lookup(params.toString())).json();
    expect(data[0]).toMatchObject({ departureType: 'CHANGED', changedReason: 'OBSERVED_SPACING', status: 'TIMETABLE', minutes: 15 });
  });
  it('returns explicit cancellations with no invented clock time or countdown', async () => {
    const pattern = networkPatterns.find(pattern => networkRoutes[pattern.r][1] === 'KMB' && pattern.s.length > 1)!;
    vi.mocked(enrichJourneyArrivals).mockImplementation(async routes => {
      routes[0].legs![0].departureNotices = [{ departureType: 'CANCELLED', operator: 'KMB', remark: 'Departure cancelled' }];
    });
    const params = new URLSearchParams({ resource: 'departures', pattern: pattern.id, board: '0', stop: networkStops[pattern.s[0]][0] });
    const { data } = await (await lookup(params.toString())).json();
    const cancelled = data.find((row: { departureType: string }) => row.departureType === 'CANCELLED');
    expect(cancelled).toMatchObject({ time: null, minutes: null, status: 'UNVERIFIED' });
  });
  it('publishes source-provided company names and actual timetable coverage', async () => {
    const { data } = await (await lookup('resource=operators')).json();
    expect(data).toHaveLength(17);
    expect(data.find((row: { id: string }) => row.id === 'KMB')).toMatchObject({ nameEn: 'Kowloon Motor Bus', liveArrivals: true });
    expect(data.find((row: { id: string }) => row.id === 'MTR').timetablePatterns).toBe(0);
    expect(data.find((row: { id: string }) => row.id === 'RESIDENTS')).toMatchObject({ officialDocuments: true, liveArrivals: false });
  });
  it('serves official residents’ documents and retains GTFS schedules for overlapping routes', async () => {
    const directory = await (await lookup('resource=residents&route=residents%3ANR10')).json();
    expect(directory.resident).toMatchObject({ number: 'NR10', nameEn: 'Wah Ming Estate - Central' });
    expect(new URL(directory.resident.documentUrlTc).hostname).toBe('www.td.gov.hk');
    expect((await lookup('resource=residents&route=unknown')).status).toBe(404);
    const { data } = await (await lookup('resource=routes&operator=RESIDENTS&q=NR331')).json();
    expect(data.map((r: { number: string }) => r.number)).toEqual(['NR331', 'NR331S']);
    const timetable = await (await lookup('resource=timetable&route=1985&date=2026-11-14')).json();
    expect(timetable.company.id).toBe('PI');
    expect(timetable.residentDocument.number).toBe('NR331');
    expect(timetable.timetablePublished).toBe(true);
  });
  it('returns complete timetable records for a selected route, not just its next trip', async () => {
    const index = networkPatterns.findIndex(pattern => pattern.w.length > 5);
    const pattern = networkPatterns[index];
    const params = new URLSearchParams({ resource: 'timetable', route: networkRoutes[pattern.r][0], pattern: pattern.id, date: '2026-11-13' });
    const data = await (await lookup(params.toString())).json();
    expect(data.entries.length).toBeGreaterThan(1);
    expect(data.meta.allPublishedWindows).toBe(true);
    expect(data.company.id).toBe(networkRoutes[pattern.r][1]);
    expect((await lookup('resource=timetable&route=missing&date=2026-02-30')).status).toBe(400);
  });
  it('keeps live added departures for routes with no next scheduled departure', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T04:00:00Z'));
    const index = networkPatterns.findIndex(pattern => networkRoutes[pattern.r][1] === 'KMB' && pattern.s.length > 1);
    const pattern = networkPatterns[index], saved = pattern.w; pattern.w = [];
    vi.mocked(enrichJourneyArrivals).mockImplementation(async routes => {
      for (const route of routes) {
        const leg = route.legs![0];
        if (networkPatterns[leg.networkPattern!].r !== pattern.r) continue;
        leg.serviceEnded = false; leg.serviceStatus = 'LIVE';
        leg.liveDepartures = [3, 9].map(minutes => ({ minutes, time: new Date(Date.now() + minutes * 60000).toISOString(), scheduleMatch: 'ADDED', addedReason: 'PROVIDER' }));
      }
    });
    try {
      const { data } = await (await lookup('resource=departures&stop=' + encodeURIComponent(networkStops[pattern.s[0]][0]))).json();
      const added = data.filter((row: { routeId: string; status: string }) => row.routeId === networkRoutes[pattern.r][0] && row.status === 'LIVE');
      expect(added.some((row: { minutes: number; scheduleMatch: string }) => row.minutes === 3 && row.scheduleMatch === 'ADDED')).toBe(true);
      expect(added.some((row: { minutes: number }) => row.minutes === 9)).toBe(true);
    } finally { pattern.w = saved; }
  });
  it('preserves the actual company on every joint-service arrival and the shared route identity', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T04:00:00Z'));
    const index = networkPatterns.findIndex(pattern => networkRoutes[pattern.r][1] === 'KMB+CTB' && pattern.s.length > 1);
    const pattern = networkPatterns[index];
    vi.mocked(enrichJourneyArrivals).mockImplementation(async routes => {
      for (const route of routes) {
        const leg = route.legs![0];
        if (networkPatterns[leg.networkPattern!].r !== pattern.r) continue;
        leg.serviceEnded = false; leg.serviceStatus = 'LIVE';
        leg.liveDepartures = ['CTB', 'KMB'].map((operator, i) => ({ operator, minutes: 2 + i * 5,
          time: new Date(Date.now() + (2 + i * 5) * 60000).toISOString(), scheduleMatch: 'MATCHED' }));
      }
    });
    const { data } = await (await lookup('resource=departures&stop=' + encodeURIComponent(networkStops[pattern.s[0]][0]))).json();
    const live = data.filter((item: { routeId: string; status: string }) => item.routeId === networkRoutes[pattern.r][0] && item.status === 'LIVE');
    expect(live.map((item: { operator: string }) => item.operator)).toEqual(['CTB', 'KMB']);
    expect(live.every((item: { networkOperator: string }) => item.networkOperator === 'KMB+CTB')).toBe(true);
    expect(live[0].company.id).toBe('CTB');
    expect(live[1].company.id).toBe('KMB');
  });
  it('distinguishes live, provider-scheduled and additional feed departures', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T04:00:00Z'));
    const index = networkPatterns.findIndex(pattern => networkRoutes[pattern.r][1] === 'KMB+CTB' && pattern.s.length > 1);
    const pattern = networkPatterns[index];
    vi.mocked(enrichJourneyArrivals).mockImplementation(async routes => {
      for (const route of routes) {
        const leg = route.legs![0];
        if (networkPatterns[leg.networkPattern!].r !== pattern.r) continue;
        leg.liveDepartures = ['', '原定班次 · Scheduled Bus', '加班車', '加班車 · Scheduled Bus'].map((remark, i) => ({
          operator: i % 2 ? 'KMB' : 'CTB', minutes: 3 + i * 5, remark,
          time: new Date(Date.now() + (3 + i * 5) * 60000).toISOString(), scheduleMatch: 'MATCHED',
        }));
      }
    });
    const { data } = await (await lookup('resource=departures&stop=' + encodeURIComponent(networkStops[pattern.s[0]][0]))).json();
    const rows = data.filter((row: { routeId: string }) => row.routeId === networkRoutes[pattern.r][0]);
    expect(rows.map((row: { departureType: string; status: string }) => [row.departureType, row.status])).toEqual([
      ['LIVE', 'LIVE'], ['SCHEDULED', 'TIMETABLE'], ['ADDITIONAL', 'LIVE'], ['ADDITIONAL', 'TIMETABLE'],
    ]);
  });
});
