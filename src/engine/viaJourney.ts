import type { Route, Stop } from './UpgradedScoringEngine';

/** Join two independently timed stages without losing the walk out to the waypoint. */
export function joinViaJourney(before: Route, after: Route, via: Stop): Route | undefined {
  const a = before.legs ?? [], b = after.legs ?? [];
  if (!a.length || !b.length || !before.departureTime || !before.arrivalTime || !after.departureTime || !after.arrivalTime) return;
  const gap = (Date.parse(after.departureTime) - Date.parse(before.arrivalTime)) / 60_000;
  if (!Number.isFinite(gap) || gap < -.001) return;
  const legs = [...a, ...b].map((leg, index) => ({ ...leg, id: `via-${index}-${leg.id ?? ''}` }));
  const firstOnward = legs[a.length];
  // Both stages include their own endpoint walks. Charge them once, and make
  // the waypoint connection visible to change/wait limits as one transfer.
  firstOnward.accessWalkMinutes = (before.destinationWalkMinutes ?? 0) + (firstOnward.accessWalkMinutes ?? after.originWalkMinutes ?? 0);
  firstOnward.scheduledWaitMinutes = (firstOnward.scheduledWaitMinutes ?? 0) + Math.max(0, gap);
  return {
    id: `via:${before.id}:${after.id}`, legs, via, viaLegIndex: a.length,
    originWalkMinutes: before.originWalkMinutes ?? 0, destinationWalkMinutes: after.destinationWalkMinutes ?? 0,
    walkTransferTimeMinutes: (before.walkTransferTimeMinutes ?? 0) + (after.walkTransferTimeMinutes ?? 0),
    transferCount: Math.max(0, legs.filter(leg => leg.mode !== 'WALK').length - 1),
    departureTime: before.departureTime, arrivalTime: after.arrivalTime, timeMode: before.timeMode,
  };
}
