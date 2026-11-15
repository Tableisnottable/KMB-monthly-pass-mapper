import { haversineKm } from './journeyHelpers';
import { scoreRoutes, UpgradedScoringEngine, WALK_MULTIPLIER, FARE_MINUTES_PER_DOLLAR,
  type Route, type Segment, type ScoredRoute } from './UpgradedScoringEngine';
import { hongKongClock, isServiceActive, networkPatterns, networkRoutes, networkStops,
  networkStop, networkStopIndex, normalAdultFare, railFare, weightingDate, type NetworkPattern } from '../data/transportNetwork';

type Point = { lat: number; lng: number };
import { DEFAULT_WEIGHTS, type RouteWeights } from './routeWeights';
import { operatorAllowed } from '../domain/operatorSelection';
import { transitTypeAllowed } from '../domain/transportSelection';
import { DEFAULT_PREFERENCES, preferencePenalty, preferredRoads, routeCorridors, corridorLegAllowed, routeRoadsAllowed, type RoutePreferences } from '../domain/routePreferences';
import { DEFAULT_LIMITS, limitAllows, withinJourneyLimits, type JourneyLimits } from '../domain/journeyLimits';
import { NORMAL_ACCESS_RADIUS_KM, FALLBACK_ACCESS_RADIUS_KM } from '../domain/journeyAccess';
export interface JourneySearchOptions { operators?: string[]; modes?: string[]; requiredOperators?: string[]; requiredModes?: string[]; weights?: RouteWeights; minimumChangeMinutes?: number; preferences?: RoutePreferences; limits?: JourneyLimits }

const serviceFamily = (leg: Segment) => leg.networkPattern === undefined || leg.mode !== 'MINIBUS'
  ? leg.operator + ':' + leg.routeNumber : networkRoutes[networkPatterns[leg.networkPattern].r][0];
type Label = { stop: number; elapsed: number; cost: number; legs: Segment[]; walk: number; pendingWalk: number; originWalk: number; used: number[]; visited: number[]; family: string; readyDelay: number };
type Window = { start: number; end: number; headway: number; duration: number };
const WALK_SPEED = 5 / 60, TIMETABLE_DAY_RANGE = 7;
const FALLBACK_STOP_LIMIT = 16;
const grid = new Map<string, number[]>();
networkStops.forEach((s, i) => { const key = `${Math.floor(s[3] * 250)}:${Math.floor(s[4] * 250)}`; grid.set(key, [...(grid.get(key) ?? []), i]); });

export function nearbyNetworkStops(point: Point, radiusKm = 0.9): { index: number; walk: number }[] {
  const latCell = Math.floor(point.lat * 250), lngCell = Math.floor(point.lng * 250);
  const range = Math.ceil(radiusKm / 0.4) + 1, found = [];
  for (let x = -range; x <= range; x++) for (let y = -range; y <= range; y++) {
    for (const index of grid.get(`${latCell + x}:${lngCell + y}`) ?? []) {
      const s = networkStops[index], km = haversineKm(point.lat, point.lng, s[3], s[4]);
      if (km <= radiusKm) found.push({ index, walk: Math.max(1, Math.ceil(km * 1.2 / WALK_SPEED)) });
    }
  }
  return found.sort((a, b) => a.walk - b.walk);
}
export function journeyAccessStops(point: Point) {
  const nearby = nearbyNetworkStops(point, NORMAL_ACCESS_RADIUS_KM);
  if (nearby.length) return nearby;
  return nearbyNetworkStops(point, FALLBACK_ACCESS_RADIUS_KM).slice(0, FALLBACK_STOP_LIMIT);
}
const transferCache = new Map<number, { index: number; walk: number }[]>();
const boardingPatterns = [new Map<number, number[]>(), new Map<number, number[]>()];
networkPatterns.forEach((pattern, patternIndex) => {
  [pattern.p, pattern.a].forEach((boardable, direction) => {
    for (let position = 0; position < pattern.s.length; position++) {
      if (boardable[position] !== 0) continue;
      const stop = pattern.s[position], indices = boardingPatterns[direction].get(stop) ?? [];
      indices.push(patternIndex);
      boardingPatterns[direction].set(stop, indices);
    }
  });
});
function transfers(index: number) {
  if (!transferCache.has(index)) {
    const s = networkStops[index];
    transferCache.set(index, nearbyNetworkStops({ lat: s[3], lng: s[4] }, s[6] === 'SUBWAY' ? 0.45 : 0.3)
      .filter(r => r.index !== index).map(r => ({ ...r, walk: Math.max(3, r.walk) })));
  }
  return transferCache.get(index)!;
}

function stopsThatCanReach(endings: Map<number, number>, reverse: boolean, options: JourneySearchOptions) {
  const offsets = new Array<number>(networkPatterns.length), alightingPositions = new Map<number, { pattern: number; position: number }[]>();
  let nodeCount = networkStops.length;
  networkPatterns.forEach((pattern, patternIndex) => {
    offsets[patternIndex] = nodeCount;
    nodeCount += pattern.s.length;
    const route = networkRoutes[pattern.r];
    if (!operatorAllowed(route[1], options.operators) || !transitTypeAllowed(route[5], options.modes)) return;
    const alightable = reverse ? pattern.p : pattern.a;
    for (let position = 0; position < pattern.s.length; position++) if (alightable[position] === 0) {
      const stop = pattern.s[position], entries = alightingPositions.get(stop) ?? [];
      entries.push({ pattern: patternIndex, position });
      alightingPositions.set(stop, entries);
    }
  });

  const visited = new Set<number>(), queue = Array.from(endings.keys());
  queue.forEach(stop => visited.add(stop));
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const node = queue[cursor];
    if (node < networkStops.length) {
      for (const previous of transfers(node)) if (!visited.has(previous.index)) {
        visited.add(previous.index);
        queue.push(previous.index);
      }
      for (const { pattern, position } of alightingPositions.get(node) ?? []) {
        const routeNode = offsets[pattern] + position;
        if (!visited.has(routeNode)) { visited.add(routeNode); queue.push(routeNode); }
      }
      continue;
    }

    let low = 0, high = offsets.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (offsets[middle] <= node) low = middle;
      else high = middle;
    }
    const patternIndex = low;
    const pattern = networkPatterns[patternIndex], position = node - offsets[patternIndex];
    const boardable = reverse ? pattern.a : pattern.p;
    if (boardable[position] === 0) {
      const stop = pattern.s[position];
      if (!visited.has(stop)) { visited.add(stop); queue.push(stop); }
    }
    const previousPosition = position + (reverse ? 1 : -1);
    if (previousPosition >= 0 && previousPosition < pattern.s.length
      && (!options.preferences || corridorLegAllowed(pattern.id, Math.min(position, previousPosition), Math.max(position, previousPosition), options.preferences))) {
      const previousNode = offsets[patternIndex] + previousPosition;
      if (!visited.has(previousNode)) { visited.add(previousNode); queue.push(previousNode); }
    }
  }
  return new Set(Array.from(visited).filter(node => node < networkStops.length));
}

/** Include adjacent service days and GTFS times above 24:00 in both directions. */
function serviceContext(date: Date) {
  return { minute: hongKongClock(date).minute, days: Array.from({ length: TIMETABLE_DAY_RANGE * 2 + 1 }, (_, index) => index - TIMETABLE_DAY_RANGE).map(shift => {
    const day = new Date(date.getTime() + shift * 86400_000), active = new Map<number, boolean>();
    return { shift, active: (service: number) => {
      if (!active.has(service)) active.set(service, isServiceActive(service, day));
      return active.get(service)!;
    } };
  }) };
}
export function activeWindows(pattern: NetworkPattern, date: Date, context = serviceContext(date)): Window[] {
  const now = context.minute, windows: Window[] = [];
  for (const { shift, active } of context.days) for (const [service, start, end, headway, duration] of pattern.w) {
    if (active(service)) {
      const s = start + shift * 1440 - now, e = end + shift * 1440 - now;
      windows.push({ start: s, end: e, headway, duration });
    }
  }
  return windows;
}
export function nextDeparture(windows: Window[], offset: number, earliest: number, durationFraction = 0) {
  let best: { wait: number; duration: number; headway: number; publishedHeadway?: number } | undefined;
  for (const w of windows) {
    const stopOffset = offset + w.duration * durationFraction;
    let departure = w.start + stopOffset;
    if (w.headway > 0 && departure < earliest) departure += Math.ceil((earliest - departure) / w.headway) * w.headway;
    if (departure + 0.001 < earliest || (w.headway > 0 && departure >= w.end + stopOffset)) continue;
    const wait = Math.max(0, departure - earliest);
    if (best && wait >= best.wait) continue;
    best = { wait, duration: w.duration, headway: Math.max(w.headway, wait * 2), publishedHeadway: w.headway || undefined };
  }
  return best;
}
/** Latest trip at a downstream stop; frequency end is exclusive. */
export function previousDeparture(windows: Window[], offset: number, latest: number, durationFraction = 0) {
  let best: { wait: number; duration: number; headway: number; publishedHeadway?: number } | undefined;
  for (const w of windows) {
    const stopOffset = offset + w.duration * durationFraction;
    let departure = w.start + stopOffset;
    if (w.headway > 0) {
      const n = Math.min(Math.floor((latest - departure + 1e-7) / w.headway), Math.ceil((w.end - w.start) / w.headway) - 1);
      if (n < 0) continue;
      departure += n * w.headway;
    }
    if (departure > latest + 0.001) continue;
    const wait = Math.max(0, latest - departure);
    if (best && wait >= best.wait) continue;
    best = { wait, duration: w.duration, headway: w.headway, publishedHeadway: w.headway || undefined };
  }
  return best;
}
/** Topology-only rail feeds: conservative estimated 06:00–00:00 terminal windows. */
function patternWindows(pattern: NetworkPattern, date: Date, context = serviceContext(date)): Window[] {
  if (pattern.w.length) return activeWindows(pattern, date, context);
  const mode = networkRoutes[pattern.r][5];
  if (mode !== 'SUBWAY' && mode !== 'LIGHT_RAIL') return [];
  const minute = context.minute;
  return [-1, 0, 1].map(day => ({ start: day * 1440 + 360 - minute, end: day * 1440 + 1440 - minute,
    headway: mode === 'LIGHT_RAIL' ? 8 : 6, duration: pattern.t[pattern.t.length - 1] }));
}
function departureAt(pattern: NetworkPattern, windows: Window[], position: number, time: number, reverse: boolean) {
  const total = pattern.t[pattern.t.length - 1];
  const offset = total ? 0 : pattern.t[position], fraction = total ? pattern.t[position] / total : 0;
  return reverse ? previousDeparture(windows, offset, time, fraction) : nextDeparture(windows, offset, time, fraction);
}
function addLabel(map: Map<number, Label[]>, value: Label, limit = 4) {
  const labels = map.get(value.stop) ?? [];
  const dominates = (a: Label, b: Label) => a.cost <= b.cost && a.elapsed <= b.elapsed
    && a.used.every(route => b.used.includes(route)) && a.visited.every(stop => b.visited.includes(stop));
  if (labels.some(label => dominates(label, value))) return;
  const remaining = labels.filter(label => !dominates(value, label));
  remaining.push(value); remaining.sort((a, b) => a.cost - b.cost || a.elapsed - b.elapsed);
  // Keep different incoming routes, since a cheap feeder can make a valuable
  // onward connection even when it is dominated at an intermediate stop.
  const diverse: Label[] = [], families = new Set<string>();
  for (const l of remaining) {
    const family = l.family;
    if (!families.has(family)) { diverse.push(l); families.add(family); }
    if (diverse.length === limit) break;
  }
  const fastest = remaining.reduce((a, b) => a.elapsed < b.elapsed ? a : b);
  if (!diverse.includes(fastest)) diverse.push(fastest);
  map.set(value.stop, diverse);
}

type JourneySearchResult = { routes: ScoredRoute[]; originStops: { index: number; walk: number }[]; destinationStops: { index: number; walk: number }[]; candidates: number };
export function findMultimodalJourneys(from: Point, to: Point, date = new Date(), locale: 'zh' | 'en' = 'zh', reverse = false, simpleOnly = false, options: JourneySearchOptions = {}): JourneySearchResult {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const minimumChange = options.minimumChangeMinutes ?? 3;
  const limits = options.limits ?? DEFAULT_LIMITS;
  const scoreDate = weightingDate(date), originStops = journeyAccessStops(from), destinationStops = journeyAccessStops(to);
  if (!originStops.length || !destinationStops.length) return { routes: [], originStops, destinationStops, candidates: 0 };
  const endings = new Map((reverse ? originStops : destinationStops).map(s => [s.index, s.walk]));
  const reachable = stopsThatCanReach(endings, reverse, options);
  const rounds = Math.min(simpleOnly ? 2 : networkRoutes.length, (limits.transfers ?? networkRoutes.length - 1) + 1);
  const finishing = new Set(networkPatterns.map((p, i) => p.s.some((s, j) => endings.has(s) && (reverse ? p.p : p.a)[j] === 0) ? i : -1));
  let frontier = new Map<number, Label[]>();
  for (const { index, walk } of reverse ? destinationStops : originStops) if (reachable.has(index) && limitAllows(limits.walk, walk)) addLabel(frontier, {
    stop: index, elapsed: walk, cost: walk * weights.walk, legs: [], walk, pendingWalk: walk, originWalk: walk, used: [], visited: [index], family: '', readyDelay: 0,
  });
  if (!frontier.size) return { routes: [], originStops, destinationStops, candidates: 0 };
  const context = serviceContext(date);
  const windows: (Window[] | undefined)[] = [], results: Route[] = [];
  const fareCache = new Map<string, ReturnType<typeof normalAdultFare>>();
  const stopCache = new Map<number, ReturnType<typeof networkStop>>();
  const stop = (index: number) => {
    if (!stopCache.has(index)) stopCache.set(index, networkStop(index, locale));
    return stopCache.get(index)!;
  };
  const waitMultiplier = UpgradedScoringEngine.getTimeMultiplier(scoreDate, weights);
  const directOptions: { family: string; duration: number; fare: number }[] = [];
  // The results selector discards longer, dearer changes from an already useful
  // direct service. Stop expanding those prefixes once even a free, instant
  // onward ride could no longer survive that same rule. Rail fares can later
  // combine, so only non-rail fares provide a safe lower bound here.
  const discardedByDirect = (label: Label, elapsed: number) => !reverse && directOptions.some(direct =>
    label.legs.length && serviceFamily(label.legs[0]) === direct.family && elapsed >= direct.duration + 5
    && label.legs.reduce((fare, leg) => fare + (leg.mode === 'SUBWAY' || leg.mode === 'LIGHT_RAIL' ? 0 : leg.fare ?? 0), 0) >= direct.fare);
  let bestCompleteCost = Infinity;
  for (let round = 0; round < rounds && frontier.size; round++) {
    const arrivals = new Map<number, Label[]>();
    const candidatePatterns = new Set<number>();
    const directionBoardings = boardingPatterns[reverse ? 1 : 0];
    frontier.forEach((_, stop) => (directionBoardings.get(stop) ?? []).forEach(index => candidatePatterns.add(index)));
    candidatePatterns.forEach(patternIndex => {
      const pattern = networkPatterns[patternIndex];
      const serviceWindows = windows[patternIndex] ?? (windows[patternIndex] = patternWindows(pattern, date, context));
      if (!serviceWindows.length) return;
      if (simpleOnly && round === 1 && !finishing.has(patternIndex)) return;
      const route = networkRoutes[pattern.r], rail = route[5] === 'SUBWAY' || route[5] === 'LIGHT_RAIL';
      if (!operatorAllowed(route[1], options.operators) || !transitTypeAllowed(route[5], options.modes)) return;
      const operator = route[1] === 'KMB+CTB' ? 'KMB' : route[1] === 'LWB+CTB' ? 'LWB' : route[1];
      const boardings: { label: Label; position: number; wait: number; duration: number; interval: number; publishedHeadway?: number }[] = [];
      for (let step = 0; step < pattern.s.length; step++) {
        const position = reverse ? pattern.s.length - 1 - step : step, index = pattern.s[position];
        if ((reverse ? pattern.p : pattern.a)[position] === 0) for (const boarding of boardings) {
          const { label, wait, duration, interval } = boarding;
          if (label.visited.includes(index)) continue;
          const start = reverse ? position : boarding.position, end = reverse ? boarding.position : position;
          if (options.preferences && !corridorLegAllowed(pattern.id, start, end, options.preferences)) continue;
          const scale = pattern.t[pattern.t.length - 1] > 0 ? duration / pattern.t[pattern.t.length - 1] : 1;
          const ride = Math.max(1, Math.round((pattern.t[end] - pattern.t[start]) * scale)), elapsed = label.elapsed + wait + ride;
          if (discardedByDirect(label, elapsed)) continue;
          if (limits.ride !== null && !limitAllows(limits.ride, label.legs.reduce((sum, leg) => sum + (leg.journeyTimeMinutes ?? 0), ride))) continue;
          const waitCost = (reverse ? (label.legs.length ? wait : 0) : wait) * waitMultiplier;
          if (label.cost + ride * weights.ride + waitCost + (round ? weights.transfer : 0) > bestCompleteCost * 1.9 + 35) continue;
          const fareKey = `${pattern.r}:${pattern.s[start]}:${pattern.s[end]}`;
          if (!fareCache.has(fareKey)) fareCache.set(fareKey, normalAdultFare(pattern.r, pattern.s[start], pattern.s[end]));
          const adult = fareCache.get(fareKey)!;
          const leg: Segment = {
            id: `${pattern.id}:${start}:${end}`, operator, networkOperator: route[1], networkRouteId: route[0], networkPatternId: pattern.id, mode: route[5], routeNumber: route[2], routeName: route[locale === 'en' ? 4 : 3],
            originStop: stop(pattern.s[start]), destinationStop: stop(pattern.s[end]),
            journeyTimeMinutes: ride, scheduledIntervalMinutes: interval, realtimeEta: null, ...adult,
            serviceStatus: rail ? 'UNVERIFIED' : 'TIMETABLE', scheduledDepartureMinutes: reverse ? -elapsed : label.elapsed + wait,
            scheduledWaitMinutes: reverse ? 0 : wait, accessWalkMinutes: reverse ? 0 : label.pendingWalk,
            publishedHeadwayMinutes: boarding.publishedHeadway, networkPattern: patternIndex, boardingIndex: start, alightingIndex: end,
          };
          const rest = reverse ? label.legs.map((l, i) => i === 0 ? { ...l, scheduledWaitMinutes: wait, accessWalkMinutes: label.pendingWalk } : l) : label.legs;
          const legs = reverse ? [leg, ...rest] : [...rest, leg];
          const cost = label.cost + ride * weights.ride + waitCost + UpgradedScoringEngine.getOperatorAdjustment(operator, weights)
            + adult.fare * weights.fare + (rail ? weights.unverified : 0) + (round ? weights.transfer : 0);
          if (cost > bestCompleteCost * 1.9 + 30) continue;
          if (reachable.has(index)) addLabel(arrivals, { stop: index, cost, elapsed, legs, walk: label.walk, pendingWalk: 0,
            originWalk: label.originWalk, used: reverse ? [pattern.r, ...label.used] : [...label.used, pattern.r],
            visited: [...label.visited, index],
            family: reverse ? pattern.r + ',' + label.family : label.family + ',' + pattern.r, readyDelay: 0 }, simpleOnly && round === 0 ? 48 : 4);
          const endWalk = endings.get(index);
          if (endWalk !== undefined && limitAllows(limits.walk, label.walk + endWalk)) {
            const complete = legs.map(l => ({ ...l }));
            if (reverse) complete[0].accessWalkMinutes = endWalk;
            const result: Route = { id: 'multi:' + complete.map(l => l.id).join('|'), legs: complete,
              walkTransferTimeMinutes: label.walk + endWalk, originWalkMinutes: reverse ? endWalk : label.originWalk,
              destinationWalkMinutes: reverse ? label.originWalk : endWalk, transferCount: round, timeMode: reverse ? 'arrive' : 'depart' };
            // A route that will be removed by a Must/Ban road filter must not
            // tighten the search bound and prune compliant alternatives.
            if (!options.preferences || routeRoadsAllowed(result, options.preferences)) {
              bestCompleteCost = Math.min(bestCompleteCost, cost + endWalk * weights.walk);
              if (round === 0 && !rail && withinJourneyLimits(result, limits)
                && (!options.requiredOperators?.length || options.requiredOperators.every(id => route[1].split('+').includes(id)))
                && (!options.requiredModes?.length || options.requiredModes.every(id => route[5] === id))) {
                directOptions.push({ family: serviceFamily(leg), duration: elapsed + endWalk, fare: adult.fare });
              }
            }
            results.push(result);
          }
        }
        if ((reverse ? pattern.a : pattern.p)[position] !== 0 || step === pattern.s.length - 1) continue;
        for (const label of frontier.get(index) ?? []) {
          if (label.used.includes(pattern.r)) continue;
          const departure = departureAt(pattern, serviceWindows, position, reverse ? -label.elapsed - label.readyDelay : label.elapsed + label.readyDelay, reverse);
          if (departure) {
            const wait = departure.wait + label.readyDelay;
            if ((!reverse || label.legs.length) && !limitAllows(limits.wait, wait)) continue;
            if (label.legs.length && !limitAllows(limits.change, label.pendingWalk + wait)) continue;
            boardings.push({ label, position, wait, duration: departure.duration, interval: departure.headway, publishedHeadway: departure.publishedHeadway });
          }
        }
        if (boardings.length > (simpleOnly ? 100 : 12)) {
          boardings.sort((a, b) => (a.label.cost + a.wait + (reverse ? 1 : -1) * pattern.t[a.position]) - (b.label.cost + b.wait + (reverse ? 1 : -1) * pattern.t[b.position]));
          const seen = new Set<string>(), keep = boardings.filter(b => { const k = b.label.family; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, simpleOnly ? 48 : 5);
          for (const b of boardings) if (keep.length < (simpleOnly ? 64 : 8) && !keep.includes(b)) keep.push(b);
          boardings.splice(0, boardings.length, ...keep);
        }
      }
    });
    if (!simpleOnly && results.length >= 40
      && selectJourneyAlternatives(scoreRoutes(results, scoreDate, weights), 40, options.preferences).length >= 40) break;
    if (round === rounds - 1) break;
    frontier = new Map();
    for (const [stop, labels] of Array.from(arrivals)) for (const label of labels) {
      if (discardedByDirect(label, label.elapsed)) continue;
      if (limitAllows(limits.walk, label.walk + 3)) addLabel(frontier, { ...label, elapsed: label.elapsed + 3, cost: label.cost + 3 * weights.walk, walk: label.walk + 3, pendingWalk: 3, readyDelay: Math.max(0, minimumChange - 3) }, simpleOnly ? 48 : 4);
      for (const t of transfers(stop)) if (reachable.has(t.index) && !label.visited.includes(t.index) && limitAllows(limits.walk, label.walk + t.walk)) addLabel(frontier, { ...label, stop: t.index, elapsed: label.elapsed + t.walk,
        cost: label.cost + t.walk * weights.walk, walk: label.walk + t.walk, pendingWalk: t.walk, readyDelay: Math.max(0, minimumChange - t.walk) }, simpleOnly ? 48 : 4);
    }
  }
  for (const result of results) combineRailFares(result);
  const simple = simpleOnly ? null : findMultimodalJourneys(from, to, date, locale, reverse, true, options);
  // A sparse direct service can score below a large number of interchange
  // permutations. Retain it so users can still compare the simpler journey.
  const selected = dedupeJourneys([...scoreRoutes(results, scoreDate, weights), ...(simple?.routes ?? [])])
    .filter((route, index) => index < 1000 || route.transferCount === 0);
  for (const result of selected) setJourneyTimes(result, date, reverse ? 'arrive' : 'depart');
  return { routes: selected.filter(route => withinJourneyLimits(route, limits)), originStops, destinationStops, candidates: results.length + (simple?.candidates ?? 0) };
}

function combineRailFares(result: Route) {
  const legs = result.legs ?? [];
  for (let i = 0; i < legs.length; i++) {
    if (!['SUBWAY', 'LIGHT_RAIL'].includes(legs[i].mode ?? '') || legs[i].routeNumber === 'AEL') continue;
    let end = i;
    while (end + 1 < legs.length && legs[end + 1].mode === legs[i].mode && legs[end + 1].routeNumber !== 'AEL') {
      if (legs[end].destinationStop!.id !== legs[end + 1].originStop!.id) break;
      end++;
    }
    if (end > i) {
      const from = networkStopIndex(legs[i].originStop!.id), to = networkStopIndex(legs[end].destinationStop!.id);
      const fare = from === undefined || to === undefined ? undefined : railFare(from, to);
      legs[i].fare = fare ?? 0; legs[i].fareStatus = fare === undefined ? 'UNAVAILABLE' : 'PUBLISHED';
      for (let j = i + 1; j <= end; j++) { legs[j].fare = 0; legs[j].fareStatus = legs[i].fareStatus; legs[j].fareBasis = 'Included in preceding adult rail fare'; }
    }
    i = end;
  }
}
export function dedupeJourneys(routes: ScoredRoute[]): ScoredRoute[] {
  const seen = new Set<string>();
  return [...routes].sort((a, b) => a.finalScore - b.finalScore).filter(route => {
    const key = route.legs.map(l => l.networkPattern === undefined || l.mode !== 'MINIBUS' ? `${l.operator}:${l.routeNumber}` : networkRoutes[networkPatterns[l.networkPattern].r][0]).join('|') + (route.viaStops ? JSON.stringify(route.viaStops) : '');
    if (seen.has(key)) return false; seen.add(key); return true;
  });
}
export function selectJourneyAlternatives(routes: ScoredRoute[], limit = 40, preferences: RoutePreferences = DEFAULT_PREFERENCES) {
  if (limit <= 0) return [];
  const rank = (route: ScoredRoute) => route.finalScore + preferencePenalty(route, preferences);
  const ranked = dedupeJourneys(routes).filter(route => routeRoadsAllowed(route, preferences)).sort((a, b) => rank(a) - rank(b));
  const durations = new Map(ranked.map(r => [r, r.legs.reduce((sum, l) => sum + (l.journeyTimeMinutes ?? 0) + (l.scheduledWaitMinutes ?? 0), r.walkTransferTimeMinutes)]));
  const duration = (r: ScoredRoute) => durations.get(r)!;
  const family = serviceFamily;
  const direct = ranked.filter(r => r.transferCount === 0);
  // Do not occupy the alternatives board with a gratuitous change from a bus
  // that already reaches the destination more quickly and for less money.
  const useful = ranked.filter(r => r.transferCount === 0 || !direct.some(d => family(d.legs[0]) === family(r.legs[0])
    && d.discountedFare <= r.discountedFare && duration(d) <= duration(r) + 5));
  const efficient = useful.filter(r => !useful.some(other => other !== r && other.transferCount <= r.transferCount && other.discountedFare <= r.discountedFare
    && other.walkTransferTimeMinutes <= r.walkTransferTimeMinutes && duration(other) <= duration(r)
    && (other.transferCount < r.transferCount || other.discountedFare < r.discountedFare || duration(other) < duration(r))));
  const chosen = new Set<ScoredRoute>(efficient.slice(0, Math.min(3, limit)));
  const add = (options: ScoredRoute[], count: number) => {
    let added = 0;
    for (const r of options) {
      if (added >= count || chosen.size >= limit) break;
      if (!chosen.has(r)) { chosen.add(r); added++; }
    }
  };
  const preferred = preferredRoads(preferences);
  if (preferred.length) add(ranked.filter(route => routeCorridors(route).some(id => preferred.includes(id))), Math.min(6, limit));
  add(direct, Math.min(8, Math.max(1, Math.floor(limit / 3))));
  // Choose a useful cheaper feeder for each onward service instead of filling
  // the board with many ways to catch the same final bus.
  const families = new Map<string, ScoredRoute[]>();
  const busPairs = useful.filter(r => r.transferCount === 1 && r.legs.every(l => l.mode === 'BUS' || l.mode === 'MINIBUS'));
  for (const r of busPairs) {
    const last = r.legs[r.legs.length - 1];
    const key = family(last);
    families.set(key, [...(families.get(key) ?? []), r]);
  }
  const feeders = Array.from(families.values()).map(options => {
    const viable = options.filter(r => r.finalScore <= options[0].finalScore + 10);
    const minimum = Math.min(...viable.map(r => r.discountedFare));
    return viable.find(r => r.discountedFare <= minimum + .1)!;
  }).sort((a, b) => a.finalScore - b.finalScore);
  // A chosen feeder may also connect to a cheaper onward service. Keep that
  // comparison next to the faster connection rather than losing it in ties.
  const feederComparisons = feeders.flatMap(feeder => [feeder, ...busPairs.filter(r => family(r.legs[0]) === family(feeder.legs[0])
    && !direct.some(d => family(d.legs[0]) === family(r.legs[1]))
    && r.discountedFare < feeder.discountedFare && r.finalScore <= feeder.finalScore + 15)
    .sort((a, b) => a.discountedFare - b.discountedFare).slice(0, 1)]);
  add(feederComparisons, Math.max(0, limit - chosen.size - 1));
  add(efficient, limit); add(useful, limit);
  return Array.from(chosen).sort((a, b) => rank(a) - rank(b));
}
export function setJourneyTimes(route: Route, anchor: Date, mode: 'now' | 'depart' | 'arrive') {
  const legs = route.legs ?? [];
  if (!legs.length) return;
  let elapsed = 0;
  for (const [i, leg] of legs.map((l, i) => [i, l] as const)) {
    elapsed += leg.accessWalkMinutes ?? (i === 0 ? route.originWalkMinutes ?? 0 : 3);
    const departure = mode === 'arrive' ? leg.scheduledDepartureMinutes ?? elapsed
      : i === 0 && leg.realtimeEta?.isLive ? Math.max(elapsed, leg.realtimeEta.etaMinutes)
        : Math.max(elapsed, leg.scheduledDepartureMinutes ?? elapsed + (leg.scheduledWaitMinutes ?? (leg.scheduledIntervalMinutes ?? 6) / 2));
    if (mode === 'arrive') leg.scheduledWaitMinutes = i === 0 ? 0 : Math.max(0, departure - elapsed);
    leg.departureTime = new Date(anchor.getTime() + departure * 60_000).toISOString();
    elapsed = departure + (leg.journeyTimeMinutes ?? 0);
    leg.arrivalTime = new Date(anchor.getTime() + elapsed * 60_000).toISOString();
  }
  route.departureTime = mode === 'arrive'
    ? new Date(new Date(legs[0].departureTime!).getTime() - (route.originWalkMinutes ?? 0) * 60_000).toISOString() : anchor.toISOString();
  route.arrivalTime = new Date(anchor.getTime() + (elapsed + (route.destinationWalkMinutes ?? 0)) * 60_000).toISOString();
  route.timeMode = mode;
}
/** Recheck connections after a fresh initial ETA. */
export function retimeConnections(routes: Route[], now: Date, minimumChangeMinutes = 3) {
  for (const route of routes) {
    let elapsed = 0;
    for (const [index, leg] of (route.legs ?? []).map((l, i) => [i, l] as const)) {
      const accessWalk = leg.accessWalkMinutes ?? (index === 0 ? route.originWalkMinutes ?? 0 : 3);
      elapsed += accessWalk;
      if (index === 0 && leg.realtimeEta && (leg.realtimeEta.isLive || leg.realtimeEta.source === 'SCHEDULED')) {
        if (leg.realtimeEta.etaMinutes < elapsed) { leg.serviceEnded = true; continue; }
        leg.scheduledWaitMinutes = leg.realtimeEta.etaMinutes - elapsed; leg.scheduledDepartureMinutes = leg.realtimeEta.etaMinutes;
      } else if (leg.networkPattern !== undefined) {
        const buffer = index === 0 ? 0 : Math.max(0, minimumChangeMinutes - accessWalk);
        const pattern = networkPatterns[leg.networkPattern], departure = departureAt(pattern, patternWindows(pattern, now), leg.boardingIndex!, elapsed + buffer, false);
        if (!departure) { leg.serviceEnded = true; continue; }
        leg.scheduledWaitMinutes = departure.wait + buffer; leg.scheduledIntervalMinutes = departure.headway;
        leg.publishedHeadwayMinutes = departure.publishedHeadway; leg.scheduledDepartureMinutes = elapsed + buffer + departure.wait;
        const scale = pattern.t[pattern.t.length - 1] > 0 ? departure.duration / pattern.t[pattern.t.length - 1] : 1;
        leg.journeyTimeMinutes = Math.max(1, Math.round((pattern.t[leg.alightingIndex!] - pattern.t[leg.boardingIndex!]) * scale));
      }
      elapsed += (leg.scheduledWaitMinutes ?? (leg.scheduledIntervalMinutes ?? 6) / 2) + (leg.journeyTimeMinutes ?? 0);
    }
    setJourneyTimes(route, now, 'now');
  }
}
