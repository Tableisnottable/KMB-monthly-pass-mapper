import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS, customWeights, parseRouteWeights } from './routeWeights';
import { scoreRoutes, type Route } from './UpgradedScoringEngine';

describe('User importance controls', () => {
  const routes: Route[] = [{ id: 'fast-costly', legs: [{ operator: 'KMB', mode: 'BUS', fare: 25, journeyTimeMinutes: 10, scheduledWaitMinutes: 0 }] },
    { id: 'slow-cheap', legs: [{ operator: 'KMB', mode: 'BUS', fare: 2, journeyTimeMinutes: 30, scheduledWaitMinutes: 0 }] }];
  it('preserves default scoring exactly and changes rankings when fare importance rises', () => {
    const date = new Date('2026-11-14T12:00:00');
    expect(scoreRoutes(routes, date)).toEqual(scoreRoutes(routes, date, DEFAULT_WEIGHTS));
    expect(scoreRoutes(routes, date)[0].id).toBe('fast-costly');
    const custom = { ...DEFAULT_WEIGHTS, fare: 3 };
    expect(scoreRoutes(routes, date, custom)[0].id).toBe('slow-cheap');
    expect(customWeights(custom)).toBe(true); expect(customWeights(DEFAULT_WEIGHTS)).toBe(false);
  });
  it('changes score components, never the underlying fare or journey minutes', () => {
    const [route] = scoreRoutes([routes[0]], new Date(), { ...DEFAULT_WEIGHTS, ride: 2 });
    expect(route.breakdown.journeyTime).toBe(20); expect(route.legs[0].journeyTimeMinutes).toBe(10); expect(route.discountedFare).toBe(25);
  });
  it.each(['{"fare":-1}', '{"wait":99}', '{"unknown":1}', '[]', '{"__proto__":{}}'])('rejects invalid or unsafe weights %s', raw => expect(() => parseRouteWeights(raw)).toThrow());
});
