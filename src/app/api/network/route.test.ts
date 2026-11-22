import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { networkPatterns, networkRoutes, networkStops } from '../../../data/transportNetwork';
import { enrichJourneyArrivals, enrichTerminalArrivals } from '../../../data/multimodalLive';

vi.mock('../../../lib/cloudflare', () => ({ getRateLimiter: vi.fn(async () => null) }));
vi.mock('../../../data/multimodalLive', () => ({ enrichJourneyArrivals: vi.fn(async () => undefined), enrichTerminalArrivals: vi.fn(async () => undefined) }));
const lookup = (params: string) => GET(new NextRequest('http://localhost/api/network?' + params));
afterEach(() => { vi.mocked(enrichJourneyArrivals).mockReset(); vi.mocked(enrichTerminalArrivals).mockReset(); vi.useRealTimers(); });

describe('All-network catalogue', () => {
  it('provides route directions, complete ordered stops and fares without endpoints', async () => {
    const route = networkRoutes.find(row => row[2] === '74X')!;
    const response = await lookup('resource=route-map&route=' + encodeURIComponent(route[0]));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.route.number).toBe('74X');
    expect(data.patterns.length).toBeGreaterThan(1);
    for (const pattern of data.patterns) {
      const source = networkPatterns[pattern.index];
      expect(pattern.stops.map((stop: { id: string }) => stop.id)).toEqual(source.s.map(index => networkStops[index][0]));
      expect(pattern.stops[0].lat).toBeGreaterThan(22);
      expect(['PUBLISHED', 'FULL_FARE', 'UNAVAILABLE']).toContain(pattern.stops[0].fareStatus);
    }
    expect((await lookup('resource=route-map&route=missing')).status).toBe(404);
  });
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
    expect((await lookup('resource=departures&stop=mtr%3A18&history=true')).status).toBe(400);
    expect((await lookup('resource=unknown')).status).toBe(400);
  });
  it('returns calculated timetable shifts that departed during the previous 24 hours', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T10:25:00+08:00'));
    const pattern = networkPatterns.find(item => networkRoutes[item.r][1] === 'KMB' && item.s.length > 2 && item.p[0] === 0 && item.w.length > 0)!;
    const saved = pattern.w;
    pattern.w = [[127, 600, 640, 10, 20]];
    try {
      const params = new URLSearchParams({ resource: 'departures', stop: networkStops[pattern.s[0]][0], route: networkRoutes[pattern.r][0], pattern: pattern.id, board: '0', history: 'true' });
      const payload = await (await lookup(params.toString())).json();
      const departed = payload.data.filter((row: { pastSchedule?: boolean }) => row.pastSchedule);
      expect(departed.map((row: { time: string }) => row.time)).toEqual(['2026-11-12T02:30:00.000Z', '2026-11-13T02:00:00.000Z', '2026-11-13T02:10:00.000Z', '2026-11-13T02:20:00.000Z']);
      expect(departed.every((row: { timetableEstimate?: boolean; status: string }) => row.timetableEstimate && row.status === 'TIMETABLE')).toBe(true);
      expect(payload.data.every((row: { pastSchedule?: boolean }) => row.pastSchedule)).toBe(true);
    } finally { pattern.w = saved; }
  });
  it('finds departures leaving from the opposite direction at a route terminal', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T10:25:00+08:00'));
    const pattern = networkPatterns.find(item => networkRoutes[item.r][1] === 'KMB' && item.s.length === 3 && item.w.length > 0)!;
    const terminal = pattern.s.at(-1)!;
    const reverse = { ...pattern, id: 'test-terminal-reverse', s: [...pattern.s].reverse(), t: [0, 10, 20], p: [0, 0, 0], a: [0, 0, 0], w: [[127, 600, 640, 10, 20]] };
    networkPatterns.push(reverse);
    try {
      const params = new URLSearchParams({ resource: 'departures', stop: networkStops[terminal][0], route: networkRoutes[pattern.r][0], history: 'true', terminal: 'true' });
      const { data } = await (await lookup(params.toString())).json();
      expect(data.some((row: { patternId: string; pastSchedule?: boolean }) => row.patternId === reverse.id && row.pastSchedule)).toBe(true);
      expect(data.every((row: { patternId: string }) => row.patternId === reverse.id || networkPatterns.find(candidate => candidate.id === row.patternId)?.s[0] === terminal)).toBe(true);
    } finally { networkPatterns.pop(); }
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
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((row: { patternId: string }) => row.patternId === pattern.id)).toBe(true);
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
  it('lists all N241 trips in the selected direction, including estimated arrivals at the final stop', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T23:55:00+08:00'));
    const route = '1437', pattern = 'td:569', date = '2026-11-14';
    const first = { route, pattern, stop: '4175', position: '0' };
    const stopCount = networkPatterns.find(row => row.id === pattern)!.s.length;
    const last = { route, pattern, stop: '9440', position: String(stopCount - 1) };
    const timetable = async (stop: typeof first) =>
      (await lookup(new URLSearchParams({ resource: 'timetable', date, ...stop }).toString())).json();
    const origin = await timetable(first), terminal = await timetable(last);
    expect(origin.route[2]).toBe('N241');
    expect(origin.slots).toHaveLength(11);
    expect(origin.slots[0]).toEqual({ time: '2026-11-13T16:30:00.000Z', comparisonBasis: 'FREQUENCY' });
    expect(origin.slots.at(-1).time).toBe('2026-11-13T21:30:00.000Z');
    expect(terminal.slots).toEqual(origin.slots.map((row: { time: string }) => ({
      time: new Date(Date.parse(row.time) + 84 * 60000).toISOString(), comparisonBasis: 'INTERPOLATED',
    })));

    const params = new URLSearchParams({ resource: 'departures', scope: 'route-stop', route, pattern, stop: last.stop, board: last.position });
    const { data } = await (await lookup(params.toString())).json();
    expect(data.map((row: { time: string }) => row.time)).toEqual(terminal.slots.map((row: { time: string }) => row.time));
    expect(data[0]).toMatchObject({ minutes: 119, patternId: pattern, status: 'TIMETABLE', timetableEstimate: true });
    expect(enrichJourneyArrivals).not.toHaveBeenCalled();
    expect(enrichTerminalArrivals).toHaveBeenCalled();
    params.set('scope', 'stop');
    expect((await (await lookup(params.toString())).json()).data).toEqual([]);
    params.set('scope', 'route-stop'); params.set('pattern', 'td:570');
    expect((await lookup(params.toString())).status).toBe(400);

    params.set('pattern', pattern); params.set('stop', first.stop); params.set('board', '0');
    const upcoming = await (await lookup(params.toString())).json();
    expect(upcoming.data.map((row: { time: string }) => row.time)).toEqual(origin.slots.map((row: { time: string }) => row.time));
    expect(enrichJourneyArrivals).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-11-14T08:00:00+08:00'));
    params.set('stop', last.stop); params.set('board', last.position); params.set('history', 'true');
    const history = await (await lookup(params.toString())).json();
    expect(history.data).toHaveLength(11);
    expect(history.data.every((row: { pastSchedule: boolean; timetableEstimate: boolean }) => row.pastSchedule && row.timetableEstimate)).toBe(true);
    expect(enrichJourneyArrivals).toHaveBeenCalledTimes(1);
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
    const rows = data.filter((row: { routeId: string; timetableEstimate?: boolean }) => row.routeId === networkRoutes[pattern.r][0] && !row.timetableEstimate);
    expect(rows.map((row: { departureType: string; status: string }) => [row.departureType, row.status])).toEqual([
      ['LIVE', 'LIVE'], ['SCHEDULED', 'TIMETABLE'], ['ADDITIONAL', 'LIVE'], ['ADDITIONAL', 'TIMETABLE'],
    ]);
  });
  it('extends the provider preview beyond one hour with labelled three-hour timetable estimates', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T21:11:00+08:00'));
    const pattern = networkPatterns.find(pattern => networkRoutes[pattern.r][2] === 'B10' && networkStops[pattern.s[0]][0] === '13393')!;
    vi.mocked(enrichJourneyArrivals).mockImplementation(async routes => {
      routes[0].legs![0].liveDepartures = ['21:20', '21:30'].map(clock => ({
        time: '2026-11-13T' + clock + ':00+08:00', minutes: clock === '21:20' ? 9 : 19, remark: 'Scheduled Bus',
        scheduleMatch: 'MATCHED', timingType: 'SCHEDULED', operator: 'KMB',
      }));
    });
    const params = new URLSearchParams({ resource: 'departures', pattern: pattern.id, board: '0', stop: '13393' });
    const { data } = await (await lookup(params.toString())).json();
    expect(data.filter((row: { timetableEstimate?: boolean }) => !row.timetableEstimate)).toHaveLength(2);
    const estimates = data.filter((row: { timetableEstimate?: boolean }) => row.timetableEstimate);
    expect(estimates.length).toBeGreaterThan(3);
    expect(estimates.every((row: { time: string; status: string; departureType: string }) => Date.parse(row.time) > Date.parse('2026-11-13T21:30:00+08:00') && row.status === 'TIMETABLE' && row.departureType === 'SCHEDULED')).toBe(true);
    expect(estimates.some((row: { minutes: number }) => row.minutes > 60)).toBe(true);
    expect(estimates.every((row: { minutes: number }) => row.minutes <= 180)).toBe(true);
    expect(new Set(data.map((row: { time: string }) => Date.parse(row.time))).size).toBe(data.length);
  });
  it('does not append the original slot behind an early-shifted prediction or a confirmed cancellation', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T21:01:00+08:00'));
    const pattern = networkPatterns.find(pattern => networkRoutes[pattern.r][2] === 'B10' && networkStops[pattern.s[0]][0] === '13393')!;
    vi.mocked(enrichJourneyArrivals).mockImplementation(async routes => {
      routes[0].legs![0].liveDepartures = [{ time: '2026-11-13T21:10:00+08:00', minutes: 9, remark: 'Scheduled Bus',
        scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE', departureType: 'CHANGED', changedReason: 'POSSIBLE_SHIFT',
        timetableTime: '2026-11-13T21:15:00+08:00' }];
      routes[0].legs![0].departureNotices = [{ departureType: 'CANCELLED', operator: 'KMB', remark: 'Cancelled', time: '2026-11-13T21:45:00+08:00' }];
    });
    const params = new URLSearchParams({ resource: 'departures', pattern: pattern.id, board: '0', stop: '13393' });
    const { data } = await (await lookup(params.toString())).json();
    const estimates = data.filter((row: { timetableEstimate?: boolean }) => row.timetableEstimate);
    expect(estimates.every((row: { time: string }) => !['21:15', '21:45'].some(clock => Date.parse(row.time) === Date.parse('2026-11-13T' + clock + ':00+08:00')))).toBe(true);
    expect(data.some((row: { departureType: string }) => row.departureType === 'CANCELLED')).toBe(true);
  });
});
