/**
 * Journey helper utilities shared by the journey API route and its tests.
 */

export type JourneyBound = 'inbound' | 'outbound';
export type DirectionCode = 'I' | 'O';

export interface EtaRecordLike {
  route: string;
  dir: string;
  eta: string | null;
}

export function directionCode(bound: JourneyBound): DirectionCode {
  return bound === 'outbound' ? 'O' : 'I';
}

export function etaMinutes(eta: string | null): number | null {
  if (!eta) return null;
  const time = new Date(eta).getTime();
  if (!Number.isFinite(time)) return null;
  const minutes = Math.round((time - Date.now()) / 60000);
  return minutes < 0 ? 0 : minutes;
}

/**
 * KMB returns `eta: ""` (not null) when a route is listed at a stop but has no
 * scheduled arrival, so truthiness and validity both have to be checked.
 */
function isUsableEta(eta: string | null): eta is string {
  if (!eta) return false;
  return Number.isFinite(new Date(eta).getTime());
}

/**
 * Returns the live ETA minutes (ascending) for a route+direction.
 * Only ETAs in the matching direction are kept so an opposite-direction
 * arrival is never shown for the journey.
 */
export function routeEtaMinutes(
  etas: EtaRecordLike[],
  route: string,
  bound: JourneyBound,
): number[] {
  const dir = directionCode(bound);
  return etas
    .filter((entry) => entry.route === route && entry.dir === dir && isUsableEta(entry.eta))
    .map((entry) => etaMinutes(entry.eta))
    .filter((minutes): minutes is number => minutes !== null)
    .sort((a, b) => a - b);
}

/**
 * Distinguishes "the provider knows this route but has no upcoming trip"
 * (service has stopped for the day, or the route is overnight-only) from
 * "there is an arrival we can wait for". A route with no upcoming trip must
 * not be ranked as if a bus were due any minute.
 */
export function hasUpcomingTrip(etas: EtaRecordLike[], route: string, bound: JourneyBound): boolean {
  const dir = directionCode(bound);
  return etas.some(
    (entry) =>
      entry.route === route &&
      entry.dir === dir &&
      isUsableEta(entry.eta) &&
      new Date(entry.eta).getTime() > Date.now() - 60_000,
  );
}

/**
 * Derives the scheduled interval (headway) from consecutive ETA gaps.
 * Falls back when fewer than two ETAs are known or the gap is implausible.
 */
export function deriveHeadway(minutes: number[], fallback = 10): number {
  if (minutes.length < 2) return fallback;
  const gaps = minutes.slice(1).map((minutesAt, index) => minutesAt - minutes[index]);
  const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  return averageGap >= 1 && averageGap <= 60 ? Math.round(averageGap) : fallback;
}

export interface ScoredJourneyLike {
  finalScore: number;
  legs?: { routeNumber?: string }[];
}

/**
 * Picks the alighting stop for a direct ride: it must be served by this
 * direction of the route and must come strictly after the boarding stop.
 * Returns null when the route does not actually connect the two points.
 */
export function pickAlightingIndex(
  stopSequence: { stop: string }[],
  boardingStopId: string,
  candidateStopIds: Set<string>,
): { stopId: string; index: number } | null {
  const indexByOccupiedStop = new Map<string, number>();
  stopSequence.forEach((row, index) => {
    if (!indexByOccupiedStop.has(row.stop)) indexByOccupiedStop.set(row.stop, index);
  });
  const boardingIdx = indexByOccupiedStop.get(boardingStopId);
  if (boardingIdx === undefined) return null;

  let best: { stopId: string; index: number } | null = null;
  candidateStopIds.forEach((stopId) => {
    const idx = indexByOccupiedStop.get(stopId);
    if (idx === undefined || idx <= boardingIdx) return;
    if (!best || idx < best.index) best = { stopId, index: idx };
  });
  return best;
}

/**
 * Collapses journeys that ride the same set of routes (in any direction to
 * the same stops) to the best-scoring one, then sorts by score ascending.
 */
export function dedupeByRouteNumber<T extends ScoredJourneyLike>(routes: T[]): T[] {
  const best = new Map<string, T>();
  for (const route of routes) {
    const key = (route.legs ?? []).map((leg) => leg.routeNumber ?? '').join('+');
    const existing = best.get(key);
    if (!existing || route.finalScore < existing.finalScore) {
      best.set(key, route);
    }
  }
  return Array.from(best.values()).sort((a, b) => a.finalScore - b.finalScore);
}

export interface WalkableStop<T> {
  stop: T;
  walkMinutes: number;
}

/**
 * Picks up to `limit` stops while keeping every walk-time band represented.
 * Dense areas cluster many stops within a minute of each other, so a plain
 * "nearest N" cut can spend the whole budget on one interchange and miss the
 * stops that actual routes call at.
 */
export function pickStopsByWalkBand<T>(
  stops: WalkableStop<T>[],
  limit: number,
): WalkableStop<T>[] {
  const bandOf = (walkMinutes: number) =>
    walkMinutes <= 2 ? 0 : walkMinutes <= 5 ? 1 : walkMinutes <= 10 ? 2 : 3;
  const bands: WalkableStop<T>[][] = [[], [], [], []];
  for (const entry of [...stops].sort((a, b) => a.walkMinutes - b.walkMinutes)) {
    bands[bandOf(entry.walkMinutes)].push(entry);
  }

  const picked: WalkableStop<T>[] = [];
  let added = true;
  while (picked.length < limit && added) {
    added = false;
    for (const band of bands) {
      if (picked.length >= limit) break;
      const next = band.shift();
      if (next) {
        picked.push(next);
        added = true;
      }
    }
  }
  return picked.sort((a, b) => a.walkMinutes - b.walkMinutes);
}
