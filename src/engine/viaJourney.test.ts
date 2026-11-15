import { describe, expect, it } from 'vitest';
import { joinViaJourney } from './viaJourney';
import { scoreRoutes, type Route } from './UpgradedScoringEngine';
import { DEFAULT_LIMITS, withinJourneyLimits } from '../domain/journeyLimits';
import { parseJourneyVia } from '../domain/journeyVia';

const via = { id: 'via', name: 'Mong Kok', lat: 22.319, lng: 114.17 };
const before: Route = { id: 'first', originWalkMinutes: 2, destinationWalkMinutes: 3, walkTransferTimeMinutes: 5,
  departureTime: '2026-11-14T02:00:00Z', arrivalTime: '2026-11-14T02:20:00Z', timeMode: 'depart',
  legs: [{ id: 'bus', mode: 'BUS', operator: 'KMB', fare: 6, journeyTimeMinutes: 10, accessWalkMinutes: 2, scheduledWaitMinutes: 5 }] };
const after: Route = { id: 'second', originWalkMinutes: 4, destinationWalkMinutes: 1, walkTransferTimeMinutes: 5,
  departureTime: '2026-11-14T02:23:00Z', arrivalTime: '2026-11-14T02:40:00Z', timeMode: 'depart',
  legs: [{ id: 'bus', mode: 'BUS', operator: 'CTB', fare: 8, journeyTimeMinutes: 10, accessWalkMinutes: 4, scheduledWaitMinutes: 2 }] };

describe('Via journeys', () => {
  it('charges both stage walks and fares once, retaining time and waypoint boundaries', () => {
    const joined = joinViaJourney(before, after, via)!;
    expect(joined).toMatchObject({ via, viaLegIndex: 1, originWalkMinutes: 2, destinationWalkMinutes: 1,
      walkTransferTimeMinutes: 10, transferCount: 1, departureTime: before.departureTime, arrivalTime: after.arrivalTime });
    expect(joined.legs![1]).toMatchObject({ accessWalkMinutes: 7, scheduledWaitMinutes: 5 });
    expect(new Set(joined.legs!.map(l => l.id)).size).toBe(2);
    expect(scoreRoutes([joined])[0].discountedFare).toBe(14);
    expect(after.legs![0].scheduledWaitMinutes).toBe(2);
    expect(withinJourneyLimits(joined, { ...DEFAULT_LIMITS, transfers: 0 })).toBe(false);
    expect(withinJourneyLimits(joined, { ...DEFAULT_LIMITS, walk: 9 })).toBe(false);
    expect(withinJourneyLimits(joined, { ...DEFAULT_LIMITS, change: 11 })).toBe(false);
    expect(withinJourneyLimits(joined, { ...DEFAULT_LIMITS, wait: 4 })).toBe(false);
    expect(withinJourneyLimits(joined, { ...DEFAULT_LIMITS, change: 12, walk: 10, wait: 5 })).toBe(true);
  });
  it('counts explicit walking stages without inventing a vehicle transfer', () => {
    const walk = { ...after, walkTransferTimeMinutes: 0, originWalkMinutes: 0, destinationWalkMinutes: 0,
      legs: [{ id: 'walk', mode: 'WALK', operator: 'WALK', journeyTimeMinutes: 15, fare: 0 }] };
    const joined = joinViaJourney(before, walk, via)!;
    expect(joined.transferCount).toBe(0);
    expect(withinJourneyLimits(joined, { ...DEFAULT_LIMITS, walk: 19 })).toBe(false);
    expect(scoreRoutes([joined])[0].discountedFare).toBe(6);
  });
  it('rejects disconnected stages instead of returning an impossible journey', () => {
    expect(joinViaJourney(before, { ...after, departureTime: '2026-11-14T02:19:00Z' }, via)).toBeUndefined();
    expect(joinViaJourney(before, { ...after, legs: [] }, via)).toBeUndefined();
  });
  it('allows no Via and validates a complete waypoint', () => {
    expect(parseJourneyVia(new URLSearchParams())).toBeUndefined();
    expect(parseJourneyVia(new URLSearchParams('viaLat=22.319&viaLon=114.17&viaName=Mong+Kok'))).toEqual(via);
  });
  it.each(['viaLat=22.3', 'viaLon=114.1', 'viaLat=&viaLon=114', 'viaLat=nope&viaLon=114', 'viaLat=0&viaLon=0'])('rejects %s without dropping the waypoint', query => {
    expect(() => parseJourneyVia(new URLSearchParams(query))).toThrow('Via');
  });
});
