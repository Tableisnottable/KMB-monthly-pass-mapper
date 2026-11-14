import { describe, expect, it } from 'vitest';
import { travelOption, travelClock } from './travelOptions';
describe('Road/path travel-time estimates', () => {
  it('uses routed duration and distance, not a straight-line speed guess', () => {
    expect(travelOption('cycle', { paths: [[[22.3, 114.1], [22.31, 114.11]]], source: 'OSM_BIKE', distanceMetres: 2800, durationSeconds: 601 })).toMatchObject({ available: true, minutes: 11, distanceMetres: 2800 });
  });
  it('does not invent a time when no legal profile path or duration is returned', () => {
    expect(travelOption('walk', { paths: [], source: 'UNAVAILABLE' }).available).toBe(false);
    expect(travelOption('taxi', { paths: [], source: 'OSM_ROAD', distanceMetres: 100 }).available).toBe(false);
  });
  it('applies departure and arrive-by clocks to the selected date in Hong Kong time', () => {
    const option = travelOption('taxi', { paths: [], source: 'OSM_ROAD', durationSeconds: 1800, distanceMetres: 20000 });
    const clock = travelClock(option, 'arrive', '2026-11-15T12:00', 0)!;
    expect(clock.arrival).toBe('2026-11-15T04:00:00.000Z'); expect(clock.departure).toBe('2026-11-15T03:30:00.000Z');
  });
});
