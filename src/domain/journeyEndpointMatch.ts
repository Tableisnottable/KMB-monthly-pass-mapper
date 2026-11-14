import { haversineKm } from '../engine/journeyHelpers';
import type { Route } from '../engine/UpgradedScoringEngine';

const MAX_ENDPOINT_WALK_KM = 1.1;

export function journeyMatchesEndpoints(route: Route, origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): boolean {
  const legs = route.legs ?? route.segments ?? [];
  if (!legs.length) return false;
  const first = legs[0].originStop, last = legs.at(-1)?.destinationStop;
  if (!first || !last || typeof first.lat !== 'number' || typeof first.lng !== 'number'
    || typeof last.lat !== 'number' || typeof last.lng !== 'number'
    || !Number.isFinite(first.lat) || !Number.isFinite(first.lng)
    || !Number.isFinite(last.lat) || !Number.isFinite(last.lng)) return false;

  return haversineKm(origin.lat, origin.lng, first.lat, first.lng) <= MAX_ENDPOINT_WALK_KM
    && haversineKm(destination.lat, destination.lng, last.lat, last.lng) <= MAX_ENDPOINT_WALK_KM;
}
