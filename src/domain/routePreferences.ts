import intervals from '../data/corridorSegments.json';
import type { Route, Segment } from '../engine/UpgradedScoringEngine';
export const corridorChoices = {
  harbour: [['cht', '紅磡海底隧道', 'Cross-Harbour Tunnel'], ['ehc', '東區海底隧道', 'Eastern Harbour Crossing'], ['whc', '西區海底隧道', 'Western Harbour Crossing']],
  shatin: [['lion', '獅子山隧道', 'Lion Rock Tunnel'], ['tate', '大老山隧道', "Tate’s Cairn Tunnel"], ['shingmun', '城門隧道', 'Shing Mun Tunnels'], ['tsingsha', '青沙公路', 'Tsing Sha Highway']],
  airport: [['lantau', '青嶼幹線', 'Lantau Link'], ['tmclk', '屯門赤鱲角隧道', 'Tuen Mun–Chek Lap Kok Tunnel']],
} as const;
export type RoutePreferences = { harbour: string; shatin: string; airport: string };
export const DEFAULT_PREFERENCES: RoutePreferences = { harbour: '', shatin: '', airport: '' };
const byPattern = new Map<string, [number, string][]>();
for (const [pattern, segment, corridor] of intervals as [string, number, string][]) byPattern.set(pattern, [...(byPattern.get(pattern) ?? []), [segment, corridor]]);
export function legCorridors(leg: Segment): string[] {
  if (!leg.networkPatternId || leg.boardingIndex === undefined || leg.alightingIndex === undefined) return [];
  return Array.from(new Set((byPattern.get(leg.networkPatternId) ?? []).filter(([segment]) => segment >= leg.boardingIndex! && segment < leg.alightingIndex!).map(([, id]) => id)));
}
export function routeCorridors(route: Route): string[] { return Array.from(new Set((route.legs ?? route.segments ?? []).flatMap(legCorridors))); }
export function preferencePenalty(route: Route, preferences: RoutePreferences): number {
  const ids = routeCorridors(route);
  return (Object.keys(corridorChoices) as (keyof RoutePreferences)[]).reduce((sum, group) => {
    const choice = preferences[group], family = corridorChoices[group].map(row => row[0] as string);
    return sum + (choice && ids.some(id => family.includes(id)) && !ids.includes(choice) ? 15 : 0);
  }, 0);
}
export function parseRoutePreferences(value: string | null): RoutePreferences {
  if (!value) return { ...DEFAULT_PREFERENCES };
  const raw: unknown = JSON.parse(value);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid route preferences.');
  const result = { ...DEFAULT_PREFERENCES };
  for (const [key, value] of Object.entries(raw)) {
    if (!Object.hasOwn(corridorChoices, key) || typeof value !== 'string'
      || value && !corridorChoices[key as keyof RoutePreferences].some(row => row[0] === value)) throw new Error('Invalid road corridor preference.');
    result[key as keyof RoutePreferences] = value;
  }
  return result;
}
