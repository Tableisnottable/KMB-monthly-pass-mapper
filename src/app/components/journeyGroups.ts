import type { ScoredRoute, Segment, TransitLeg } from '../../engine/UpgradedScoringEngine';
import { copy, fareLabel, hasEndedService, journeyMinutes, legOperator, type PlannerLocale } from './plannerUi';
import { getMonthlyPassInsight } from '../../domain/monthlyPass';

export interface JourneyGroup { id: string; routes: ScoredRoute[] }
export type JourneySort = 'recommended' | 'fastest' | 'cheapest' | 'transfers' | 'walking';

const serviceKey = (leg: Segment) => JSON.stringify([legOperator(leg), leg.mode, leg.routeNumber, leg.routeName,
  leg.mode === 'MINIBUS' ? leg.networkPattern : undefined]);

function sortValue(route: ScoredRoute, sort: JourneySort): number {
  switch (sort) {
    case 'fastest': return journeyMinutes(route);
    case 'cheapest': return route.legs.some(leg => leg.fareStatus === 'UNAVAILABLE') ? Infinity : route.discountedFare;
    case 'transfers': return route.transferCount;
    case 'walking': return route.walkTransferTimeMinutes;
    default: return route.finalScore;
  }
}

/** Combine direct stop pairs or feeders joining the same onward services. */
export function groupJourneysByStops(routes: ScoredRoute[], sort: JourneySort = 'recommended'): JourneyGroup[] {
  const groups = new Map<string, JourneyGroup>();
  [...routes].sort((a, b) => sortValue(a, sort) - sortValue(b, sort) || a.finalScore - b.finalScore).forEach((route, index) => {
    const first = route.legs[0], last = route.legs.at(-1);
    const originId = first?.originStop?.id, destinationId = last?.destinationStop?.id;
    const canCombine = originId && destinationId
      && route.legs.every(leg => leg.mode && leg.mode !== 'WALK');
    const connection = route.legs.length > 1 ? ['connections', route.legs.slice(1).map(serviceKey)] : ['direct', originId];
    const id = canCombine ? JSON.stringify([connection, destinationId,
      route.legs.map(leg => leg.mode), hasEndedService(route)]) : `single:${index}:${route.id}`;
    const group = groups.get(id);
    if (group) group.routes.push(route);
    else groups.set(id, { id, routes: [route] });
  });
  return Array.from(groups.values());
}

export function groupFareLabel(group: JourneyGroup, locale: PlannerLocale): string {
  if (group.routes.length === 1) return fareLabel(group.routes[0], locale);
  if (group.routes.some(r => r.legs.some(l => l.fareStatus === 'UNAVAILABLE'))) {
    return copy(locale, '請查看各路線票價', 'Check individual fares');
  }
  const values = group.routes.map(r => r.discountedFare), min = Math.min(...values), max = Math.max(...values);
  if (group.routes.some(r => r.legs.some(l => l.fareStatus === 'FULL_FARE'))) {
    return copy(locale, '最多 ', 'Up to ') + '$' + max.toFixed(2);
  }
  return min === max ? fareLabel(group.routes[0], locale) : `$${min.toFixed(2)}–$${max.toFixed(2)}`;
}

export function groupDurationLabel(group: JourneyGroup): string {
  const minutes = group.routes.map(journeyMinutes), min = Math.min(...minutes), max = Math.max(...minutes);
  return min === max ? String(min) : `${min}–${max}`;
}

export function groupPassFareLabel(group: JourneyGroup, locale: PlannerLocale): string {
  const fares = group.routes.map(route => getMonthlyPassInsight(route));
  if (fares.some(fare => !fare.available)) return copy(locale, '票價待查', 'Fare unavailable');
  const min = Math.min(...fares.map(fare => fare.passFareMin)), max = Math.max(...fares.map(fare => fare.passFareMax));
  if (max > 0 && group.routes.some(route => route.legs.some(leg => leg.fareStatus === 'FULL_FARE'))) {
    return copy(locale, '最多 ', 'Up to ') + '$' + max.toFixed(2);
  }
  return min === max ? '$' + min.toFixed(2) : '$' + min.toFixed(2) + '–$' + max.toFixed(2);
}

/** Compact A/B → C/D only when every displayed combination really exists. */
export function combinedLegChoices(group: JourneyGroup): TransitLeg[][] | undefined {
  const options = group.routes[0].legs.map((_, index) => Array.from(new Map(group.routes.map(r => {
    const leg = r.legs[index]; return [serviceKey(leg), leg] as const;
  })).values()));
  const combinations = new Set(group.routes.map(r => JSON.stringify(r.legs.map(serviceKey))));
  return options.reduce((count, legs) => count * legs.length, 1) === combinations.size ? options : undefined;
}
