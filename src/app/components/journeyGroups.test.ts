import { describe, expect, it } from 'vitest';
import { scoreRoutes, type Route } from '../../engine/UpgradedScoringEngine';
import { combinedLegChoices, groupDurationLabel, groupFareLabel, groupJourneysByStops } from './journeyGroups';

function journey(id: string, services: string[], fare: number, origin = 'start', destination = 'end', transfer = 'change'): Route {
  return { id, walkTransferTimeMinutes: 3, legs: services.map((routeNumber, i) => ({
    operator: 'TEST', mode: 'BUS', routeNumber, fare: i === services.length - 1 ? fare : 0, fareStatus: 'PUBLISHED',
    journeyTimeMinutes: 34, scheduledWaitMinutes: 0,
    originStop: { id: i ? transfer : origin, name: i ? transfer : origin },
    destinationStop: { id: i === services.length - 1 ? destination : transfer, name: i === services.length - 1 ? destination : transfer },
  })) };
}
const combine = (routes: Route[]) => groupJourneysByStops(scoreRoutes(routes));

describe('Combined stop-to-stop journeys', () => {
  it('combines the supplied feeder example and displays the min–max adult fare', () => {
    const [group] = combine([journey('2A', ['2A','NA21'], 45.1), journey('171', ['171','NA21'], 47), journey('72', ['72','NA21'], 47.1)]);
    expect(group.routes).toHaveLength(3);
    expect(groupFareLabel(group, 'en')).toBe('$45.10–$47.10');
    expect(groupDurationLabel(group)).toBe('71');
    expect(combinedLegChoices(group)?.map(legs => legs.map(l => l.routeNumber))).toEqual([['2A','171','72'], ['NA21']]);
  });
  it('keeps each actual transfer, exact fare, time and score on the selectable journey', () => {
    const routes = scoreRoutes([journey('one', ['2A','NA21'], 45.1, 'start', 'end', 'change-A'), journey('two', ['171','NA21'], 47, 'start', 'end', 'change-B')]);
    const [group] = groupJourneysByStops(routes);
    expect(group.routes).toEqual(routes);
    expect(group.routes[1].legs[1].originStop.id).toBe('change-B');
  });
  it('combines nearby feeders joining the same onward service and final stop', () => {
    const groups = combine([journey('one', ['2A','NA21'], 45.1, 'stop-A', 'airport', 'mei-foo'), journey('two', ['37','NA21'], 46, 'stop-B', 'airport', 'kwai-chung')]);
    expect(groups).toHaveLength(1); expect(groupFareLabel(groups[0], 'en')).toBe('$45.10–$46.00');
    expect(groups[0].routes[1].legs[0].originStop.id).toBe('stop-B');
  });
  it('does not combine different direct stop pairs or opposite directions', () => {
    const groups = combine([journey('one', ['2A'], 45), journey('different-start', ['171'], 47, 'other'), journey('different-end', ['37'], 46, 'start', 'other'), journey('reverse', ['2A'], 45, 'end', 'start')]);
    expect(groups).toHaveLength(4);
  });
  it('keeps different modes, transfer counts and ended services separate', () => {
    const base = journey('base', ['2A','NA21'], 45), rail = journey('rail', ['TWL','NA21'], 46), ended = journey('ended', ['171','NA21'], 47);
    rail.legs![0].mode = 'SUBWAY'; ended.legs![0].serviceEnded = true;
    expect(combine([base, rail, ended, journey('direct', ['NA21'], 39.3)])).toHaveLength(4);
  });
  it('never presents invented independent leg combinations', () => {
    const groups = combine([journey('one', ['44','A31'], 27.2), journey('two', ['42A','E32'], 19)]);
    expect(groups).toHaveLength(2);
    const group = { id: 'incomplete', routes: groups.flatMap(g => g.routes) };
    expect(combinedLegChoices(group)).toBeUndefined();
    expect(group.routes.map(r => r.legs.map(l => l.routeNumber).join('>'))).toEqual(['42A>E32', '44>A31']);
  });
  it('does not imply a known range when a fare is missing or only an upper bound', () => {
    const missing = journey('missing', ['37','NA21'], 0); missing.legs![1].fareStatus = 'UNAVAILABLE';
    expect(groupFareLabel(combine([missing, journey('known', ['2A','NA21'], 45.1)])[0], 'en')).toBe('Check individual fares');
    const bound = journey('bound', ['37','NA21'], 47); bound.legs![1].fareStatus = 'FULL_FARE';
    expect(groupFareLabel(combine([bound, journey('known', ['2A','NA21'], 45.1)])[0], 'en')).toBe('Up to $47.00');
  });
  it('shows a single fare when equal, and a duration range when times differ', () => {
    const slower = journey('slower', ['171','NA21'], 45.1); slower.legs![1].journeyTimeMinutes = 39;
    const [group] = combine([journey('one', ['2A','NA21'], 45.1), slower]);
    expect(groupFareLabel(group, 'en')).toBe('$45.10'); expect(groupDurationLabel(group)).toBe('71–76');
  });
});
