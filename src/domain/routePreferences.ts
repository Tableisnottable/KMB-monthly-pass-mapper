import intervals from '../data/corridorSegments.json';
import type { Route, Segment } from '../engine/UpgradedScoringEngine';
export const corridorChoices = {
  strategic: [['route1', '1 號幹線', 'Route 1'], ['route2', '2 號幹線', 'Route 2'], ['route3', '3 號幹線', 'Route 3'], ['route4', '4 號幹線', 'Route 4'], ['route5', '5 號幹線', 'Route 5'], ['route6', '6 號幹線', 'Route 6'], ['route7', '7 號幹線', 'Route 7'], ['route8', '8 號幹線', 'Route 8'], ['route9', '9 號幹線', 'Route 9'], ['route10', '10 號幹線', 'Route 10']],
  harbour: [['cht', '紅磡海底隧道', 'Cross-Harbour Tunnel'], ['ehc', '東區海底隧道', 'Eastern Harbour Crossing'], ['whc', '西區海底隧道', 'Western Harbour Crossing']],
  shatin: [['lion', '獅子山隧道', 'Lion Rock Tunnel'], ['tate', '大老山隧道', "Tate’s Cairn Tunnel"], ['shingmun', '城門隧道', 'Shing Mun Tunnels'], ['tsingsha', '青沙公路', 'Tsing Sha Highway'], ['eaglesnest', '香港尖山隧道', "Eagle's Nest Tunnel"], ['shatinheights', '沙田嶺隧道', 'Sha Tin Heights Tunnel'], ['taiwai', '大圍隧道', 'Tai Wai Tunnel']],
  airport: [['lantau', '青嶼幹線', 'Lantau Link'], ['tmclk', '屯門赤鱲角隧道', 'Tuen Mun–Chek Lap Kok Tunnel'], ['northlantau', '北大嶼山公路', 'North Lantau Highway'], ['tsingkau', '汀九橋', 'Ting Kau Bridge'], ['cheungtsing', '長青隧道', 'Cheung Tsing Tunnel'], ['airporttunnel', '南灣隧道', 'Nam Wan Tunnel']],
  northwest: [['tailam', '大欖隧道', 'Tai Lam Tunnel'], ['tuenmun', '屯門公路', 'Tuen Mun Road'], ['twisk', '荃錦公路', 'Route Twisk']],
  tko: [['tko', '將軍澳隧道', 'Tseung Kwan O Tunnel'], ['tkolam', '將軍澳－藍田隧道', 'Tseung Kwan O–Lam Tin Tunnel']],
  south: [['aberdeen', '香港仔隧道', 'Aberdeen Tunnel'], ['gap', '黃泥涌峽道', 'Wong Nai Chung Gap Road'], ['pokfulam', '薄扶林道', 'Pok Fu Lam Road'], ['iec', '東區走廊', 'Island Eastern Corridor']],
  kowloon: [['lungcheung', '龍翔道', 'Lung Cheung Road'], ['chingcheung', '呈祥道', 'Ching Cheung Road'], ['kwuntong', '觀塘繞道', 'Kwun Tong Bypass'], ['kaitak', '啟德隧道', 'Kai Tak Tunnel'], ['taiporoad', '大埔道', 'Tai Po Road']],
  northeast: [['tolo', '吐露港公路', 'Tolo Highway'], ['fanling', '粉嶺公路', 'Fanling Highway']],
  saikung: [['clearwater', '清水灣道', 'Clear Water Bay Road']],
  lantau: [['tungchung', '東涌道', 'Tung Chung Road']],
} as const;
export type CorridorGroup = keyof typeof corridorChoices;
export const visibleCorridorGroups = Object.keys(corridorChoices) as CorridorGroup[];
export const strategicRouteDetails = [
  { id: 'route1', color: '#e5322b', ends: ['香港仔至沙田', 'Aberdeen to Sha Tin'], path: ['香港仔', '黃竹坑', '香港仔隧道', '紅磡海底隧道', '九龍塘', '獅子山隧道', '沙田'], pathEn: ['Aberdeen', 'Wong Chuk Hang', 'Aberdeen Tunnel', 'Cross-Harbour Tunnel', 'Kowloon Tong', 'Lion Rock Tunnel', 'Sha Tin'] },
  { id: 'route2', color: '#378bce', ends: ['鰂魚涌至馬料水', 'Quarry Bay to Ma Liu Shui'], path: ['鰂魚涌', '東區海底隧道', '觀塘', '大老山隧道', '馬料水'], pathEn: ['Quarry Bay', 'Eastern Harbour Crossing', 'Kwun Tong', 'Tate’s Cairn Tunnel', 'Ma Liu Shui'] },
  { id: 'route3', color: '#208672', ends: ['西營盤至元朗', 'Sai Ying Pun to Yuen Long'], path: ['西營盤', '西區海底隧道', '青衣', '青衣大橋', '大欖隧道', '八鄉', '元朗'], pathEn: ['Sai Ying Pun', 'Western Harbour Crossing', 'Tsing Yi', 'Tsing Yi Bridge', 'Tai Lam Tunnel', 'Pat Heung', 'Yuen Long'] },
  { id: 'route4', color: '#2765b1', ends: ['柴灣至堅尼地城', 'Chai Wan to Kennedy Town'], path: ['柴灣', '銅鑼灣', '灣仔', '中環', '上環', '西營盤', '堅尼地城'], pathEn: ['Chai Wan', 'Causeway Bay', 'Wan Chai', 'Central', 'Sheung Wan', 'Sai Ying Pun', 'Kennedy Town'] },
  { id: 'route5', color: '#d47d9d', ends: ['牛頭角至荃灣', 'Ngau Tau Kok to Tsuen Wan'], path: ['牛頭角', '九龍灣', '啟德隧道', '紅磡', '油麻地', '荔枝角', '葵涌', '荃灣'], pathEn: ['Ngau Tau Kok', 'Kowloon Bay', 'Kai Tak Tunnel', 'Hung Hom', 'Yau Ma Tei', 'Lai Chi Kok', 'Kwai Chung', 'Tsuen Wan'] },
  { id: 'route6', color: '#949b14', ends: ['將軍澳至西九龍', 'Tseung Kwan O to West Kowloon'], path: ['將軍澳', '將軍澳隧道', '藍田隧道', '茶果嶺', '九龍灣', '油麻地交匯處'], pathEn: ['Tseung Kwan O', 'Tseung Kwan O Tunnel', 'Lam Tin Tunnel', 'Cha Kwo Ling', 'Kowloon Bay', 'Yau Ma Tei Interchange'] },
  { id: 'route7', color: '#85bd7d', ends: ['將軍澳至葵涌', 'Tseung Kwan O to Kwai Chung'], path: ['將軍澳', '將軍澳隧道', '觀塘', '九龍灣', '黃大仙', '深水埗', '荔枝角', '葵涌'], pathEn: ['Tseung Kwan O', 'Tseung Kwan O Tunnel', 'Kwun Tong', 'Kowloon Bay', 'Wong Tai Sin', 'Sham Shui Po', 'Lai Chi Kok', 'Kwai Chung'] },
  { id: 'route8', color: '#966bb5', ends: ['沙田至赤鱲角', 'Sha Tin to Chek Lap Kok'], path: ['沙田', '大圍', '尖山隧道', '長沙灣', '昂船洲', '青衣', '南灣隧道', '青馬大橋', '東涌', '赤鱲角'], pathEn: ['Sha Tin', 'Tai Wai', 'Eagle’s Nest Tunnel', 'Cheung Sha Wan', 'Stonecutters Island', 'Tsing Yi', 'Nam Wan Tunnel', 'Tsing Ma Bridge', 'Tung Chung', 'Chek Lap Kok'] },
  { id: 'route9', color: '#f59b55', ends: ['新界環迴幹線', 'New Territories Circular Route'], path: ['屯門', '大圍', '沙田', '馬料水', '大埔', '粉嶺', '上水', '落馬洲', '元朗', '洪水橋', '深井', '荃灣'], pathEn: ['Tuen Mun', 'Tai Wai', 'Sha Tin', 'Ma Liu Shui', 'Tai Po', 'Fanling', 'Sheung Shui', 'Lok Ma Chau', 'Yuen Long', 'Hung Shui Kiu', 'Sham Tseng', 'Tsuen Wan'] },
  { id: 'route10', color: '#e56437', ends: ['深圳灣口岸至藍地', 'Shenzhen Bay Port to Lam Tei'], path: ['深圳灣口岸', '天水圍', '元朗公路', '藍地'], pathEn: ['Shenzhen Bay Port', 'Tin Shui Wai', 'Yuen Long Highway', 'Lam Tei'] },
] as const;
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
