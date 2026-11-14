import type { TravelMode } from './travelOptions';

export type TransportLevel = 'must' | 'normal' | 'ban';
export const transitTypes = [
  { id: 'BUS', nameTc: '巴士（包括居民及過境巴士）', nameEn: 'Bus (including residents’ and cross-boundary buses)' },
  { id: 'MINIBUS', nameTc: '綠色專線小巴', nameEn: 'Green minibus' },
  { id: 'SUBWAY', nameTc: '港鐵（包括機場快綫）', nameEn: 'MTR (including Airport Express)' },
  { id: 'LIGHT_RAIL', nameTc: '輕鐵', nameEn: 'Light Rail' },
  { id: 'TRAM', nameTc: '電車', nameEn: 'Tram' },
  { id: 'FERRY', nameTc: '渡輪', nameEn: 'Ferry' },
  { id: 'CABLE_CAR', nameTc: '山頂纜車', nameEn: 'Peak Tram' },
] as const;
export type TransitType = typeof transitTypes[number]['id'];
export type TransportPreferences = Record<TransitType, TransportLevel>;
export const defaultTransport = (): TransportPreferences => Object.fromEntries(transitTypes.map(type => [type.id, 'normal'])) as TransportPreferences;
export const comparisonTypes: { id: TravelMode; nameTc: string; nameEn: string }[] = [
  { id: 'walk', nameTc: '全程步行', nameEn: 'Walk all the way' },
  { id: 'cycle', nameTc: '單車', nameEn: 'Cycle' },
  { id: 'taxi', nameTc: '的士', nameEn: 'Taxi' },
  { id: 'drive', nameTc: '自行駕駛', nameEn: 'Driving' },
];
export type ComparisonPreferences = Record<TravelMode, boolean>;
export const defaultComparisons = (): ComparisonPreferences => ({ walk: true, cycle: true, taxi: true, drive: true });

function parseSelection<T extends string>(value: string | null, choices: readonly T[]): T[] | undefined {
  if (value === null) return undefined;
  const ids = Array.from(new Set(value.split(',').filter(Boolean)));
  if (ids.some(id => !choices.includes(id as T))) throw new Error('Unknown transport type.');
  return ids as T[];
}
export const parseTransitSelection = (value: string | null) => parseSelection(value, transitTypes.map(type => type.id));
export const parseComparisonSelection = (value: string | null) => parseSelection(value, comparisonTypes.map(type => type.id));
export const transitTypeAllowed = (mode: string, selected?: readonly string[]) => selected === undefined || selected.includes(mode);

export const DEFAULT_CHANGE_MINUTES = 3;
export const changeMinuteChoices = Array.from({ length: 61 }, (_, minute) => minute);
export function parseChangeMinutes(value: string | null): number {
  const minutes = value === null ? DEFAULT_CHANGE_MINUTES : Number(value);
  if ((value !== null && !value.trim()) || !Number.isInteger(minutes) || minutes < 0 || minutes > 60) {
    throw new Error('Choose a minimum change time between 0 and 60 whole minutes.');
  }
  return minutes;
}
