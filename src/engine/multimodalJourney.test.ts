import { describe, expect, it } from 'vitest';
import { activeWindows, findMultimodalJourneys, nextDeparture, previousDeparture } from './multimodalJourney';
import { networkPatterns, networkRoutes, networkStops, hongKongClock, isServiceActive, transportCoverage } from '../data/transportNetwork';

const noon = new Date('2026-11-13T04:00:00Z');
const point = (s: typeof networkStops[number]) => ({ lat: s[3], lng: s[4] });

describe('Official transport snapshot', () => {
  it('contains every imported route, calendar and valid stopping pattern', () => {
    expect(networkRoutes).toHaveLength(transportCoverage.counts.routes);
    expect(networkStops).toHaveLength(transportCoverage.counts.stops);
    expect(Object.keys(transportCoverage.counts.operators)).toHaveLength(16);
    expect(new Set(networkRoutes.map(r => r[5])).size).toBe(7);
    for (const p of networkPatterns) {
      expect(networkRoutes[p.r]).toBeDefined();
      expect(p.s.length).toBeGreaterThan(1);
      expect(p.t.length).toBe(p.s.length);
      expect(p.p.length).toBe(p.s.length);
      expect(p.a.length).toBe(p.s.length);
      expect(p.s.every(s => !!networkStops[s])).toBe(true);
      expect(p.t.every((t, i) => Number.isFinite(t) && t >= 0 && (i === 0 || t >= p.t[i - 1]))).toBe(true);
    }
  });

  it('uses Hong Kong dates regardless of server timezone', () => {
    expect(hongKongClock(new Date('2026-11-13T16:30:00Z'))).toEqual({ day: '20261114', weekday: 5, minute: 30 });
    expect(isServiceActive(511, noon)).toBe(true);
    expect(isServiceActive(1, noon)).toBe(false); // Monday-only service on Friday.
  });

  it('applies published public-holiday exceptions', () => {
    expect(isServiceActive(1, new Date('2026-04-06T04:00:00Z'))).toBe(false);
  });
});

describe('Timetables', () => {
  it('finds the latest frequency before an arrival deadline without using the exclusive endpoint', () => {
    const windows = [{ start: 0, end: 30, headway: 10, duration: 30 }];
    expect(previousDeparture(windows, 20, 55)?.wait).toBe(15);
    expect(previousDeparture(windows, 20, 19)).toBeUndefined();
    expect(previousDeparture([{ start: -50, end: -50, headway: 0, duration: 30 }], 20, -25)?.wait).toBe(5);
  });
  it('respects exclusive frequency end and discrete departures', () => {
    const windows = [{ start: 5, end: 25, headway: 10, duration: 30 }];
    expect(nextDeparture(windows, 0, 6)?.wait).toBe(9);
    expect(nextDeparture(windows, 0, 16)).toBeUndefined();
    expect(nextDeparture([{ start: 12, end: 12, headway: 0, duration: 30 }], 5, 15)?.wait).toBe(2);
    expect(nextDeparture([{ start: 12, end: 12, headway: 0, duration: 30 }], 5, 18)).toBeUndefined();
  });

  it('keeps previous-day services after midnight', () => {
    const pattern = { id: 'night', r: 0, d: '1', s: [0,1], t: [0,20], p: [0,0], a: [0,0], w: [[511,1500,1500,0,20]] };
    const windows = activeWindows(pattern, new Date('2026-11-13T16:30:00Z'));
    expect(nextDeparture(windows, 0, 0)?.wait).toBe(30);
  });

  it('includes long gaps before a frequency window in the existing waiting formula', () => {
    const departure = nextDeparture([{ start: 60, end: 120, headway: 5, duration: 20 }], 0, 0)!;
    expect(departure.wait).toBe(60);
    expect(departure.headway * 0.5).toBe(60);
    expect(departure.publishedHeadway).toBe(5);
  });
});

describe('Multimodal connectivity', () => {
  it.each(['SUBWAY', 'LIGHT_RAIL', 'FERRY', 'MINIBUS', 'TRAM', 'CABLE_CAR'])(
    'finds an actual %s ride between published stops', mode => {
      const candidates = networkPatterns.filter(p => networkRoutes[p.r][5] === mode);
      // Choose an active pattern with a useful direct run near noon.
      const p = candidates.find(p => !p.w.length || nextDeparture(activeWindows(p, noon), 0, 1));
      expect(p).toBeDefined();
      const last = p!.s[p!.s.length - 1] === p!.s[0] ? Math.floor(p!.s.length / 2) : p!.s.length - 1;
      const result = findMultimodalJourneys(point(networkStops[p!.s[0]]), point(networkStops[p!.s[last]]), noon, 'en');
      expect(result.routes.some(r => r.legs.some(l => l.mode === mode))).toBe(true);
      expect(result.routes.every(r => r.transferCount <= 3)).toBe(true);
    }, 20000,
  );

  it('connects Light Rail to MTR across different networks', () => {
    const start = networkStops.find(s => s[0] === 'lrt:920')!;
    const end = networkStops.find(s => s[0] === 'mtr:114')!;
    const result = findMultimodalJourneys(point(start), point(end), noon, 'en');
    expect(result.routes.some(r => r.legs.some(l => l.mode === 'LIGHT_RAIL') && r.legs.some(l => l.mode === 'SUBWAY'))).toBe(true);
  }, 20000);
});
