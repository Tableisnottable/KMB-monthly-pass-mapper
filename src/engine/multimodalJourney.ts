import { haversineKm } from './journeyHelpers';
import { scoreRoutes, UpgradedScoringEngine, WALK_MULTIPLIER, FARE_MINUTES_PER_DOLLAR,
  type Route, type Segment, type ScoredRoute } from './UpgradedScoringEngine';
import { hongKongClock, isServiceActive, networkPatterns, networkRoutes, networkStops,
  networkStop, networkStopIndex, normalAdultFare, railFare, weightingDate, type NetworkPattern } from '../data/transportNetwork';

type Point = { lat: number; lng: number };
type Label = { stop: number; elapsed: number; cost: number; legs: Segment[]; walk: number; pendingWalk: number; originWalk: number; used: number[] };
type Window = { start: number; end: number; headway: number; duration: number };
const WALK_SPEED = 5 / 60, MAX_ROUNDS = 4, MAX_WAIT = 90, MAX_JOURNEY = 240;
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
const transferCache = new Map<number, { index: number; walk: number }[]>();
function transfers(index: number) {
  if (!transferCache.has(index)) {
    const s = networkStops[index];
    transferCache.set(index, nearbyNetworkStops({ lat: s[3], lng: s[4] }, s[6] === 'SUBWAY' ? 0.45 : 0.3)
      .filter(r => r.index !== index).map(r => ({ ...r, walk: Math.max(3, r.walk) })));
  }
  return transferCache.get(index)!;
}

/** Include adjacent service days and GTFS times above 24:00 in both directions. */
export function activeWindows(pattern: NetworkPattern, date: Date): Window[] {
  const now = hongKongClock(date).minute, windows: Window[] = [];
  for (const shift of [-1, 0, 1]) for (const [service, start, end, headway, duration] of pattern.w) {
    if (isServiceActive(service, new Date(date.getTime() + shift * 86400_000))) {
      const s = start + shift * 1440 - now, e = end + shift * 1440 - now;
      if (e + duration >= -MAX_JOURNEY - MAX_WAIT && s <= MAX_JOURNEY + MAX_WAIT) windows.push({ start: s, end: e, headway, duration });
    }
  }
  return windows;
}
export function nextDeparture(windows: Window[], offset: number, earliest: number) {
  let best: { wait: number; duration: number; headway: number; publishedHeadway?: number } | undefined;
  for (const w of windows) {
    let departure = w.start + offset;
    if (w.headway > 0 && departure < earliest) departure += Math.ceil((earliest - departure) / w.headway) * w.headway;
    if (departure + 0.001 < earliest || (w.headway > 0 && departure >= w.end + offset)) continue;
    const wait = Math.max(0, departure - earliest);
    if (wait > MAX_WAIT || (best && wait >= best.wait)) continue;
    best = { wait, duration: w.duration, headway: Math.max(w.headway, wait * 2), publishedHeadway: w.headway || undefined };
  }
  return best;
}
/** Latest trip at a downstream stop; frequency end is exclusive. */
export function previousDeparture(windows: Window[], offset: number, latest: number) {
  let best: { wait: number; duration: number; headway: number; publishedHeadway?: number } | undefined;
  for (const w of windows) {
    let departure = w.start + offset;
    if (w.headway > 0) {
      const n = Math.min(Math.floor((latest - departure + 1e-7) / w.headway), Math.ceil((w.end - w.start) / w.headway) - 1);
      if (n < 0) continue;
      departure += n * w.headway;
    }
    if (departure > latest + 0.001) continue;
    const wait = Math.max(0, latest - departure);
    if (wait > MAX_WAIT || (best && wait >= best.wait)) continue;
    best = { wait, duration: w.duration, headway: w.headway, publishedHeadway: w.headway || undefined };
  }
  return best;
}
/** Topology-only rail feeds: conservative estimated 06:00–00:00 terminal windows. */
function patternWindows(pattern: NetworkPattern, date: Date): Window[] {
  if (pattern.w.length) return activeWindows(pattern, date);
  const mode = networkRoutes[pattern.r][5];
  if (mode !== 'SUBWAY' && mode !== 'LIGHT_RAIL') return [];
  const minute = hongKongClock(date).minute;
  return [-1, 0, 1].map(day => ({ start: day * 1440 + 360 - minute, end: day * 1440 + 1440 - minute,
    headway: mode === 'LIGHT_RAIL' ? 8 : 6, duration: pattern.t[pattern.t.length - 1] }));
}
function departureAt(pattern: NetworkPattern, windows: Window[], position: number, time: number, reverse: boolean) {
  const total = pattern.t[pattern.t.length - 1];
  const shifted = windows.map(w => { const offset = pattern.t[position] * (total ? w.duration / total : 1); return { ...w, start: w.start + offset, end: w.end + offset }; });
  return reverse ? previousDeparture(shifted, 0, time) : nextDeparture(shifted, 0, time);
}
function addLabel(map: Map<number, Label[]>, value: Label, limit = 4) {
  if (value.elapsed > MAX_JOURNEY) return;
  const labels = map.get(value.stop) ?? [], key = value.used.join(',');
  if (labels.some(l => l.used.join(',') === key && l.cost <= value.cost && l.elapsed <= value.elapsed)) return;
  const remaining = labels.filter(l => !(l.used.join(',') === key && value.cost <= l.cost && value.elapsed <= l.elapsed));
  remaining.push(value); remaining.sort((a, b) => a.cost - b.cost || a.elapsed - b.elapsed);
  // Keep different incoming routes, since a cheap feeder can make a valuable
  // onward connection even when it is dominated at an intermediate stop.
  const diverse: Label[] = [], families = new Set<string>();
  for (const l of remaining) {
    const family = l.used.join(',');
    if (!families.has(family)) { diverse.push(l); families.add(family); }
    if (diverse.length === limit) break;
  }
  const fastest = remaining.reduce((a, b) => a.elapsed < b.elapsed ? a : b);
  if (!diverse.includes(fastest)) diverse.push(fastest);
  map.set(value.stop, diverse);
}

type JourneySearchResult = { routes: ScoredRoute[]; originStops: { index: number; walk: number }[]; destinationStops: { index: number; walk: number }[]; candidates: number };
export function findMultimodalJourneys(from: Point, to: Point, date = new Date(), locale: 'zh' | 'en' = 'zh', reverse = false, simpleOnly = false): JourneySearchResult {
  const scoreDate = weightingDate(date), originStops = nearbyNetworkStops(from, 1.1), destinationStops = nearbyNetworkStops(to, 1.1);
  if (!originStops.length || !destinationStops.length) return { routes: [], originStops, destinationStops, candidates: 0 };
  const endings = new Map((reverse ? originStops : destinationStops).map(s => [s.index, s.walk]));
  const rounds = simpleOnly ? 2 : MAX_ROUNDS;
  const finishing = new Set(networkPatterns.map((p, i) => p.s.some((s, j) => endings.has(s) && (reverse ? p.p : p.a)[j] === 0) ? i : -1));
  let frontier = new Map<number, Label[]>();
  for (const { index, walk } of reverse ? destinationStops : originStops) addLabel(frontier, {
    stop: index, elapsed: walk, cost: walk * WALK_MULTIPLIER, legs: [], walk, pendingWalk: walk, originWalk: walk, used: [],
  });
  const windows = networkPatterns.map(p => patternWindows(p, date)), results: Route[] = [];
  const fareCache = new Map<string, ReturnType<typeof normalAdultFare>>();
  let bestCompleteCost = Infinity;
  for (let round = 0; round < rounds && frontier.size; round++) {
    const arrivals = new Map<number, Label[]>();
    networkPatterns.forEach((pattern, patternIndex) => {
      if (!windows[patternIndex].length) return;
      if (simpleOnly && round === 1 && !finishing.has(patternIndex)) return;
      const route = networkRoutes[pattern.r], rail = route[5] === 'SUBWAY' || route[5] === 'LIGHT_RAIL';
      const operator = route[1] === 'KMB+CTB' ? 'KMB' : route[1] === 'LWB+CTB' ? 'LWB' : route[1];
      const boardings: { label: Label; position: number; wait: number; duration: number; interval: number; publishedHeadway?: number }[] = [];
      for (let step = 0; step < pattern.s.length; step++) {
        const position = reverse ? pattern.s.length - 1 - step : step, index = pattern.s[position];
        if ((reverse ? pattern.p : pattern.a)[position] === 0) for (const boarding of boardings) {
          const { label, wait, duration, interval } = boarding;
          const start = reverse ? position : boarding.position, end = reverse ? boarding.position : position;
          const scale = pattern.t[pattern.t.length - 1] > 0 ? duration / pattern.t[pattern.t.length - 1] : 1;
          const ride = Math.max(1, Math.round((pattern.t[end] - pattern.t[start]) * scale)), elapsed = label.elapsed + wait + ride;
          if (elapsed > MAX_JOURNEY) continue;
          const waitCost = (reverse ? (label.legs.length ? wait : 0) : wait) * UpgradedScoringEngine.getTimeMultiplier(scoreDate);
          if (label.cost + ride + waitCost + (round ? 8 : 0) > bestCompleteCost * 1.9 + 35) continue;
          const fareKey = `${pattern.r}:${pattern.s[start]}:${pattern.s[end]}`;
          if (!fareCache.has(fareKey)) fareCache.set(fareKey, normalAdultFare(pattern.r, pattern.s[start], pattern.s[end]));
          const adult = fareCache.get(fareKey)!;
          const leg: Segment = {
            id: `${pattern.id}:${start}:${end}`, operator, networkOperator: route[1], mode: route[5], routeNumber: route[2], routeName: route[locale === 'en' ? 4 : 3],
            originStop: networkStop(pattern.s[start], locale), destinationStop: networkStop(pattern.s[end], locale),
            journeyTimeMinutes: ride, scheduledIntervalMinutes: interval, realtimeEta: null, ...adult,
            serviceStatus: rail ? 'UNVERIFIED' : 'TIMETABLE', scheduledDepartureMinutes: reverse ? -elapsed : label.elapsed + wait,
            scheduledWaitMinutes: reverse ? 0 : wait, accessWalkMinutes: reverse ? 0 : label.pendingWalk,
            publishedHeadwayMinutes: boarding.publishedHeadway, networkPattern: patternIndex, boardingIndex: start, alightingIndex: end,
          };
          const rest = reverse ? label.legs.map((l, i) => i === 0 ? { ...l, scheduledWaitMinutes: wait, accessWalkMinutes: label.pendingWalk } : l) : label.legs;
          const legs = reverse ? [leg, ...rest] : [...rest, leg];
          const cost = label.cost + ride + waitCost + UpgradedScoringEngine.getOperatorAdjustment(operator)
            + adult.fare * FARE_MINUTES_PER_DOLLAR + (rail ? 4 : 0) + (round ? 8 : 0);
          if (cost > bestCompleteCost * 1.9 + 30) continue;
          addLabel(arrivals, { stop: index, cost, elapsed, legs, walk: label.walk, pendingWalk: 0,
            originWalk: label.originWalk, used: reverse ? [pattern.r, ...label.used] : [...label.used, pattern.r] }, simpleOnly && round === 0 ? 48 : 4);
          const endWalk = endings.get(index);
          if (endWalk !== undefined) {
            bestCompleteCost = Math.min(bestCompleteCost, cost + endWalk * WALK_MULTIPLIER);
            const complete = legs.map(l => ({ ...l }));
            if (reverse) complete[0].accessWalkMinutes = endWalk;
            results.push({ id: 'multi:' + complete.map(l => l.id).join('|'), legs: complete,
              walkTransferTimeMinutes: label.walk + endWalk, originWalkMinutes: reverse ? endWalk : label.originWalk,
              destinationWalkMinutes: reverse ? label.originWalk : endWalk, transferCount: round, timeMode: reverse ? 'arrive' : 'depart' });
          }
        }
        if ((reverse ? pattern.a : pattern.p)[position] !== 0 || step === pattern.s.length - 1) continue;
        for (const label of frontier.get(index) ?? []) {
          if (label.used.includes(pattern.r)) continue;
          const departure = departureAt(pattern, windows[patternIndex], position, reverse ? -label.elapsed : label.elapsed, reverse);
          if (departure) boardings.push({ label, position, wait: departure.wait, duration: departure.duration,
            interval: departure.headway, publishedHeadway: departure.publishedHeadway });
        }
        if (boardings.length > (simpleOnly ? 100 : 12)) {
          boardings.sort((a, b) => (a.label.cost + a.wait + (reverse ? 1 : -1) * pattern.t[a.position]) - (b.label.cost + b.wait + (reverse ? 1 : -1) * pattern.t[b.position]));
          const seen = new Set<string>(), keep = boardings.filter(b => { const k = b.label.used.join(','); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, simpleOnly ? 48 : 5);
          for (const b of boardings) if (keep.length < (simpleOnly ? 64 : 8) && !keep.includes(b)) keep.push(b);
          boardings.splice(0, boardings.length, ...keep);
        }
      }
    });
    if (round === rounds - 1) break;
    frontier = new Map();
    for (const [stop, labels] of Array.from(arrivals)) for (const label of labels) {
      addLabel(frontier, { ...label, elapsed: label.elapsed + 3, cost: label.cost + 3 * WALK_MULTIPLIER, walk: label.walk + 3, pendingWalk: 3 }, simpleOnly ? 48 : 4);
      for (const t of transfers(stop)) addLabel(frontier, { ...label, stop: t.index, elapsed: label.elapsed + t.walk,
        cost: label.cost + t.walk * WALK_MULTIPLIER, walk: label.walk + t.walk, pendingWalk: t.walk }, simpleOnly ? 48 : 4);
    }
  }
  for (const result of results) combineRailFares(result);
  const simple = simpleOnly ? null : findMultimodalJourneys(from, to, date, locale, reverse, true);
  // A sparse direct service can score below a large number of interchange
  // permutations. Retain it so users can still compare the simpler journey.
  const selected = dedupeJourneys([...scoreRoutes(results, scoreDate), ...(simple?.routes ?? [])])
    .filter((route, index) => index < 1000 || route.transferCount === 0);
  for (const result of selected) setJourneyTimes(result, date, reverse ? 'arrive' : 'depart');
  return { routes: selected, originStops, destinationStops, candidates: results.length + (simple?.candidates ?? 0) };
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
    const key = route.legs.map(l => l.networkPattern === undefined || l.mode !== 'MINIBUS' ? `${l.operator}:${l.routeNumber}` : networkRoutes[networkPatterns[l.networkPattern].r][0]).join('|');
    if (seen.has(key)) return false; seen.add(key); return true;
  });
}
export function selectJourneyAlternatives(routes: ScoredRoute[], limit = 40) {
  if (limit <= 0) return [];
  const ranked = dedupeJourneys(routes);
  const durations = new Map(ranked.map(r => [r, r.legs.reduce((sum, l) => sum + (l.journeyTimeMinutes ?? 0) + (l.scheduledWaitMinutes ?? 0), r.walkTransferTimeMinutes)]));
  const duration = (r: ScoredRoute) => durations.get(r)!;
  const family = (leg: Segment) => leg.networkPattern === undefined || leg.mode !== 'MINIBUS'
    ? leg.operator + ':' + leg.routeNumber : networkRoutes[networkPatterns[leg.networkPattern].r][0];
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
  return Array.from(chosen).sort((a, b) => a.finalScore - b.finalScore);
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
export function retimeConnections(routes: Route[], now: Date) {
  for (const route of routes) {
    let elapsed = 0;
    for (const [index, leg] of (route.legs ?? []).map((l, i) => [i, l] as const)) {
      elapsed += leg.accessWalkMinutes ?? (index === 0 ? route.originWalkMinutes ?? 0 : 3);
      if (index === 0 && leg.realtimeEta?.isLive) {
        if (leg.realtimeEta.etaMinutes < elapsed) { leg.serviceEnded = true; continue; }
        leg.scheduledWaitMinutes = leg.realtimeEta.etaMinutes - elapsed; leg.scheduledDepartureMinutes = leg.realtimeEta.etaMinutes;
      } else if (leg.networkPattern !== undefined) {
        const pattern = networkPatterns[leg.networkPattern], departure = departureAt(pattern, patternWindows(pattern, now), leg.boardingIndex!, elapsed, false);
        if (!departure) { leg.serviceEnded = true; continue; }
        leg.scheduledWaitMinutes = departure.wait; leg.scheduledIntervalMinutes = departure.headway;
        leg.publishedHeadwayMinutes = departure.publishedHeadway; leg.scheduledDepartureMinutes = elapsed + departure.wait;
        const scale = pattern.t[pattern.t.length - 1] > 0 ? departure.duration / pattern.t[pattern.t.length - 1] : 1;
        leg.journeyTimeMinutes = Math.max(1, Math.round((pattern.t[leg.alightingIndex!] - pattern.t[leg.boardingIndex!]) * scale));
      }
      elapsed += (leg.scheduledWaitMinutes ?? (leg.scheduledIntervalMinutes ?? 6) / 2) + (leg.journeyTimeMinutes ?? 0);
    }
    setJourneyTimes(route, now, 'now');
  }
}
