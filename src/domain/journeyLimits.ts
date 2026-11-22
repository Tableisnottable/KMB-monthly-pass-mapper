import type { Route } from '../engine/UpgradedScoringEngine';
export interface JourneyLimits {
  transfers: number | null;
  change: number | null;
  walk: number | null;
  wait: number | null;
  ride: number | null;
}
export const DEFAULT_LIMITS: JourneyLimits = { transfers: null, change: null, walk: null, wait: 120, ride: null };
export function parseJourneyLimits(raw: string | null): JourneyLimits {
  if (!raw) return { ...DEFAULT_LIMITS };
  const input: unknown = JSON.parse(raw);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid journey limits.');
  const limits = { ...DEFAULT_LIMITS };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key) || value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) throw new Error('Journey limit outside its allowed range.');
    limits[key as keyof JourneyLimits] = value as number | null;
  }
  return limits;
}
export const limitAllows = (maximum: number | null | undefined, value: number) => maximum == null || value <= maximum + .001;
export function withinJourneyLimits(route: Route, limits: JourneyLimits): boolean {
  const legs = route.legs ?? route.segments ?? [], transit = legs.filter(leg => leg.mode !== 'WALK');
  const walk = (route.walkTransferTimeMinutes ?? 0) + legs.filter(leg => leg.mode === 'WALK').reduce((sum, leg) => sum + (leg.journeyTimeMinutes ?? 0), 0);
  const totalWait = transit.reduce((sum, leg) => sum + (leg.scheduledWaitMinutes ?? (leg.scheduledIntervalMinutes ?? 0) / 2), 0);
  return limitAllows(limits.transfers, Math.max(0, transit.length - 1)) && limitAllows(limits.walk, walk)
    && limitAllows(limits.ride, transit.reduce((sum, leg) => sum + (leg.journeyTimeMinutes ?? 0), 0)) && limitAllows(limits.wait, totalWait)
    && transit.every((leg, index) => {
      const wait = leg.scheduledWaitMinutes ?? (leg.scheduledIntervalMinutes ?? 0) / 2;
      return limitAllows(limits.wait, wait) && (!index || limitAllows(limits.change, wait + (leg.accessWalkMinutes ?? 3)));
    });
}
