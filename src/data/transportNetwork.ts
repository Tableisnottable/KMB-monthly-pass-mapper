import { stops, routes, patterns, fares, rail_fares, full_fares, calendar, exceptions } from './transport/snapshot';
import manifest from './transport/manifest.json';

// Compact on-disk tuples keep every generated file below the GitHub size cap.
export type NetworkStop = [id: string, zh: string, en: string, lat: number, lng: number, code: string, mode: string];
export type NetworkRoute = [id: string, operator: string, number: string, zh: string, en: string, mode: string];
export interface NetworkPattern {
  id: string;
  r: number;
  d: string;
  s: number[];
  t: number[];
  p: number[];
  a: number[];
  /** service, first departure, end (exclusive for frequencies), headway, run time */
  w: number[][];
}
export const networkStops = stops as NetworkStop[];
export const networkRoutes = routes as NetworkRoute[];
export const networkPatterns = patterns as NetworkPattern[];
export const transportCoverage = manifest;

const calendars = new Map((calendar as (number | string)[][]).map(r => [Number(r[0]), r]));
const changes = new Map((exceptions as (number | string)[][]).map(r => [`${r[0]}:${r[1]}`, Number(r[2])]));
const fareRows = new Map((fares as [number, number, [number, number[]][]][]).map(r => [`${r[0]}:${r[1]}`, r[2]]));
const railFares = new Map((rail_fares as number[][]).map(r => [`${r[0]}:${r[1]}`, r[2] / 100]));
const fullFares = new Map((full_fares as number[][]).map(r => [r[0], r[1] / 100]));
const stopIndex = new Map(networkStops.map((s, i) => [s[0], i]));
export function networkStopIndex(id: string) { return stopIndex.get(id); }

export function normalAdultFare(routeIndex: number, from: number, to: number) {
  const mode = networkRoutes[routeIndex][5];
  const exact = mode === 'SUBWAY' || mode === 'LIGHT_RAIL' ? railFare(from, to) : publishedFare(routeIndex, from, to);
  const full = exact === undefined ? fullFares.get(routeIndex) : undefined;
  return { fare: exact ?? full ?? 0,
    fareStatus: exact !== undefined ? 'PUBLISHED' as const : full !== undefined ? 'FULL_FARE' as const : 'UNAVAILABLE' as const,
    fareBasis: mode === 'SUBWAY' || mode === 'LIGHT_RAIL' ? 'Adult Octopus' : 'Normal adult' };
}

/** Date arithmetic is explicitly Hong Kong time, independent of server TZ. */
export function hongKongClock(date: Date) {
  const local = new Date(date.getTime() + 8 * 3600_000);
  return { day: local.toISOString().slice(0, 10).replace(/-/g, ''),
    weekday: (local.getUTCDay() + 6) % 7,
    minute: local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60 };
}

/** Supply HK wall-clock hours to the local-time weighting engine. */
export function weightingDate(date: Date): Date {
  const hk = new Date(date.getTime() + 8 * 3600000);
  return new Date(hk.getUTCFullYear(), hk.getUTCMonth(), hk.getUTCDate(), hk.getUTCHours(), hk.getUTCMinutes(), hk.getUTCSeconds());
}

export function isServiceActive(id: number, date: Date): boolean {
  const { day, weekday } = hongKongClock(date);
  const exception = changes.get(`${id}:${day}`);
  if (exception !== undefined) return exception === 1;
  const row = calendars.get(id);
  return !!row && String(row[2]) <= day && String(row[3]) >= day && String(row[1])[weekday] === '1';
}

export function serviceCalendarStatus(id: number, date: Date) {
  const { day } = hongKongClock(date), row = calendars.get(id), exception = changes.get(`${id}:${day}`);
  return { covered: exception !== undefined || !!row && String(row[2]) <= day && day <= String(row[3]),
    active: isServiceActive(id, date), added: exception === 1 };
}

export function publishedFare(routeIndex: number, from: number, to: number): number | undefined {
  const row = fareRows.get(`${routeIndex}:${from}`);
  // A pair can have different fares on special variants: return the highest
  // published value and label it an estimate instead of underquoting it.
  const values = row?.filter(([, destinations]) => destinations.includes(to)).map(([cents]) => cents / 100);
  return values?.length ? Math.max(...values) : undefined;
}

export function railFare(from: number, to: number): number | undefined {
  return railFares.get(`${from}:${to}`);
}

export function networkStop(index: number, locale: 'zh' | 'en' = 'zh') {
  const s = networkStops[index];
  return { id: s[0], name: s[locale === 'en' ? 2 : 1] || s[2], lat: s[3], lng: s[4] };
}
