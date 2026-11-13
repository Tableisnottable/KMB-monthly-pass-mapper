import { haversineKm } from './journeyHelpers';
import { scoreRoutes, UpgradedScoringEngine, type Route, type Segment, type ScoredRoute } from './UpgradedScoringEngine';
import { hongKongClock, isServiceActive, networkPatterns, networkRoutes, networkStops,
  networkStop, publishedFare, railFare, weightingDate, type NetworkPattern } from '../data/transportNetwork';

type Point = { lat: number; lng: number };
type Label = { stop: number; elapsed: number; cost: number; legs: Segment[]; walk: number; pendingWalk: number; originWalk: number; used: number[] };
type Window = { start: number; end: number; headway: number; duration: number };
const WALK_SPEED = 5 / 60;
const MAX_ROUNDS = 4;
const MAX_WAIT = 90;
const MAX_JOURNEY = 240;
const cell = (lat: number, lng: number) => `${Math.floor(lat * 250)}:${Math.floor(lng * 250)}`;
const grid = new Map<string, number[]>();
networkStops.forEach((s, i) => { const key = cell(s[3], s[4]); grid.set(key, [...(grid.get(key) ?? []), i]); });

export function nearbyNetworkStops(point: Point, radiusKm = 0.9): { index: number; walk: number }[] {
  const latCell = Math.floor(point.lat * 250), lngCell = Math.floor(point.lng * 250);
  const range = Math.ceil(radiusKm / 0.4) + 1;
  const found = [];
  for (let x = -range; x <= range; x++) for (let y = -range; y <= range; y++) {
    for (const index of grid.get(`${latCell + x}:${lngCell + y}`) ?? []) {
      const s = networkStops[index];
      const km = haversineKm(point.lat, point.lng, s[3], s[4]);
      if (km <= radiusKm) found.push({ index, walk: Math.max(1, Math.ceil(km * 1.2 / WALK_SPEED)) });
    }
  }
  return found.sort((a, b) => a.walk - b.walk);
}

const transferCache = new Map<number, { index: number; walk: number }[]>();
function transfers(index: number) {
  if (!transferCache.has(index)) {
    const s = networkStops[index];
    const radius = s[6] === 'SUBWAY' ? 0.45 : 0.25;
    transferCache.set(index, nearbyNetworkStops({ lat: s[3], lng: s[4] }, radius)
      .filter(r => r.index !== index).map(r => ({ ...r, walk: Math.max(3, r.walk) })));
  }
  return transferCache.get(index)!;
}

/** Include the previous service day for GTFS times such as 25:15. */
export function activeWindows(pattern: NetworkPattern, date: Date): Window[] {
  const now = hongKongClock(date).minute;
  const windows: Window[] = [];
  for (const shift of [-1, 0, 1]) {
    const serviceDate = new Date(date.getTime() + shift * 86400_000);
    for (const [service, start, end, headway, duration] of pattern.w) {
      if (isServiceActive(service, serviceDate)) {
        const s = start + shift * 1440 - now, e = end + shift * 1440 - now;
        if (e + duration >= 0 && s <= MAX_JOURNEY + MAX_WAIT) windows.push({ start: s, end: e, headway, duration });
      }
    }
  }
  return windows;
}

/** Earliest published departure at a boarding stop; frequency end is exclusive. */
export function nextDeparture(windows: Window[], offset: number, earliest: number) {
  let best: { wait: number; duration: number; headway: number; publishedHeadway?: number } | undefined;
  for (const w of windows) {
    let departure = w.start + offset;
    if (w.headway > 0 && departure < earliest) departure += Math.ceil((earliest - departure) / w.headway) * w.headway;
    if (departure + 0.01 < earliest || (w.headway > 0 && departure >= w.end + offset)) continue;
    const wait = Math.max(0, departure - earliest);
    if (wait > MAX_WAIT || (best && wait >= best.wait)) continue;
    // A five-minute headway starting an hour from now is not a 2.5-minute
    // wait. Encode that known gap as an equivalent interval for the existing
    // half-headway formula; retain the published headway for display.
    best = { wait, duration: w.duration, headway: Math.max(w.headway, wait * 2), publishedHeadway: w.headway || undefined };
  }
  return best;
}

function addLabel(map: Map<number, Label[]>, value: Label) {
  if (value.elapsed > MAX_JOURNEY) return;
  const labels = map.get(value.stop) ?? [];
  const key = value.used.join(',');
  // Retain different route choices and faster arrivals, since both can matter
  // for a later connection. Bound memory without deduplicating route numbers.
  if (labels.some(l => l.used.join(',') === key && l.cost <= value.cost && l.elapsed <= value.elapsed)) return;
  const remaining = labels.filter(l => !(l.used.join(',') === key && value.cost <= l.cost && value.elapsed <= l.elapsed));
  remaining.push(value);
  remaining.sort((a, b) => a.cost - b.cost || a.elapsed - b.elapsed);
  if (remaining.length > 4) {
    const fastest = remaining.reduce((a, b) => a.elapsed < b.elapsed ? a : b);
    remaining.length = 3;
    if (!remaining.includes(fastest)) remaining.push(fastest);
  }
  map.set(value.stop, remaining);
}

export function findMultimodalJourneys(from: Point, to: Point, date = new Date(), locale: 'zh' | 'en' = 'zh') {
  const scoreDate = weightingDate(date);
  const originStops = nearbyNetworkStops(from), destinationStops = nearbyNetworkStops(to);
  if (!originStops.length || !destinationStops.length) return { routes: [], originStops, destinationStops, candidates: 0 };
  const endings = new Map(destinationStops.map(s => [s.index, s.walk]));
  let frontier = new Map<number, Label[]>();
  for (const { index, walk } of originStops) addLabel(frontier, {
    stop: index, elapsed: walk, cost: walk, legs: [], walk, pendingWalk: walk, originWalk: walk, used: [],
  });
  const windows = networkPatterns.map(p => activeWindows(p, date));
  const results: Route[] = [];
  let bestCompleteCost = Infinity;
  for (let round = 0; round < MAX_ROUNDS && frontier.size; round++) {
    const arrivals = new Map<number, Label[]>();
    networkPatterns.forEach((pattern, patternIndex) => {
      const route = networkRoutes[pattern.r];
      const rail = route[5] === 'SUBWAY' || route[5] === 'LIGHT_RAIL';
      if (!rail && !windows[patternIndex].length) return;
      const boardings: { label: Label; position: number; wait: number; duration: number; interval: number; publishedHeadway?: number; baseCost: number }[] = [];
      for (let position = 0; position < pattern.s.length; position++) {
        const index = pattern.s[position];
        if (pattern.a[position] === 0) for (const boarding of boardings) {
          const { label, position: start, wait, duration, interval } = boarding;
          const scale = pattern.t[pattern.t.length - 1] > 0 ? duration / pattern.t[pattern.t.length - 1] : 1;
          const ride = Math.max(1, Math.round((pattern.t[position] - pattern.t[start]) * scale));
          if (label.elapsed + wait + ride > MAX_JOURNEY) continue;
          const cost = boarding.baseCost + ride, elapsed = label.elapsed + wait + ride;
          if (cost > bestCompleteCost * 1.8 + 15) continue;
          const existing = arrivals.get(index);
          if (existing?.some(l => l.cost <= cost && l.elapsed <= elapsed && (round > 0 || l.used[l.used.length - 1] === pattern.r))) continue;
          const operator = route[1] === 'KMB+CTB' ? 'KMB' : route[1] === 'LWB+CTB' ? 'LWB' : route[1];
          const leg: Segment = {
            id: `${pattern.id}:${start}:${position}`, operator, mode: route[5], routeNumber: route[2],
            routeName: route[locale === 'en' ? 4 : 3],
            originStop: networkStop(pattern.s[start], locale), destinationStop: networkStop(index, locale),
            journeyTimeMinutes: ride, scheduledIntervalMinutes: interval, realtimeEta: null, fare: 0,
            serviceStatus: rail ? 'UNVERIFIED' : 'TIMETABLE',
            scheduledDepartureMinutes: rail ? undefined : Math.ceil(label.elapsed + wait),
            scheduledWaitMinutes: wait, accessWalkMinutes: label.pendingWalk,
            publishedHeadwayMinutes: boarding.publishedHeadway,
            networkPattern: patternIndex, boardingIndex: start, alightingIndex: position,
          };
          const legs = [...label.legs, leg];
          addLabel(arrivals, { stop: index, cost, elapsed,
            legs, walk: label.walk, pendingWalk: 0, originWalk: label.originWalk, used: [...label.used, pattern.r] });
          const destinationWalk = endings.get(index);
          if (destinationWalk !== undefined) bestCompleteCost = Math.min(bestCompleteCost, cost + destinationWalk);
        }
        if (pattern.p[position] !== 0 || position === pattern.s.length - 1) continue;
        for (const label of frontier.get(index) ?? []) {
          if (label.used.includes(pattern.r)) continue;
          const departure = rail ? { wait: route[5] === 'LIGHT_RAIL' ? 4 : 3,
            duration: pattern.t[pattern.t.length - 1], headway: route[5] === 'LIGHT_RAIL' ? 8 : 6,
            publishedHeadway: route[5] === 'LIGHT_RAIL' ? 8 : 6 }
            : nextDeparture(windows[patternIndex], pattern.t[position], label.elapsed);
          if (!departure) continue;
          const operator = route[1] === 'KMB+CTB' ? 'KMB' : route[1] === 'LWB+CTB' ? 'LWB' : route[1];
          const baseCost = label.cost + UpgradedScoringEngine.calculateSegmentScore({ operator, journeyTimeMinutes: 0, scheduledIntervalMinutes: departure.headway }, scoreDate) + (round ? 8 : 0);
          boardings.push({ label, position, wait: departure.wait, duration: departure.duration, interval: departure.headway,
            publishedHeadway: departure.publishedHeadway, baseCost });
          // Prune dominated boardings of the same pattern before scanning all
          // later stops; keep several distinct incoming routes for alternatives.
          boardings.sort((a, b) => (a.label.cost + a.wait - pattern.t[a.position]) - (b.label.cost + b.wait - pattern.t[b.position]));
          if (boardings.length > 6) boardings.length = 6;
        }
      }
    });
    for (const [stop, labels] of Array.from(arrivals)) {
      const destinationWalk = endings.get(stop);
      if (destinationWalk !== undefined) for (const label of labels) results.push({
        id: 'multi:' + label.legs.map(l => l.id).join('|'), legs: label.legs,
        walkTransferTimeMinutes: label.walk + destinationWalk, originWalkMinutes: label.originWalk,
        destinationWalkMinutes: destinationWalk, transferCount: round,
      });
    }
    frontier = new Map();
    for (const [stop, labels] of Array.from(arrivals)) for (const label of labels) {
      addLabel(frontier, { ...label, elapsed: label.elapsed + 3, cost: label.cost + 3, walk: label.walk + 3, pendingWalk: 3 });
      for (const transfer of transfers(stop)) addLabel(frontier, { ...label, stop: transfer.index,
        elapsed: label.elapsed + transfer.walk, cost: label.cost + transfer.walk, walk: label.walk + transfer.walk, pendingWalk: transfer.walk });
    }
  }
  const selected = dedupeJourneys(scoreRoutes(results, scoreDate)).slice(0, 30);
  for (const result of selected) for (const leg of result.legs) {
    const pattern = networkPatterns[leg.networkPattern!];
    const from = pattern.s[leg.boardingIndex!], to = pattern.s[leg.alightingIndex!];
    const fare = leg.mode === 'SUBWAY' || leg.mode === 'LIGHT_RAIL' ? railFare(from, to) : publishedFare(pattern.r, from, to);
    leg.fare = fare ?? 0; leg.fareStatus = fare === undefined ? 'UNAVAILABLE' : 'PUBLISHED';
    leg.path = pattern.s.slice(leg.boardingIndex, leg.alightingIndex! + 1).map(i => [networkStops[i][3], networkStops[i][4]]);
  }
  // Consecutive MTR lines are one paid rail journey. Apply its published OD
  // fare once, while leaving the user's scoring/fare engine untouched.
  for (const result of selected) {
    const legs = result.legs!;
    for (let i = 0; i < legs.length; i++) {
      if (legs[i].mode !== 'SUBWAY' || legs[i].routeNumber === 'AEL') continue;
      let end = i;
      while (end + 1 < legs.length && legs[end + 1].mode === 'SUBWAY' && legs[end + 1].routeNumber !== 'AEL') end++;
      if (end > i) {
        const fromIndex = networkStops.findIndex(s => s[0] === legs[i].originStop!.id);
        const toIndex = networkStops.findIndex(s => s[0] === legs[end].destinationStop!.id);
        const fare = railFare(fromIndex, toIndex);
        legs[i].fare = fare ?? 0; legs[i].fareStatus = fare === undefined ? 'UNAVAILABLE' : 'PUBLISHED';
        for (let j = i + 1; j <= end; j++) { legs[j].fare = 0; legs[j].fareStatus = legs[i].fareStatus; }
      }
      i = end;
    }
  }
  const scored = dedupeJourneys(scoreRoutes(selected, scoreDate));
  return { routes: scored.slice(0, 30), originStops, destinationStops, candidates: results.length };
}

export function dedupeJourneys(routes: ScoredRoute[]): ScoredRoute[] {
  const seen = new Set<string>();
  return [...routes].sort((a, b) => a.finalScore - b.finalScore).filter(route => {
    const key = route.legs.map(l => {
      const p = l.networkPattern === undefined ? undefined : networkPatterns[l.networkPattern];
      // Use the official route ID so regional GMB routes with the same number
      // remain distinct. Different stopping variants can still share a result.
      return p ? networkRoutes[p.r][0] : `${l.operator}:${l.routeNumber}`;
    }).join('|');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/** Recheck connections after a live prediction changes the first boarding. */
export function retimeConnections(routes: Route[], now: Date) {
  for (const route of routes) {
    let elapsed = 0;
    for (const [index, leg] of (route.legs ?? []).map((leg, index) => [index, leg] as const)) {
      elapsed += leg.accessWalkMinutes ?? (index === 0 ? route.originWalkMinutes ?? 0 : 3);
      if (index === 0 && leg.realtimeEta?.isLive) {
        leg.scheduledWaitMinutes = Math.max(0, leg.realtimeEta.etaMinutes - elapsed);
      } else if (leg.networkPattern !== undefined && leg.serviceStatus === 'TIMETABLE') {
        const pattern = networkPatterns[leg.networkPattern];
        const departure = nextDeparture(activeWindows(pattern, now), pattern.t[leg.boardingIndex!], elapsed);
        if (!departure) { leg.serviceEnded = true; continue; }
        leg.scheduledWaitMinutes = departure.wait;
        leg.scheduledIntervalMinutes = departure.headway;
        leg.publishedHeadwayMinutes = departure.publishedHeadway;
        leg.scheduledDepartureMinutes = Math.ceil(elapsed + departure.wait);
        const scale = pattern.t[pattern.t.length - 1] > 0 ? departure.duration / pattern.t[pattern.t.length - 1] : 1;
        leg.journeyTimeMinutes = Math.max(1, Math.round((pattern.t[leg.alightingIndex!] - pattern.t[leg.boardingIndex!]) * scale));
      }
      elapsed += (leg.scheduledWaitMinutes ?? (leg.scheduledIntervalMinutes ?? 6) / 2) + (leg.journeyTimeMinutes ?? 0);
    }
  }
}
