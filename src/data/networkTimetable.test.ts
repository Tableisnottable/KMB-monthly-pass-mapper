import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { networkPatterns, networkRoutes, networkStops, serviceCalendarStatus, type NetworkPattern } from './transportNetwork';
import { exceptions } from './transport/snapshot';
import { matchDepartureToTimetable, nextPublishedDeparture, parseServiceDate, patternTimetable, routeTimetable } from './networkTimetable';
import { operatorInfo, transportOperators } from './transportOperators';

const day = '2026-11-13';
const index = networkPatterns.findIndex(pattern => pattern.s.length >= 3 && pattern.w.length > 0);
const original = networkPatterns[index];
let saved: [number, NetworkPattern][];
beforeEach(() => {
  saved = networkPatterns.flatMap((pattern, index) => pattern.r === original.r ? [[index, pattern] as [number, NetworkPattern]] : []);
  for (const [index, pattern] of saved) networkPatterns[index] = { ...pattern, w: [] };
  networkPatterns[index] = { ...original, s: original.s.slice(0, 3), p: [0, 0, 0], a: [0, 0, 0], t: [0, 10, 20],
    w: [[127, 600, 660, 10, 20], [127, 900, 900, 0, 40]] };
});
afterEach(() => { for (const [index, pattern] of saved) networkPatterns[index] = pattern; });

describe('Published service timetables', () => {
  it('retains complete frequency windows without inventing individual exact departures', () => {
    const rows = patternTimetable(index, day);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: 'FREQUENCY', headwayMinutes: 10, startMinute: 600, endMinute: 660 });
    expect(rows[1]).toMatchObject({ kind: 'DEPARTURE', startMinute: 900, endMinute: 900 });
    expect(rows[0].start).toBe('2026-11-13T02:00:00.000Z');
  });
  it('scales intermediate offsets using each trip run time', () => {
    const rows = patternTimetable(index, day, 1);
    expect(rows.map(row => row.startMinute)).toEqual([610, 920]);
    expect(rows.every(row => row.estimatedStopTime)).toBe(true);
  });
  it('retains after-midnight times and searches beyond 90 minutes', () => {
    networkPatterns[index].w = [[127, 1500, 1500, 0, 20]];
    expect(patternTimetable(index, day)[0].start).toBe('2026-11-13T17:00:00.000Z');
    const next = nextPublishedDeparture(index, 0, new Date('2026-11-13T07:00:00+08:00'))!;
    expect(next.minutes).toBe(1080);
    expect(next.time).toBe('2026-11-13T17:00:00.000Z');
  });
  it('respects the exclusive end of a frequency window', () => {
    const next = nextPublishedDeparture(index, 0, new Date(day + 'T11:00:00+08:00'))!;
    expect(next.minutes).toBe(240);
  });
  it('retains calendar additions and removes cancelled service days', () => {
    const addition = exceptions.find(row => Number(row[2]) === 1)!;
    const date = String(addition[1]).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
    networkPatterns[index].w = [[Number(addition[0]), 600, 600, 0, 20]];
    expect(patternTimetable(index, date)[0].calendarAdded).toBe(true);
    networkPatterns[index].w = [[1, 600, 600, 0, 20]];
    expect(patternTimetable(index, '2026-04-06')).toEqual([]);
    expect(serviceCalendarStatus(1, parseServiceDate('2026-04-06'))).toMatchObject({ active: false, covered: true });
  });
  it('validates service dates, variants and boarding stops', () => {
    expect(() => parseServiceDate('2026-02-30')).toThrow();
    expect(() => parseServiceDate('13/11/2026')).toThrow();
    expect(() => routeTimetable('missing', day)).toThrow('Unknown route');
    expect(() => routeTimetable(networkRoutes[original.r][0], day, original.id, 'missing')).toThrow('boarding stop');
    const data = routeTimetable(networkRoutes[original.r][0], day, original.id, networkStops[original.s[0]][0]);
    expect(data.entries).toHaveLength(2);
    expect(data.variants.length).toBeGreaterThan(0);
  });
});

describe('Added live departures', () => {
  const match = (time: string, remark = '') => matchDepartureToTimetable(index, 0, 2, day + 'T' + time + '+08:00', remark);
  it('matches a live arrival within a headway window rather than exact invented slots', () => {
    expect(match('10:37:00').scheduleMatch).toBe('MATCHED');
  });
  it('allows normal ETA drift instead of marking every delayed bus as added', () => {
    expect(match('15:12:00').scheduleMatch).toBe('MATCHED');
  });
  it('shows out-of-window live services as added, with the comparison reason', () => {
    expect(match('16:00:00')).toEqual({ scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE' });
  });
  it('does not infer additional buses from provider-scheduled times outside imported windows', () => {
    expect(match('16:00:00', '原定班次 · Scheduled Bus')).toEqual({ scheduleMatch: 'UNVERIFIED' });
    expect(match('10:37:00', 'Scheduled Bus')).toEqual({ scheduleMatch: 'MATCHED' });
  });
  it('retains provider-confirmed additional services even within a normal service window', () => {
    expect(match('10:37:00', 'Additional departure')).toEqual({ scheduleMatch: 'ADDED', addedReason: 'PROVIDER' });
    expect(match('10:37:00', '加班車').addedReason).toBe('PROVIDER');
  });
  it('matches adjacent service-day trips after midnight', () => {
    networkPatterns[index].w = [[127, 1500, 1500, 0, 20]];
    expect(matchDepartureToTimetable(index, 0, 2, '2026-11-14T01:08:00+08:00').scheduleMatch).toBe('MATCHED');
  });
  it('does not infer added from missing schedules or dates outside calendar coverage', () => {
    networkPatterns[index].w = [];
    expect(match('16:00:00').scheduleMatch).toBe('UNVERIFIED');
    networkPatterns[index].w = [[127, 600, 600, 0, 20]];
    expect(matchDepartureToTimetable(index, 0, 2, '2100-01-01T16:00:00+08:00').scheduleMatch).toBe('UNVERIFIED');
  });
});

describe('Government operator names', () => {
  it('covers the imported networks and preserves bilingual joint operators', () => {
    for (const operator of Array.from(new Set(networkRoutes.map(route => route[1])))) expect(operatorInfo(operator)).toBeDefined();
    expect(operatorInfo('KMB+CTB')?.nameEn).toContain('Citybus');
    expect(transportOperators).toHaveLength(16);
    expect(operatorInfo('FERRY')?.nameEn).toBe('Ferry Services');
  });
});
