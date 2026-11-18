import type { RouteOption, TransitLeg } from '../engine/UpgradedScoringEngine';
import type { LiveDeparture } from '../data/networkTimetable';
import { departureTimingType, isNonOperatingDeparture } from './departureType';

const minute = 60_000;
export function boardingReadyTime(route: RouteOption, index: number, minimumChange: number, now = Date.now()): number {
  const leg = route.legs[index];
  const walk = leg.accessWalkMinutes ?? (index === 0 ? route.originWalkMinutes ?? 0 : 3);
  const previous = index === 0 ? Date.parse(route.departureTime ?? '') : Date.parse(route.legs[index - 1].arrivalTime ?? '');
  return Math.max(now, Number.isFinite(previous) ? previous : now) + (index === 0 ? walk : Math.max(walk, minimumChange)) * minute;
}
export interface ConnectionDeparture { departure: LiveDeparture; rideMinutes?: number }
export type ConnectionResolver = (leg: TransitLeg, ready: Date) => ConnectionDeparture | undefined;

/** Rebuild the suffix from reachable services, preserving the prefix and waypoint walks. */
export function selectJourneyDeparture(route: RouteOption, index: number, departure: LiveDeparture, key: string,
  resolve: ConnectionResolver, minimumChange = 3, now = Date.now()): RouteOption {
  if (!Number.isInteger(index) || !route.legs[index] || route.legs[index].mode === 'WALK'
    || !Number.isFinite(Date.parse(departure.time)) || isNonOperatingDeparture(departure)) throw new Error('Invalid departure.');
  const ready = boardingReadyTime(route, index, minimumChange, now);
  if (!Number.isFinite(ready) || Date.parse(departure.time) < ready - 1000) throw new Error('This departure cannot be reached.');
  const result = structuredClone(route);
  for (let i = index; i < result.legs.length; i++) {
    const leg = result.legs[i];
    const at = i === index ? ready : boardingReadyTime(result, i, minimumChange, now);
    if (leg.mode === 'WALK') {
      const walkAt = Math.max(now, Date.parse(result.legs[i - 1].arrivalTime!)) + (leg.accessWalkMinutes ?? 0) * minute;
      leg.departureTime = new Date(walkAt).toISOString();
      leg.arrivalTime = new Date(walkAt + leg.journeyTimeMinutes * minute).toISOString();
      continue;
    }
    const connection = i === index ? { departure } : resolve(leg, new Date(at));
    if (!connection || isNonOperatingDeparture(connection.departure) || !Number.isFinite(Date.parse(connection.departure.time))
      || Date.parse(connection.departure.time) < at - 1000) throw new Error('No reachable onward departure.');
    const choice = connection.departure;
    if (choice.operator && !(leg.networkOperator ?? leg.operator).split('+').includes(choice.operator)) throw new Error('Departure operator does not match this leg.');
    if (choice.operator) leg.operator = choice.operator;
    leg.departureTime = choice.time;
    leg.journeyTimeMinutes = connection.rideMinutes ?? leg.journeyTimeMinutes;
    leg.arrivalTime = new Date(Date.parse(choice.time) + leg.journeyTimeMinutes * minute).toISOString();
    const walk = leg.accessWalkMinutes ?? (i === 0 ? result.originWalkMinutes ?? 0 : 3);
    leg.scheduledWaitMinutes = Math.max(0, (Date.parse(choice.time) - at) / minute + (i === 0 ? 0 : Math.max(0, minimumChange - walk)));
    leg.scheduledDepartureMinutes = (Date.parse(choice.time) - Date.parse(result.departureTime!)) / minute;
    leg.serviceStatus = departureTimingType(choice) === 'LIVE' ? 'LIVE' : 'TIMETABLE';
    leg.serviceEnded = false;
    leg.selectedDepartureKey = i === index ? key : undefined;
    const rows = leg.liveDepartures ?? [];
    const occurrence = rows.findIndex(row => row.time === choice.time && row.operator === choice.operator);
    leg.liveDepartures = [choice, ...rows.filter((_, index) => index !== occurrence)];
    leg.realtimeEta = { etaMinutes: Math.max(0, (Date.parse(choice.time) - now) / minute), dataTime: new Date(now).toISOString(),
      isLive: leg.serviceStatus === 'LIVE', source: leg.serviceStatus === 'LIVE' ? 'DATAGOVHK' : 'SCHEDULED' };
  }
  result.arrivalTime = new Date(Date.parse(result.legs.at(-1)!.arrivalTime!) + (result.destinationWalkMinutes ?? 0) * minute).toISOString();
  return result;
}
