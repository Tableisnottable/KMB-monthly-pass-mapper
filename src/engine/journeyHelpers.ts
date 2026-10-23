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
  const minutes = Math.round((new Date(eta).getTime() - Date.now()) / 60000);
  return minutes < 0 ? 0 : minutes;
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
    .filter((entry) => entry.route === route && entry.dir === dir && entry.eta)
    .map((entry) => etaMinutes(entry.eta))
    .filter((minutes): minutes is number => minutes !== null)
    .sort((a, b) => a - b);
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
