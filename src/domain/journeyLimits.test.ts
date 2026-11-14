import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, parseJourneyLimits, withinJourneyLimits } from './journeyLimits';
import type { Route } from '../engine/UpgradedScoringEngine';
const route: Route = { id: 'test', walkTransferTimeMinutes: 10, legs: [
  { mode: 'BUS', operator: 'KMB', journeyTimeMinutes: 15, scheduledWaitMinutes: 5, accessWalkMinutes: 2 },
  { mode: 'BUS', operator: 'KMB', journeyTimeMinutes: 20, scheduledWaitMinutes: 7, accessWalkMinutes: 3 },
] };
describe('Optional hard journey limits', () => {
  it('keeps default behaviour and accepts zero plus exact boundaries', () => {
    expect(parseJourneyLimits(null)).toEqual(DEFAULT_LIMITS);
    expect(parseJourneyLimits('{"ride":0,"transfers":0}')).toEqual({ ...DEFAULT_LIMITS, ride: 0, transfers: 0 });
    expect(withinJourneyLimits(route, { transfers: 1, walk: 10, wait: 7, ride: 35, change: 10 })).toBe(true);
    for (const [key, value] of Object.entries({ transfers: 0, walk: 9, wait: 6, ride: 34, change: 9 })) expect(withinJourneyLimits(route, { ...DEFAULT_LIMITS, [key]: value })).toBe(false);
  });
  it('caps walking comparisons by their actual walk duration', () => {
    expect(withinJourneyLimits({ id: 'walk', legs: [{ mode: 'WALK', operator: 'WALK', journeyTimeMinutes: 12 }] }, { ...DEFAULT_LIMITS, walk: 11 })).toBe(false);
  });
  it.each(['[]', '{"ride":-1}', '{"walk":1.5}', '{"transfers":4}', '{"wait":"5"}', '{"unknown":1}', '{"__proto__":0}'])('rejects malformed caps %s', raw => expect(() => parseJourneyLimits(raw)).toThrow());
});
