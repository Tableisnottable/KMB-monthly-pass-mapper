import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';

export type PlannerLocale = 'zh' | 'en';
export type JourneyField = 'origin' | 'destination';
export type JourneyLocations = Record<JourneyField, import('./PlaceAutocomplete').PlaceResult | null>;
export const copy = (locale: PlannerLocale, zh: string, en: string) => locale === 'en' ? en : zh;

export function journeyMinutes(route: ScoredRoute): number {
  if (route.departureTime && route.arrivalTime) return Math.max(0, Math.ceil((new Date(route.arrivalTime).getTime() - new Date(route.departureTime).getTime()) / 60000));
  const ride = route.legs.reduce((sum, leg) => sum + (leg.journeyTimeMinutes ?? 0), 0);
  const wait = route.legs.reduce((sum, leg) => {
    if (leg.mode === 'WALK' || leg.serviceEnded) return sum;
    return sum + (leg.realtimeEta?.isLive
      ? Math.max(0, leg.realtimeEta.etaMinutes - (leg.accessWalkMinutes ?? 0))
      : leg.scheduledWaitMinutes ?? (leg.scheduledIntervalMinutes ?? 12) / 2);
  }, 0);
  return Math.ceil(ride + wait + route.walkTransferTimeMinutes);
}

export function hasEndedService(route: ScoredRoute): boolean {
  return route.legs.some(leg => leg.serviceEnded);
}

export function routeColor(operator: string): string {
  return ({ KMB: '#e62232', CTB: '#14933f', LWB: '#ef8528', MTR: '#ae1734', LRT: '#bf7c22', GMB: '#21835b',
    FERRY: '#187fbb', TRAM: '#19867a', PTRAM: '#8d3069', NLB: '#317dc1', LRTFeeder: '#ae1734', WALK: '#9b9b9b' } as Record<string, string>)[operator] ?? '#656565';
}

export function modeIcon(mode?: string): string {
  return ({ WALK: 'walk', SUBWAY: 'train', LIGHT_RAIL: 'tram', TRAM: 'tram', FERRY: 'ferry',
    CABLE_CAR: 'tram', MINIBUS: 'minibus' } as Record<string, string>)[mode ?? ''] ?? 'bus';
}

export function modeLabel(mode: string | undefined, locale: PlannerLocale): string {
  const names: Record<string, [string, string]> = { FERRY: ['渡輪', 'Ferry'], TRAM: ['電車', 'Tram'],
    CABLE_CAR: ['山頂纜車', 'Peak Tram'], SUBWAY: ['港鐵', 'MTR'], LIGHT_RAIL: ['輕鐵', 'Light Rail'], MINIBUS: ['小巴', 'Minibus'] };
  return names[mode ?? 'BUS']?.[locale === 'en' ? 1 : 0] ?? mode ?? 'Bus';
}

export function fareLabel(route: ScoredRoute, locale: PlannerLocale): string {
  if (route.legs.some(l => l.fareStatus === 'UNAVAILABLE')) return copy(locale, '票價待查', 'Fare unavailable');
  const prefix = route.legs.some(l => l.fareStatus === 'FULL_FARE') ? copy(locale, '最多 ', 'Up to ') : '';
  return route.discountedFare > 0 ? prefix + '$' + route.discountedFare.toFixed(2) : copy(locale, '免費', 'Free');
}
