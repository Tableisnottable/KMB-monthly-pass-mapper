import type { ScoredRoute, Stop } from '../engine/UpgradedScoringEngine';
import { haversineKm } from '../engine/journeyHelpers';

export interface NavigationStep {
  id: string; kind: 'walk' | 'board' | 'ride' | 'alight' | 'arrive';
  legIndex: number; from: Stop; to: Stop; minutes?: number;
}
const distance = (a: Stop, b: Stop) => a.lat === undefined || a.lng === undefined || b.lat === undefined || b.lng === undefined
  ? Infinity : haversineKm(a.lat, a.lng, b.lat, b.lng) * 1000;

export function navigationSteps(route: ScoredRoute, places: { origin: Stop | null; destination: Stop | null }): NavigationStep[] {
  const steps: NavigationStep[] = [];
  let previous = places.origin ?? route.legs[0]?.originStop;
  route.legs.forEach((leg, legIndex) => {
    if (!leg.originStop || !leg.destinationStop) return;
    if (!previous) previous = leg.originStop;
    if (distance(previous, leg.originStop) > 40) steps.push({ id: `access-${legIndex}`, kind: 'walk', legIndex,
      from: previous, to: leg.originStop, minutes: leg.accessWalkMinutes ?? (legIndex ? 3 : route.originWalkMinutes) });
    if (leg.mode === 'WALK') steps.push({ id: `walk-${legIndex}`, kind: 'walk', legIndex,
      from: leg.originStop, to: leg.destinationStop, minutes: leg.journeyTimeMinutes });
    else {
      steps.push({ id: `board-${legIndex}`, kind: 'board', legIndex, from: leg.originStop, to: leg.originStop });
      steps.push({ id: `ride-${legIndex}`, kind: 'ride', legIndex, from: leg.originStop, to: leg.destinationStop, minutes: leg.journeyTimeMinutes });
      steps.push({ id: `alight-${legIndex}`, kind: 'alight', legIndex, from: leg.destinationStop, to: leg.destinationStop });
    }
    previous = leg.destinationStop;
  });
  const destination = places.destination ?? previous;
  if (previous && destination) {
    if (distance(previous, destination) > 40) steps.push({ id: 'egress', kind: 'walk', legIndex: route.legs.length - 1,
      from: previous, to: destination, minutes: route.destinationWalkMinutes });
    steps.push({ id: 'arrive', kind: 'arrive', legIndex: route.legs.length - 1, from: destination, to: destination });
  }
  return steps;
}

export function navigationDistance(position: { latitude: number; longitude: number; accuracy: number } | null, target: Stop): number | undefined {
  if (!position || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude) || !Number.isFinite(position.accuracy)
    || position.accuracy > 60 || target.lat === undefined || target.lng === undefined) return undefined;
  return haversineKm(position.latitude, position.longitude, target.lat, target.lng) * 1000;
}
