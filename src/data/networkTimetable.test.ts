import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { networkPatterns, networkRoutes, networkStops, serviceCalendarStatus, type NetworkPattern } from './transportNetwork';
import { exceptions } from './transport/snapshot';
import { classifyDepartureTypes, compareDepartureToTimetable, matchDepartureToTimetable, nextPublishedDeparture, parseServiceDate, patternTimetable, publishedDeparturesAround, routeTimetable, upcomingPublishedDepartures } from './networkTimetable';
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
  it('previews three hours of departures, explicitly marked as timetable estimates', () => {
    networkPatterns[index].w = [[127, 600, 840, 15, 20]];
    const rows = upcomingPublishedDepartures(index, 0, new Date(day + 'T10:00:00+08:00'));
    expect(rows).toHaveLength(13);
    expect(rows.at(-1)?.minutes).toBe(180);
    expect(rows.every(row => row.timetableEstimate && row.departureType === 'SCHEDULED' && row.timingType === 'SCHEDULED')).toBe(true);
    expect(rows[0].comparisonBasis).toBe('FREQUENCY');
  });
  it('calculates departed and upcoming timetable slots around the current clock', () => {
    networkPatterns[index].w = [[127, 600, 660, 15, 20]];
    const rows = publishedDeparturesAround(index, 0, new Date(day + 'T10:30:00+08:00'), 60, 180);
    expect(rows.map(row => row.minutes)).toEqual([-30, -15, 0, 15]);
    expect(rows.filter(row => row.pastSchedule).map(row => row.minutes)).toEqual([-30, -15]);
    expect(rows.filter(row => !row.pastSchedule).every(row => row.minutes >= 0)).toBe(true);
  });
  it('calculates overnight departed slots from the previous service date', () => {
    networkPatterns[index].w = [[127, 1530, 1590, 20, 20]];
    const rows = publishedDeparturesAround(index, 0, new Date(day + 'T02:15:00+08:00'), 60, 0);
    expect(rows.map(row => row.time)).toEqual(['2026-11-12T17:30:00.000Z', '2026-11-12T17:50:00.000Z', '2026-11-12T18:10:00.000Z']);
    expect(rows.every(row => row.pastSchedule)).toBe(true);
  });
  it('deduplicates overlapping windows and respects exclusive ends in the preview', () => {
    networkPatterns[index].w = [[127, 600, 660, 15, 20], [127, 630, 660, 15, 20]];
    expect(upcomingPublishedDepartures(index, 0, new Date(day + 'T10:00:00+08:00')).map(row => row.minutes)).toEqual([0, 15, 30, 45]);
  });
  it('previews after-midnight shifts and keeps missing/out-of-calendar timetables empty', () => {
    networkPatterns[index].w = [[127, 1410, 1470, 20, 20]];
    expect(upcomingPublishedDepartures(index, 0, new Date(day + 'T23:45:00+08:00')).map(row => row.minutes)).toEqual([5, 25]);
    expect(upcomingPublishedDepartures(index, 0, new Date('2100-01-01T23:45:00+08:00'))).toEqual([]);
    networkPatterns[index].w = [];
    expect(upcomingPublishedDepartures(index, 0, new Date(day + 'T10:00:00+08:00'))).toEqual([]);
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
  it('validates service dates, variants and stop positions', () => {
    expect(() => parseServiceDate('2026-02-30')).toThrow();
    expect(() => parseServiceDate('13/11/2026')).toThrow();
    expect(() => routeTimetable('missing', day)).toThrow('Unknown route');
    expect(() => routeTimetable(networkRoutes[original.r][0], day, original.id, 'missing')).toThrow('Choose a stop');
    const data = routeTimetable(networkRoutes[original.r][0], day, original.id, networkStops[original.s[0]][0]);
    expect(data.entries).toHaveLength(2);
    expect(data.variants.length).toBeGreaterThan(0);
    expect(() => routeTimetable(networkRoutes[original.r][0], day, original.id, networkStops[original.s[0]][0], 2)).toThrow('Choose a stop');
  });
  it('distinguishes repeated stops by position and includes an alighting-only final stop', () => {
    const pattern = networkPatterns[index], routeId = networkRoutes[pattern.r][0];
    networkPatterns[index] = { ...pattern, s: [pattern.s[0], pattern.s[1], pattern.s[0]], p: [0, 0, 1] };
    const stop = networkStops[pattern.s[0]][0];
    expect(routeTimetable(routeId, day, pattern.id, stop, 0).entries.map(row => row.startMinute)).toEqual([600, 900]);
    expect(routeTimetable(routeId, day, pattern.id, stop, 2).entries.map(row => row.startMinute)).toEqual([620, 940]);
    expect(patternTimetable(index, day, 2)).toEqual([]);
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
  it('does not call an out-of-window live ETA an additional departure', () => {
    expect(match('16:00:00')).toEqual({ scheduleMatch: 'UNVERIFIED' });
  });
  it('does not infer extra buses from interpolated intermediate-stop times', () => {
    for (const remark of ['', 'Scheduled Bus']) {
      expect(matchDepartureToTimetable(index, 1, 2, day + 'T16:00:00+08:00', remark))
        .toEqual({ scheduleMatch: 'UNVERIFIED' });
    }
    expect(matchDepartureToTimetable(index, 1, 2, day + 'T16:00:00+08:00', '加班車'))
      .toEqual({ scheduleMatch: 'ADDED', addedReason: 'PROVIDER' });
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
  it('counts four live buses against two timetable slots rather than marking every mismatched time extra', () => {
    networkPatterns[index].w = [[127, 600, 661, 15, 20]];
    const input = ['10:00', '10:05', '10:10', '10:15'].map(clock => ({
      time: day + 'T' + clock + ':00+08:00', minutes: 1, operator: 'KMB', timingType: 'LIVE' as const,
      ...matchDepartureToTimetable(index, 0, 2, day + 'T' + clock + ':00+08:00'),
    }));
    const classified = classifyDepartureTypes(index, 0, input);
    expect(classified.filter(row => row.departureType === 'ADDITIONAL')).toHaveLength(2);
    expect(input.every(row => row.scheduleMatch !== 'ADDED')).toBe(true);
  });
  it('retains simultaneous vehicles in count comparisons and does not double-count confirmed extras', () => {
    networkPatterns[index].w = [[127, 600, 661, 15, 20]];
    const input = ['10:00', '10:05', '10:05', '10:15'].map((clock, i) => ({
      time: day + 'T' + clock + ':00+08:00', minutes: 1, operator: 'KMB', timingType: 'LIVE' as const,
      remark: i === 1 ? '加班車' : '', ...matchDepartureToTimetable(index, 0, 2, day + 'T' + clock + ':00+08:00', i === 1 ? '加班車' : ''),
    }));
    const classified = classifyDepartureTypes(index, 0, input);
    expect(classified).toHaveLength(4);
    expect(classified.filter(row => row.departureType === 'ADDITIONAL')).toHaveLength(2);
  });
  it('recognises possible shifted live times without inventing additional buses or cancellation', () => {
    networkPatterns[index].w = [[127, 600, 661, 15, 20]];
    const input = ['10:01', '10:16', '10:31'].map(clock => ({
      time: day + 'T' + clock + ':00+08:00', minutes: 1, operator: 'KMB', timingType: 'LIVE' as const, scheduleMatch: 'MATCHED' as const,
    }));
    expect(classifyDepartureTypes(index, 0, input).map(row => row.changedReason)).toEqual(['POSSIBLE_SHIFT', 'POSSIBLE_SHIFT', 'POSSIBLE_SHIFT']);
    expect(classifyDepartureTypes(index, 0, input).some(row => row.departureType === 'ADDITIONAL' || row.departureType === 'CANCELLED')).toBe(false);
    networkPatterns[index].w = [];
    expect(classifyDepartureTypes(index, 0, input).some(row => row.departureType === 'ADDITIONAL')).toBe(false);
  });
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
  it('requires three distinct departures from the same operator for spacing inference and does not mutate its input', () => {
    baseline();
    const input = rows(['07:00', '07:15']);
    const mixed = [...input, ...rows(['07:40'], 0, 'CTB')];
    expect(classifyDepartureTypes(index, 0, mixed).some(row => row.changedReason === 'OBSERVED_SPACING')).toBe(false);
    expect(classifyDepartureTypes(index, 0, [...input, input[0]]).some(row => row.changedReason === 'OBSERVED_SPACING')).toBe(false);
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
  it.each([['21:10', -5], ['21:20', 5]] as const)('shows %s as a possible earlier/later move of 21:15 without needing three rows', (clock, delta) => {
    networkPatterns[index].w = [[127, 1260, 1320, 15, 20]];
    const result = classifyDepartureTypes(index, 0, rows([clock, '21:30']));
    expect(result[0]).toMatchObject({ departureType: 'CHANGED', changedReason: 'POSSIBLE_SHIFT',
      timetableTime: '2026-11-13T13:15:00.000Z', deviationMinutes: delta });
    expect(result[1].departureType).toBe('SCHEDULED');
  });
  it('keeps two competing shifted times uncertain rather than claiming either is a confirmed trip match', () => {
    networkPatterns[index].w = [[127, 1260, 1320, 15, 20]];
    const result = classifyDepartureTypes(index, 0, rows(['21:10', '21:20', '21:30']));
    expect(result.slice(0, 2).every(row => row.changedReason === 'POSSIBLE_SHIFT')).toBe(true);
    expect(result[0].timetableTime).toBe(result[1].timetableTime);
  });
  it('does not infer a moved slot when the original slot is still in the feed, including joint services', () => {
    networkPatterns[index].w = [[127, 1260, 1320, 15, 20]];
    const result = classifyDepartureTypes(index, 0, [...rows(['21:10']), ...rows(['21:15'], 0, 'CTB')]);
    expect(result[0].departureType).toBe('ADDITIONAL');
    expect(result[0].changedReason).toBeUndefined();
  });
  it('preserves explicit cancellations and extras when checking possible shifts', () => {
    networkPatterns[index].w = [[127, 1260, 1320, 15, 20]];
    const input = rows(['21:10', '21:20', '21:30']);
    input[0].remark = 'Cancelled Scheduled Bus';
    input[1].remark = 'Additional Scheduled Bus';
    expect(classifyDepartureTypes(index, 0, input).map(row => row.departureType)).toEqual(['CANCELLED', 'ADDITIONAL', 'SCHEDULED']);
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
