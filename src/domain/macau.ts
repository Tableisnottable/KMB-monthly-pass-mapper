import type { ScoredRoute } from '../engine/UpgradedScoringEngine';

export type MacauOperator = 'MO_TRANSMAC' | 'MO_TCM' | 'MO_LRT';
export type MacauPayment = 'cash' | 'macau-pass' | 'student';
export type MacauStop = [code: string, zh: string, en: string, lat: number, lng: number, suspended: boolean];
export type MacauPoint = [lat: number, lng: number];
export interface MacauPattern {
  id: string; number: string; operator: MacauOperator; mode: 'BUS' | 'LIGHT_RAIL'; direction: string;
  stops: MacauStop[]; paths: MacauPoint[][]; scheduleVerified: boolean;
  routeCode?: string; nameTc?: string; nameEn?: string; headwayRange?: number[];
}
export interface MacauJourney extends ScoredRoute {
  currency: 'MOP'; selectedFare: number | null; unverifiedBus: boolean;
}
export const macauOperators = [
  { id: 'MO_TRANSMAC', nameTc: '新福利', nameEn: 'Transmac', colour: '#1563aa' },
  { id: 'MO_TCM', nameTc: '澳巴', nameEn: 'TCM', colour: '#ed7e22' },
  { id: 'MO_LRT', nameTc: '澳門輕軌', nameEn: 'Macao LRT', colour: '#008ed0' },
] as const;
export function inMacau(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 22.09 && lat <= 22.24 && lng >= 113.51 && lng <= 113.62;
}
export function macauColour(pattern: Pick<MacauPattern, 'operator' | 'number'>) {
  if (pattern.operator === 'MO_LRT') return ({ TAIPA: '#65a000', SPV: '#8a66c3', HENGQIN: '#bd273a' } as Record<string, string>)[pattern.number] ?? '#008ed0';
  return macauOperators.find(row => row.id === pattern.operator)?.colour ?? '#596b75';
}
/** Official source pages stay current without shipping poster images in Git. */
export function macauTimetableUrl(pattern: Pick<MacauPattern, 'mode' | 'number'>) {
  return pattern.mode === 'BUS'
    ? 'https://www.dsat.gov.mo/dsat/route_display.aspx?route=busroute_' + encodeURIComponent(pattern.number)
    : 'https://www.mlm.com.mo/en/route.html';
}
export const macauTime = (time: string) => new Date(time).toLocaleTimeString('en-GB', { timeZone: 'Asia/Macau', hour: '2-digit', minute: '2-digit' });
export const macauMoney = (value: number | null) => value === null ? '—' : 'MOP$' + value.toFixed(2);
