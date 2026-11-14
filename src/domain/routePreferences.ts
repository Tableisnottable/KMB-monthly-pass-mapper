import intervals from '../data/corridorSegments.json';
import type { Route, Segment } from '../engine/UpgradedScoringEngine';
export const corridorChoices = {
  harbour: [['cht', '紅磡海底隧道', 'Cross-Harbour Tunnel'], ['ehc', '東區海底隧道', 'Eastern Harbour Crossing'], ['whc', '西區海底隧道', 'Western Harbour Crossing']],
  shatin: [['lion', '獅子山隧道', 'Lion Rock Tunnel'], ['tate', '大老山隧道', "Tate’s Cairn Tunnel"], ['shingmun', '城門隧道', 'Shing Mun Tunnels'], ['tsingsha', '青沙公路', 'Tsing Sha Highway'], ['eaglesnest', '鷹巢山隧道', "Eagle's Nest Tunnel"], ['shatinheights', '沙田嶺隧道', 'Sha Tin Heights Tunnel'], ['taiwai', '大圍隧道', 'Tai Wai Tunnel']],
  airport: [['lantau', '青嶼幹線', 'Lantau Link'], ['tmclk', '屯門赤鱲角隧道', 'Tuen Mun–Chek Lap Kok Tunnel'], ['northlantau', '北大嶼山公路', 'North Lantau Highway'], ['cheungtsing', '長青隧道', 'Cheung Tsing Tunnel'], ['airporttunnel', '南灣', 'Nam Wan']],
  northwest: [['tailam', '大欖隧道', 'Tai Lam Tunnel'], ['tuenmun', '屯門公路', 'Tuen Mun Road'], ['twisk', '荃錦公路', 'Route Twisk']],
  tko: [['tko', '將軍澳隧道', 'Tseung Kwan O Tunnel'], ['tkolam', '將軍澳－藍田隧道', 'Tseung Kwan O–Lam Tin Tunnel']],
  south: [['aberdeen', '香港仔隧道', 'Aberdeen Tunnel'], ['gap', '黃泥涌峽道', 'Wong Nai Chung Gap Road'], ['pokfulam', '薄扶林道', 'Pok Fu Lam Road'], ['iec', '東區走廊', 'Island Eastern Corridor']],
  kowloon: [['lungcheung', '龍翔道', 'Lung Cheung Road'], ['chingcheung', '呈祥道', 'Ching Cheung Road'], ['kwuntong', '觀塘繞道', 'Kwun Tong Bypass'], ['kaitak', '啟德隧道', 'Kai Tak Tunnel'], ['taiporoad', '大埔道', 'Tai Po Road']],
  northeast: [['tolo', '吐露港公路', 'Tolo Highway'], ['fanling', '粉嶺公路', 'Fanling Highway']],
  saikung: [['clearwater', '清水灣道', 'Clear Water Bay Road']],
  lantau: [['tungchung', '東涌道', 'Tung Chung Road']],
} as const;
export type CorridorGroup = keyof typeof corridorChoices;
export type RoadLevel = 'normal' | 'prefer' | 'must' | 'ban';
// Keep the original single-choice fields for saved links and older API clients.
export type RoutePreferences = { harbour: string; shatin: string; airport: string; roads?: Record<string, RoadLevel> };
export const DEFAULT_PREFERENCES: RoutePreferences = { harbour: '', shatin: '', airport: '' };
export const corridorIds = Object.values(corridorChoices).flat().map(row => row[0] as string);
export function roadLevel(preferences: RoutePreferences, id: string): RoadLevel {
  return preferences.roads?.[id] ?? ([preferences.harbour, preferences.shatin, preferences.airport].includes(id) ? 'prefer' : 'normal');
}
export function preferredRoads(preferences: RoutePreferences) { return corridorIds.filter(id => roadLevel(preferences, id) === 'must'); }
const byPattern = new Map<string, [number, string][]>();
for (const [pattern, segment, corridor] of intervals as [string, number, string][]) byPattern.set(pattern, [...(byPattern.get(pattern) ?? []), [segment, corridor]]);
export function legCorridors(leg: Segment): string[] {
  if (!leg.networkPatternId || leg.boardingIndex === undefined || leg.alightingIndex === undefined) return [];
  return Array.from(new Set((byPattern.get(leg.networkPatternId) ?? []).filter(([segment]) => segment >= leg.boardingIndex! && segment < leg.alightingIndex!).map(([, id]) => id)));
}
export function corridorLegAllowed(pattern: string, start: number, end: number, preferences: RoutePreferences): boolean {
  return !(byPattern.get(pattern) ?? []).some(([segment, id]) => segment >= start && segment < end && roadLevel(preferences, id) === 'ban');
}
export function routeRoadsAllowed(route: Route, preferences: RoutePreferences): boolean {
  const ids = routeCorridors(route);
  if (ids.some(id => roadLevel(preferences, id) === 'ban')) return false;
  return (Object.keys(corridorChoices) as CorridorGroup[]).every(group => {
    const required = corridorChoices[group].map(row => row[0] as string)
      .filter(id => roadLevel(preferences, id) === 'must');
    return required.length === 0 || required.some(id => ids.includes(id));
  });
}
export function routeCorridors(route: Route): string[] { return Array.from(new Set((route.legs ?? route.segments ?? []).flatMap(legCorridors))); }
export function preferencePenalty(route: Route, preferences: RoutePreferences): number {
  const ids = routeCorridors(route);
  return (Object.keys(corridorChoices) as CorridorGroup[]).reduce((sum, group) => {
    const family = corridorChoices[group].map(row => row[0] as string), preferred = family.filter(id => roadLevel(preferences, id) === 'prefer');
    return sum + (preferred.length && ids.some(id => family.includes(id)) && !preferred.some(id => ids.includes(id)) ? 15 : 0);
  }, 0);
}
export function parseRoutePreferences(value: string | null): RoutePreferences {
  if (!value) return { ...DEFAULT_PREFERENCES };
  const raw: unknown = JSON.parse(value);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid route preferences.');
  const result = { ...DEFAULT_PREFERENCES };
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'roads') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid road preferences.');
      result.roads = {};
      for (const [id, level] of Object.entries(value)) {
        if (!corridorIds.includes(id) || !['normal', 'must', 'prefer', 'ban'].includes(level as string)) throw new Error('Invalid road corridor preference.');
        result.roads[id] = level as RoadLevel;
      }
    } else {
      if (!['harbour', 'shatin', 'airport'].includes(key) || typeof value !== 'string'
        || value && !corridorChoices[key as 'harbour'].some(row => row[0] === value)) throw new Error('Invalid road corridor preference.');
      result[key as 'harbour'] = value;
    }
  }
  return result;
}
