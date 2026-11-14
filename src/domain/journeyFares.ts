import type { ScoredRoute, Segment } from '../engine/UpgradedScoringEngine';
import snapshot from '../data/studentFares.json';
import { getMonthlyPassInsight } from './monthlyPass';

export type FareProfile = 'adult' | 'pass' | 'student' | 'unverified';
export type FareEstimate = { minimum: number; maximum: number; available: boolean; upperBound: boolean; adultFallback: boolean };
const rail = new Map((snapshot.rail as [string, string, number][]).map(([a, b, cents]) => [a + '>' + b, cents / 100]));
// The route feed can publish multiple fare rows without stop-to-stop keys.
// Keep the highest verified student fare as an upper bound for such routes.
const buses = new Map<string, number>();
const variedBusFares = new Set<string>();
for (const [number, cents] of snapshot.buses as [string, number][]) {
  const fare = cents / 100, prior = buses.get(number);
  if (prior !== undefined && prior !== fare) variedBusFares.add(number);
  buses.set(number, Math.max(prior ?? 0, fare));
}
export const STUDENT_FARE_SOURCE = 'https://www.mtr.com.hk/en/customer/tickets/student_travel_scheme.html';
export const STUDENT_FARES_IMPORTED_ON = snapshot.importedOn;
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const adult = (leg: Segment): FareEstimate => ({ minimum: leg.fare ?? 0, maximum: leg.fare ?? 0,
  available: leg.fareStatus !== 'UNAVAILABLE' && leg.fare !== undefined && Number.isFinite(leg.fare) && leg.fare >= 0,
  upperBound: leg.fareStatus === 'FULL_FARE', adultFallback: false });

/** One published OD fare per connected paid-area rail journey, including line changes. */
export function studentLegFares(route: Pick<ScoredRoute, 'legs'>): FareEstimate[] {
  const result = route.legs.map(adult);
  for (let i = 0; i < route.legs.length; i++) {
    const first = route.legs[i];
    if (first.mode === 'WALK') { result[i] = { ...result[i], minimum: 0, maximum: 0, available: true }; continue; }
    if (['SUBWAY', 'LIGHT_RAIL'].includes(first.mode) && first.routeNumber !== 'AEL') {
      let end = i;
      while (end + 1 < route.legs.length && route.legs[end + 1].mode === first.mode
        && route.legs[end + 1].routeNumber !== 'AEL'
        && route.legs[end].destinationStop.id === route.legs[end + 1].originStop.id
        && route.legs[end + 1].fareBasis === 'Included in preceding adult rail fare') end++;
      const value = rail.get(first.originStop.id + '>' + route.legs[end].destinationStop.id);
      result[i] = { minimum: value ?? 0, maximum: value ?? 0, available: value !== undefined, upperBound: false, adultFallback: false };
      for (let j = i + 1; j <= end; j++) result[j] = { minimum: 0, maximum: 0, available: value !== undefined, upperBound: false, adultFallback: false };
      i = end;
    } else if ((first.networkOperator ?? first.operator) === 'LRTFeeder') {
      const value = buses.get(first.routeNumber);
      if (value !== undefined && result[i].available) result[i] = { ...result[i], minimum: Math.min(value, first.fare), maximum: Math.min(value, first.fare), upperBound: result[i].upperBound || variedBusFares.has(first.routeNumber) };
      else result[i] = { ...result[i], available: false };
    } else {
      // Airport Express has no Student Travel Scheme discount. Other operators'
      // route-specific student promotions are not assumed from an adult-only feed.
      result[i].adultFallback = first.routeNumber !== 'AEL';
    }
  }
  return result;
}

export function journeyFare(route: ScoredRoute, profile: FareProfile): FareEstimate {
  if (profile === 'unverified') return { minimum: 0, maximum: 0, available: false, upperBound: false, adultFallback: false };
  if (profile === 'pass') {
    const fare = getMonthlyPassInsight(route);
    return { minimum: fare.passFareMin, maximum: fare.passFareMax, available: fare.available,
      upperBound: fare.passFareMax > 0 && route.legs.some(leg => leg.fareStatus === 'FULL_FARE'), adultFallback: false };
  }
  if (profile === 'adult') return { minimum: route.discountedFare, maximum: route.discountedFare,
    available: route.legs.every(leg => adult(leg).available), upperBound: route.legs.some(leg => leg.fareStatus === 'FULL_FARE'), adultFallback: false };
  const fares = studentLegFares(route);
  const amount = round(fares.reduce((sum, fare) => sum + fare.maximum, 0));
  return { minimum: amount, maximum: amount, available: fares.every(fare => fare.available),
    upperBound: fares.some(fare => fare.upperBound), adultFallback: fares.some(fare => fare.adultFallback) };
}

/** Unknown fares sort last; conditional fares use the maximum payable total. */
export function fareSortValue(route: ScoredRoute, profile: FareProfile): number {
  const fare = journeyFare(route, profile);
  return fare.available ? fare.maximum : Infinity;
}
