import { describe, expect, it } from 'vitest';
import { networkPatterns, stopOffset } from './transportNetwork';
import { scheduledBusRuns } from './networkVehicles';
import { patternTimetable } from './networkTimetable';

const index = networkPatterns.findIndex(pattern => pattern.id === 'td:569');
describe('Timetable-based buses on the map', () => {
  it('shows N241 trips still running after midnight, preserving the selected direction', () => {
    const rows = scheduledBusRuns(index, new Date('2026-11-19T01:15:00+08:00'));
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.departureTime)).toEqual(['2026-11-18T16:30:00.000Z', '2026-11-18T17:00:00.000Z']);
    expect(rows[0].arrivalTime).toBe('2026-11-18T17:54:00.000Z');
    expect(rows[0].stopOffsetsMinutes.at(-1)).toBe(84);
    expect(rows.every(row => row.id.startsWith('td:569:'))).toBe(true);
    expect(scheduledBusRuns(index, new Date('2026-11-19T12:00:00+08:00'))).toEqual([]);
  });
  it('includes imminent departures for map ticks and excludes completed trips', () => {
    const rows = scheduledBusRuns(index, new Date('2026-11-19T01:29:30+08:00'));
    expect(rows.at(-1)?.departureTime).toBe('2026-11-18T17:30:00.000Z');
    const afterArrival = scheduledBusRuns(index, new Date('2026-11-19T01:54:00+08:00'));
    expect(afterArrival.some(row => row.departureTime === '2026-11-18T16:30:00.000Z')).toBe(false);
  });
  it('uses the same trip timing as the published stop boards', () => {
    const pattern = networkPatterns[index], saved = pattern.t;
    pattern.t = saved.map((_, stop) => stop === 0 ? 0 : stop === saved.length - 1 ? 100 : 20 + stop);
    try {
      const run = scheduledBusRuns(index, new Date('2026-11-19T01:15:00+08:00'))[0];
      const [, , , , duration, profile] = pattern.w[Number(patternTimetable(index, '2026-11-18', 0)[0].id.split(':').at(-2))];
      expect(run.stopOffsetsMinutes).toEqual(pattern.t.map((_, position) => stopOffset(pattern, position, duration, profile)));
      expect(Date.parse(run.arrivalTime) - Date.parse(run.departureTime)).toBeCloseTo(run.stopOffsetsMinutes.at(-1)! * 60000, 0);
    } finally { pattern.t = saved; }
  });
  it('does not invent positions without a covered calendar or valid pattern', () => {
    expect(scheduledBusRuns(index, new Date('2100-01-01T01:15:00+08:00'))).toEqual([]);
    expect(scheduledBusRuns(-1)).toEqual([]);
  });
});
