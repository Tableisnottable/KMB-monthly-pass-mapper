import { describe, expect, it } from 'vitest';
import { scoreRoutes, type Route } from '../../engine/UpgradedScoringEngine';
import { combinedLegChoices, groupDurationLabel, groupFareLabel, groupPassFareLabel, groupJourneysByStops } from './journeyGroups';

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
    const routes = scoreRoutes([journey('one', ['2A','NA21'], 45.1, 'start', 'end', 'change-A'), journey('two', ['171','NA21'], 47, 'start', 'end', 'change-A')]);
    const [group] = groupJourneysByStops(routes);
    expect(group.routes).toEqual(routes);
    expect(group.routes[1].legs[1].originStop.id).toBe('change-A');
  });
  it('keeps nearby feeders with different boarding or transfer stops separate', () => {
    const groups = combine([journey('one', ['2A','NA21'], 45.1, 'stop-A', 'airport', 'mei-foo'), journey('two', ['37','NA21'], 46, 'stop-B', 'airport', 'kwai-chung')]);
    expect(groups).toHaveLength(2);
    expect(groups.flatMap(group => group.routes).some(route => route.legs[0].originStop.id === 'stop-B')).toBe(true);
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
    expect(groups).toHaveLength(1);
    const group = { id: 'incomplete', routes: groups.flatMap(g => g.routes) };
    expect(combinedLegChoices(group)).toBeUndefined();
    expect(group.routes.map(r => r.legs.map(l => l.routeNumber).join('>'))).toEqual(['42A>E32', '44>A31']);
  });
  it.each(['first boarding', 'transfer alighting', 'transfer boarding', 'final alighting'])('does not combine a different %s stop even when names match', changed => {
    const first = journey('first', ['970X', '968'], 25.9), second = journey('second', ['117', '968'], 18.9);
    const [index, side] = changed === 'first boarding' ? [0, 'originStop'] as const
      : changed === 'transfer alighting' ? [0, 'destinationStop'] as const
        : changed === 'transfer boarding' ? [1, 'originStop'] as const : [1, 'destinationStop'] as const;
    second.legs![index][side] = { ...second.legs![index][side]!, id: 'different-stop' };
    const routes = scoreRoutes([first, second]);
    expect(groupJourneysByStops(routes)).toHaveLength(2);
    expect(combinedLegChoices({ id: 'unsafe', routes })).toBeUndefined();
  });
  it('requires complete stop identities and does not combine walking legs', () => {
    const first = journey('first', ['44', 'A31'], 20), second = journey('second', ['42A', 'A31'], 21);
    first.legs![1].originStop!.id = ''; second.legs![1].originStop!.id = '';
    expect(combine([first, second])).toHaveLength(2);
    first.legs![0].mode = 'WALK'; second.legs![0].mode = 'WALK';
    expect(combine([first, second])).toHaveLength(2);
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

describe('Journey sorting', () => {
  const candidates = () => {
    const fast = journey('fast', ['A'], 90, 'fast-stop');
    fast.walkTransferTimeMinutes = 9; fast.legs![0].journeyTimeMinutes = 10;
    const walk = journey('short-walk', ['B'], 10, 'nearby-stop');
    walk.walkTransferTimeMinutes = 2; walk.legs![0].journeyTimeMinutes = 40;
    const cheap = journey('cheap-transfer', ['C', 'D'], 4, 'transfer-stop');
    cheap.walkTransferTimeMinutes = 12; cheap.legs!.forEach(leg => { leg.journeyTimeMinutes = 5; });
    return scoreRoutes([fast, walk, cheap]);
  };

  it.each([
    ['recommended', 'cheap-transfer'], ['fastest', 'fast'], ['cheapest', 'cheap-transfer'],
    ['transfers', 'short-walk'], ['walking', 'short-walk'],
  ] as const)('sorts by %s without modifying the underlying scores or input order', (sort, firstId) => {
    const routes = candidates(), before = JSON.stringify(routes);
    expect(groupJourneysByStops(routes, sort)[0].routes[0].id).toBe(firstId);
    expect(JSON.stringify(routes)).toBe(before);
  });

  it('sorts both combined cards and their individual choices by the chosen metric', () => {
    const slowCheap = journey('slow-cheap', ['2A', 'NA21'], 45);
    slowCheap.legs![0].journeyTimeMinutes = 40;
    const fastExpensive = journey('fast-expensive', ['171', 'NA21'], 47);
    const routes = scoreRoutes([slowCheap, fastExpensive, journey('direct', ['N21'], 46)]);
    const cheap = groupJourneysByStops(routes, 'cheapest');
    expect(cheap[0].routes.map(route => route.id)).toEqual(['slow-cheap', 'fast-expensive']);
    expect(groupJourneysByStops(routes, 'fastest')[0].routes[0].id).toBe('direct');
    expect(groupJourneysByStops(routes, 'fastest')[1].routes[0].id).toBe('fast-expensive');
    expect(groupFareLabel(cheap[0], 'en')).toBe('$45.00–$47.00');
  });

  it('does not rank an unavailable zero fare as the cheapest journey', () => {
    const unknown = journey('unknown', ['A'], 0, 'unknown-stop');
    unknown.legs![0].fareStatus = 'UNAVAILABLE';
    const routes = scoreRoutes([unknown, journey('known', ['B'], 30, 'known-stop')]);
    expect(groupJourneysByStops(routes, 'cheapest').map(group => group.routes[0].id)).toEqual(['known', 'unknown']);
  });
});

describe('Combined monthly-pass fares', () => {
  it('calculates separate min–max ranges from actual member journeys', () => {
    const first = journey('covered', ['44', 'A31'], 20.6);
    first.legs![0].operator = 'KMB'; first.legs![0].fare = 8.9;
    first.legs![1].operator = 'LWB';
    const second = journey('payable', ['A23'], 34.6); second.legs![0].operator = 'CTB';
    const group = { id: 'comparison', routes: scoreRoutes([first, second]) };
    expect(groupFareLabel(group, 'en')).toBe('$29.50–$34.60');
    expect(groupPassFareLabel(group, 'en')).toBe('$5.60–$34.60');
  });
  it('shows a single zero payable fare when all member rides are included', () => {
    const first = journey('one', ['44'], 8.9); first.legs![0].operator = 'KMB';
    const second = journey('two', ['E32'], 13.9); second.legs![0].operator = 'LWB';
    expect(groupPassFareLabel({ id: 'included', routes: scoreRoutes([first, second]) }, 'en')).toBe('$0.00');
  });
  it('retains fare-unavailable and full-fare upper-bound qualifications', () => {
    const unknown = journey('unknown', ['A23'], 0); unknown.legs![0].fareStatus = 'UNAVAILABLE';
    expect(groupPassFareLabel({ id: 'unknown', routes: scoreRoutes([unknown]) }, 'en')).toBe('Fare unavailable');
    const bound = journey('bound', ['A31'], 20.6); bound.legs![0].operator = 'LWB'; bound.legs![0].fareStatus = 'FULL_FARE';
    expect(groupPassFareLabel({ id: 'bound', routes: scoreRoutes([bound]) }, 'en')).toBe('Up to $5.60');
  });
});
