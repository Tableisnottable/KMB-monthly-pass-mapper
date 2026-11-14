import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { networkPatterns, networkRoutes, networkStops, serviceCalendarStatus, type NetworkPattern } from './transportNetwork';
import { exceptions } from './transport/snapshot';
import { classifyDepartureTypes, compareDepartureToTimetable, matchDepartureToTimetable, nextPublishedDeparture, parseServiceDate, patternTimetable, routeTimetable } from './networkTimetable';
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
  it('compares provider-scheduled terminal times with slots as well as service windows', () => {
    expect(match('16:00:00', '原定班次 · Scheduled Bus')).toEqual({ scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE' });
    expect(match('10:37:00', 'Scheduled Bus')).toEqual({ scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE' });
    expect(match('10:40:00', 'Scheduled Bus')).toEqual({ scheduleMatch: 'MATCHED' });
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

describe('Observed timetable changes', () => {
  function rows(times: string[], boarding = 0, operator = 'KMB') {
    return times.map(clock => {
      const time = day + 'T' + clock + ':00+08:00';
      return { time, minutes: 0, operator, remark: 'Scheduled Bus', ...matchDepartureToTimetable(index, boarding, 2, time, 'Scheduled Bus') };
    });
  }
  function baseline() {
    networkPatterns[index].w = [[127, 420, 450, 10, 20], [127, 450, 481, 15, 20]];
  }
  it('marks a slower 15-minute revision as inferred, retaining unchanged slots', () => {
    baseline();
    const result = classifyDepartureTypes(index, 0, rows(['07:00', '07:15', '07:30', '07:45', '08:00']));
    expect(result.map(row => row.departureType)).toEqual(['SCHEDULED', 'CHANGED', 'SCHEDULED', 'SCHEDULED', 'SCHEDULED']);
    expect(result[1].changedReason).toBe('OBSERVED_SPACING');
  });
  it('recognises the user example of a slower 20-minute pattern', () => {
    baseline();
    const result = classifyDepartureTypes(index, 0, rows(['07:00', '07:20', '07:40', '08:00']));
    expect(result.map(row => row.departureType)).toEqual(['SCHEDULED', 'SCHEDULED', 'CHANGED', 'SCHEDULED']);
  });
  it('keeps faster additional departures separate from slower changed service', () => {
    networkPatterns[index].w = [[127, 420, 481, 15, 20]];
    const result = classifyDepartureTypes(index, 0, rows(['07:00', '07:05', '07:10', '07:15']));
    expect(result.map(row => row.departureType)).toEqual(['SCHEDULED', 'ADDITIONAL', 'ADDITIONAL', 'SCHEDULED']);
  });
  it('requires three distinct departures from the same operator and does not mutate its input', () => {
    baseline();
    const input = rows(['07:00', '07:15']);
    const mixed = [...input, ...rows(['07:40'], 0, 'CTB')];
    expect(classifyDepartureTypes(index, 0, mixed).some(row => row.departureType === 'CHANGED')).toBe(false);
    expect(classifyDepartureTypes(index, 0, [...input, input[0]]).some(row => row.departureType === 'CHANGED')).toBe(false);
    expect(input[1]).not.toHaveProperty('changedReason');
  });
  it('does not infer changes from intermediate stop interpolation or absent calendars', () => {
    baseline();
    expect(classifyDepartureTypes(index, 1, rows(['07:10', '07:30', '07:50'], 1)).some(row => row.departureType === 'CHANGED')).toBe(false);
    networkPatterns[index].w = [];
    expect(classifyDepartureTypes(index, 0, rows(['07:00', '07:20', '07:40'])).every(row => row.scheduleMatch === 'UNVERIFIED' && row.departureType === 'SCHEDULED')).toBe(true);
  });
  it('never overrides a provider-confirmed extra with an inferred change', () => {
    baseline();
    const input = rows(['07:00', '07:15', '07:30', '07:45', '08:00']);
    input[1] = { ...input[1], remark: 'Extra Scheduled Bus', scheduleMatch: 'ADDED', addedReason: 'PROVIDER' };
    expect(classifyDepartureTypes(index, 0, input)[1].departureType).toBe('ADDITIONAL');
  });
});

describe('Timetable time-difference references', () => {
  it('compares early and late observed times without claiming a trip-ID match', () => {
    expect(compareDepartureToTimetable(index, 0, day + 'T10:43:00+08:00')).toEqual({ timetableTime: '2026-11-13T02:40:00.000Z', deviationMinutes: 3, comparisonBasis: 'FREQUENCY' });
    expect(compareDepartureToTimetable(index, 0, day + 'T10:38:00+08:00').deviationMinutes).toBe(-2);
    expect(compareDepartureToTimetable(index, 0, day + 'T15:04:00+08:00')).toMatchObject({ deviationMinutes: 4, comparisonBasis: 'FIXED' });
  });
  it('labels interpolated references and leaves unrelated shifts unavailable', () => {
    expect(compareDepartureToTimetable(index, 1, day + 'T10:43:00+08:00').comparisonBasis).toBe('INTERPOLATED');
    expect(compareDepartureToTimetable(index, 0, day + 'T20:00:00+08:00')).toEqual({});
    expect(compareDepartureToTimetable(index, 0, 'invalid')).toEqual({});
    networkPatterns[index].w = [];
    expect(compareDepartureToTimetable(index, 0, day + 'T10:40:00+08:00')).toEqual({});
  });
});

describe('Official B10 timetable correction', () => {
  const b10 = () => networkPatterns.findIndex(pattern => networkRoutes[pattern.r][2] === 'B10' && networkStops[pattern.s[0]][0] === '13393');
  it('distinguishes 17:40 additional from the 17:45 published slot', () => {
    const i = b10(); expect(i).toBeGreaterThanOrEqual(0);
    const match = (clock: string) => matchDepartureToTimetable(i, 0, 1, day + 'T' + clock + ':00+08:00', '原定班次 · Scheduled Bus');
    expect(match('17:40')).toEqual({ scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE' });
    expect(match('17:45')).toEqual({ scheduleMatch: 'MATCHED' });
    expect(classifyDepartureTypes(i, 0, ['17:40', '17:45'].map(clock => ({ time: day + 'T' + clock + ':00+08:00', minutes: 0, remark: 'Scheduled Bus', ...match(clock) }))).map(row => row.departureType)).toEqual(['ADDITIONAL', 'SCHEDULED']);
  });
  it('changes to 20-minute service at 23:30, not 23:00', () => {
    const rows = patternTimetable(b10(), day);
    expect(rows.map(row => [row.startMinute, row.endMinute, row.headwayMinutes])).toEqual([[360, 1410, 15], [1410, 1470, 20]]);
    expect(nextPublishedDeparture(b10(), 0, new Date(day + 'T23:01:00+08:00'))?.time).toBe('2026-11-13T15:15:00.000Z');
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
