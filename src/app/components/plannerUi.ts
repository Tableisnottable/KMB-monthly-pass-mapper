import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';

export type PlannerLocale = 'zh' | 'en';
export const copy = (locale: PlannerLocale, zh: string, en: string) => locale === 'en' ? en : zh;

export function journeyMinutes(route: ScoredRoute): number {
  const ride = route.legs.reduce((sum, leg) => sum + (leg.journeyTimeMinutes ?? 0), 0);
  const wait = route.legs.reduce((sum, leg) => {
    if (leg.mode === 'WALK' || leg.serviceEnded) return sum;
    return sum + (leg.realtimeEta?.isLive
      ? Math.max(0, leg.realtimeEta.etaMinutes)
      : (leg.scheduledIntervalMinutes ?? 12) / 2);
  }, 0);
  return Math.ceil(ride + wait + route.walkTransferTimeMinutes);
}

export function hasEndedService(route: ScoredRoute): boolean {
  return route.legs.some(leg => leg.serviceEnded);
}

export function routeColor(operator: string): string {
  return ({ KMB: '#4265ce', CTB: '#b47118', LWB: '#bc582e', MTR: '#a94471', WALK: '#72827d' } as Record<string, string>)[operator] ?? '#536a78';
}
