import { macauPatterns, macauOffsets, macauStop, lrtFare } from '../data/macau/network';
import { haversineKm } from './journeyHelpers';
import { scoreRoutes, type Route, type Segment } from './UpgradedScoringEngine';
import { DEFAULT_WEIGHTS, type RouteWeights } from './routeWeights';
import { DEFAULT_LIMITS, withinJourneyLimits, type JourneyLimits } from '../domain/journeyLimits';
import type { MacauJourney, MacauPayment, MacauPattern, MacauStop } from '../domain/macau';

type Point = { lat: number; lng: number };
type Label = { stop: MacauStop; elapsed: number; walk: number; access: number; endpointWalk: number; buffer: number; legs: Segment[]; used: string[]; cost: number };
export interface MacauSearchOptions {
  includeBusEstimates?: boolean; operators?: string[]; requiredOperators?: string[];
  payment?: MacauPayment; weights?: RouteWeights; changeMinutes?: number; limits?: JourneyLimits;
}
const walkTime = (a: Point, b: MacauStop) => Math.ceil(haversineKm(a.lat, a.lng, b[3], b[4]) * 1.25 / (5 / 60));
const sameLocation = (a: MacauStop, b: MacauStop) => haversineKm(a[3], a[4], b[3], b[4]);

/** Published operating window; a headway is not a list of exact departures.
 * Mon–Thu public-holiday extensions are intentionally not assumed without a
 * holiday calendar. This conservative boundary is disclosed in the preview.
 */
export function lrtServiceWindow(date: Date, offset = 0) {
  const local = new Date(date.getTime() + 8 * 3600_000), day = local.getUTCDay();
  const midnight = Date.parse(local.toISOString().slice(0, 10) + 'T00:00:00+08:00');
  return { first: midnight + (390 + offset) * 60_000,
    last: midnight + ((day === 0 || day >= 5 ? 1439 : 1395) + offset) * 60_000 };
}
function boardingWait(pattern: MacauPattern, index: number, ready: number, reverse: boolean, ride: number, firstLeg: boolean, minimum: number) {
  const averageWait = Math.max(minimum, pattern.mode === 'LIGHT_RAIL' ? (pattern.headwayRange?.at(-1) ?? 10.5) / 2 : 7.5);
  if (pattern.mode === 'BUS') return reverse && firstLeg ? 0 : averageWait;
  const offset = macauOffsets.get(pattern.id)![index];
  const desired = reverse ? ready - ride * 60_000 : ready;
  // A downstream last train may pass after midnight on the prior service day.
  const windows = [-1, 0, 1].map(day => lrtServiceWindow(new Date(desired + day * 86400_000), offset));
  if (reverse) {
    const latest = Math.max(...windows.map(window => Math.min(desired - (firstLeg ? 0 : averageWait * 60_000), window.last)).filter((value, i) => value >= windows[i].first));
    return Number.isFinite(latest) ? (desired - latest) / 60_000 : undefined;
  }
  const board = Math.min(...windows.map(window => Math.max(ready + averageWait * 60_000, window.first)).filter((value, i) => value <= windows[i].last));
  return Number.isFinite(board) ? (board - ready) / 60_000 : undefined;
}

function fareRoute(route: Route, payment: MacauPayment) {
  const legs = route.legs!;
  let selected: number | null = 0;
  for (let i = 0; i < legs.length; i++) {
    if (legs[i].mode === 'BUS') { legs[i].fare = 6; if (payment !== 'cash') selected = null; else if (selected !== null) selected += 6; continue; }
    let end = i;
    const path: string[] = [];
    while (end < legs.length && legs[end].mode === 'LIGHT_RAIL' && (end === i || legs[end - 1].destinationStop!.id === legs[end].originStop!.id)) {
      const leg = legs[end], p = macauPatterns.find(row => row.id === leg.networkPatternId)!;
      path.push(...p.stops.slice(leg.boardingIndex!, leg.alightingIndex! + 1).map(row => row[0]).slice(end === i ? 0 : 1));
      end++;
    }
    legs[i].fare = lrtFare(path, 'cash');
    if (selected !== null) selected += lrtFare(path, payment);
    for (let j = i + 1; j < end; j++) { legs[j].fare = 0; legs[j].fareBasis = 'Included in preceding Macau LRT fare'; }
    i = end - 1;
  }
  return selected;
}

/** Small city adapter: the existing scoring formula ranks the Macau graph.
 * Bus availability is never asserted: topology-only bus estimates are opt-in.
 */
export function findMacauJourneys(from: Point, to: Point, anchor: Date, locale: 'zh' | 'en', reverse = false, options: MacauSearchOptions = {}): MacauJourney[] {
  const weights = options.weights ?? DEFAULT_WEIGHTS, limits = options.limits ?? DEFAULT_LIMITS;
  const patterns = macauPatterns.filter(p => (p.mode !== 'BUS' || options.includeBusEstimates) && (!options.operators || options.operators.includes(p.operator)));
  const stops = Array.from(new Map(patterns.flatMap(p => p.stops.filter(s => !s[5]).map(s => [s[0], s] as const))).values());
  const serving = new Map<string, { pattern: MacauPattern; position: number }[]>();
  for (const pattern of patterns) pattern.stops.forEach((stop, position) => {
    if (!stop[5]) serving.set(stop[0], [...(serving.get(stop[0]) ?? []), { pattern, position }]);
  });
  const transfers = new Map<string, { stop: MacauStop; walk: number }[]>();
  const nearby = (from: MacauStop) => {
    if (!transfers.has(from[0])) transfers.set(from[0], stops.filter(to => sameLocation(from, to) <= .25).map(stop => ({ stop, walk: stop[0] === from[0] ? 0 : Math.max(1, walkTime({ lat: from[3], lng: from[4] }, stop)) })));
    return transfers.get(from[0])!;
  };
  const beginning = reverse ? to : from, ending = reverse ? from : to;
  let frontier: Label[] = stops.filter(s => walkTime(beginning, s) <= 12).map(stop => {
    const walk = walkTime(beginning, stop); return { stop, elapsed: walk, walk, access: walk, endpointWalk: walk, buffer: 0, legs: [], used: [], cost: walk * weights.walk };
  });
  const results: Route[] = [];
  // With no user-selected cap, explore the finite route-family graph fully.
  // A used-family guard below prevents cycling back onto the same service.
  const maxTransfers = limits.transfers ?? patterns.length;
  for (let round = 0; round <= maxTransfers && frontier.length; round++) {
    const arrivals = new Map<string, Label[]>();
    for (const label of frontier) for (const { pattern, position } of serving.get(label.stop[0]) ?? []) {
      const family = pattern.operator + ':' + pattern.number;
      if (label.used.includes(family)) continue;
      const offsets = macauOffsets.get(pattern.id)!;
      for (let target = reverse ? position - 1 : position + 1; reverse ? target >= 0 : target < pattern.stops.length; target += reverse ? -1 : 1) {
        const stop = pattern.stops[target]; if (stop[5]) continue;
        const board = reverse ? target : position, alight = reverse ? position : target, ride = offsets[alight] - offsets[board];
        const ready = anchor.getTime() + (reverse ? -1 : 1) * label.elapsed * 60_000;
        const wait = boardingWait(pattern, board, ready, reverse, ride, label.legs.length === 0, Math.max(0, label.buffer - label.access));
        if (wait === undefined || wait > (limits.wait ?? 90)) continue;
        const elapsed = label.elapsed + wait + ride;
        const departure = reverse ? ready - (ride + wait) * 60_000 : ready + wait * 60_000;
        const leg: Segment = { id: `${pattern.id}:${board}:${alight}`, operator: pattern.operator, networkOperator: pattern.operator,
          networkPatternId: pattern.id, mode: pattern.mode, routeNumber: pattern.number,
          routeName: pattern[locale === 'en' ? 'nameEn' : 'nameTc'], boardingIndex: board, alightingIndex: alight,
          originStop: macauStop(pattern.stops[board], locale), destinationStop: macauStop(pattern.stops[alight], locale),
          journeyTimeMinutes: ride, scheduledIntervalMinutes: pattern.mode === 'BUS' ? 15 : pattern.headwayRange?.at(-1) ?? 10.5,
          scheduledWaitMinutes: reverse ? 0 : wait, accessWalkMinutes: reverse ? 0 : label.access, fare: pattern.mode === 'BUS' ? 6 : 12,
          fareStatus: 'PUBLISHED', fareBasis: pattern.mode === 'BUS' ? 'MOP normal adult cash fare' : 'MOP adult single journey ticket',
          serviceStatus: 'UNVERIFIED', realtimeEta: null, departureTime: new Date(departure).toISOString(), arrivalTime: new Date(departure + ride * 60_000).toISOString() };
        const suffix = label.legs.map((l, i) => reverse && i === 0 ? { ...l, accessWalkMinutes: label.access, scheduledWaitMinutes: wait } : l);
        const legs = reverse ? [leg, ...suffix] : [...suffix, leg];
        const exit = walkTime(ending, stop), walk = label.walk + exit;
        if (exit <= 12 && (limits.walk === null || walk <= limits.walk)) {
          const total = elapsed + exit;
          const start = reverse ? anchor.getTime() - total * 60_000 : anchor.getTime();
          if (reverse) legs[0] = { ...legs[0], accessWalkMinutes: exit };
          results.push({ id: 'macau:' + legs.map(l => l.id).join('|'), legs: legs.map(l => ({ ...l })),
            transferCount: round, walkTransferTimeMinutes: walk, originWalkMinutes: reverse ? exit : label.endpointWalk,
            destinationWalkMinutes: reverse ? label.endpointWalk : exit, departureTime: new Date(start).toISOString(),
            arrivalTime: reverse ? new Date(Date.parse(legs.at(-1)!.arrivalTime!) + label.endpointWalk * 60_000).toISOString() : new Date(start + total * 60_000).toISOString(), timeMode: reverse ? 'arrive' : 'depart' });
        }
        if (round === maxTransfers) continue;
        const cost = label.cost + ride * weights.ride + wait * weights.wait + (round ? weights.transfer : 0) + (pattern.mode === 'BUS' ? weights.unverified : 0);
        const next: Label = { stop, elapsed, walk: label.walk, access: 0, endpointWalk: label.endpointWalk, buffer: 0, legs, used: [...label.used, family], cost };
        const key = stop[0] + ':' + family, entries = arrivals.get(key) ?? [];
        if (entries.length < 2 || cost < entries.at(-1)!.cost) arrivals.set(key, [...entries, next].sort((a, b) => a.cost - b.cost).slice(0, 2));
      }
    }
    frontier = [];
    const retained = Array.from(arrivals.values()).flat().sort((a, b) => a.cost - b.cost).slice(0, 320);
    for (const label of retained) for (const { stop, walk } of nearby(label.stop)) {
      const change = Math.max(walk, options.changeMinutes ?? 5);
      if (limits.change !== null && change > limits.change || limits.walk !== null && label.walk + walk > limits.walk) continue;
      frontier.push({ ...label, stop, elapsed: label.elapsed + walk, walk: label.walk + walk, access: walk, buffer: change, cost: label.cost + walk * weights.walk });
    }
    if (frontier.length > 1800) frontier = frontier.sort((a, b) => a.cost - b.cost).slice(0, 1800);
  }
  const selected = new Map<string, number | null>();
  const unique = Array.from(new Map(results.map(route => [route.id, route])).values()).filter(route => {
    selected.set(route.id, fareRoute(route, options.payment ?? 'cash'));
    return withinJourneyLimits(route, limits) && (!options.requiredOperators?.length || options.requiredOperators.every(id => route.legs!.some(leg => leg.operator === id)));
  });
  const local = new Date(anchor.getTime() + 8 * 3600_000), scoreDate = new Date(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), local.getUTCHours(), local.getUTCMinutes());
  const ranked = scoreRoutes(unique, scoreDate, weights);
  const families = new Set<string>();
  return ranked.filter(route => { const family = route.legs.map(l => l.operator + ':' + l.routeNumber).join('|'); if (families.has(family)) return false; families.add(family); return true; })
    .slice(0, 24).map(route => ({ ...route, currency: 'MOP', selectedFare: selected.get(route.id) ?? null, unverifiedBus: route.legs.some(l => l.mode === 'BUS') }));
}
