export type MapPoint = [number, number];
export type MapBounds = [number, number, number, number]; // south, west, north, east
export type OpenMapElement = { type: string; id: number; lat?: number; lon?: number; nodes?: number[];
  tags?: Record<string, string>; members?: { type: string; ref: number; role?: string }[] };
export type OpenMapLine = { id: string; name: string; en: string; ref: string; kind: string; operator?: string; paths: MapPoint[][] };
export type OpenMapStop = { id: string; name: string; en: string; kind: string; point: MapPoint };
export type OpenMapArea = { roads: OpenMapLine[]; routes: OpenMapLine[]; stops: OpenMapStop[]; bounds: MapBounds; fetchedAt: string; sourceUrl: string; source: string; license: string };
export function localMapBounds(lat: number, lon: number): MapBounds {
  // A deliberately small map extract, not a country-wide bulk download.
  const halfLat = .003, halfLon = Math.min(.012, halfLat / Math.max(.25, Math.cos(lat * Math.PI / 180)));
  return [Math.max(-90, lat - halfLat), Math.max(-180, lon - halfLon), Math.min(90, lat + halfLat), Math.min(180, lon + halfLon)].map(n => Number(n.toFixed(5))) as MapBounds;
}
export function parseOpenMap(elements: OpenMapElement[], bounds: MapBounds, sourceUrl: string, fetchedAt = new Date().toISOString()): OpenMapArea {
  const [south, west, north, east] = bounds;
  const inside = (p: MapPoint) => p[0] >= south && p[0] <= north && p[1] >= west && p[1] <= east;
  const nodes = new Map(elements.filter(e => e.type === 'node' && Number.isFinite(e.lat) && Number.isFinite(e.lon)).map(e => [e.id, e]));
  const ways = new Map<string, MapPoint[][]>();
  for (const way of elements.filter(e => e.type === 'way')) {
    const paths: MapPoint[][] = []; let path: MapPoint[] = [];
    const flush = () => { if (path.length > 1) paths.push(path); path = []; };
    for (const id of way.nodes ?? []) {
      const node = nodes.get(id), p: MapPoint | undefined = node && [node.lat!, node.lon!];
      if (!p || !inside(p)) { flush(); continue; }
      path.push(p);
    }
    flush(); ways.set(String(way.id), paths);
  }
  const roads: OpenMapLine[] = [], routes: OpenMapLine[] = [], stops: OpenMapStop[] = [];
  for (const e of elements) {
    const t = e.tags ?? {}, name = t['name:zh-Hant'] ?? t['name:zh'] ?? t.name ?? t.ref ?? '', en = t['name:en'] ?? name;
    const motorRoad = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street)(?:_link)?$/.test(t.highway ?? '');
    const structure = t.bridge && t.bridge !== 'no' || t.tunnel && t.tunnel !== 'no';
    if (e.type === 'way' && motorRoad && (t.name || t.ref) && t.indoor !== 'yes' && t.access !== 'private' && t.service !== 'parking_aisle'
      && (/^(motorway|trunk|primary|secondary|tertiary)(?:_link)?$/.test(t.highway) || structure)) {
      const paths = ways.get(String(e.id)) ?? [];
      if (paths.length) roads.push({ id: 'way/' + e.id, name, en, ref: t.ref ?? '', kind: t.tunnel && t.tunnel !== 'no' ? 'tunnel' : t.bridge && t.bridge !== 'no' ? 'bridge' : 'road', paths });
    }
    if (e.type === 'relation' && t.type === 'route' && /^(bus|trolleybus|subway|train|light_rail|tram|monorail|ferry)$/.test(t.route ?? '')) {
      const paths = (e.members ?? []).filter(m => m.type === 'way').flatMap(m => ways.get(String(m.ref)) ?? []);
      // OSM map extracts only contain local members. Never join gaps across missing ways.
      if (paths.length) routes.push({ id: 'relation/' + e.id, name: name || t.route, en: en || t.route, ref: t.ref ?? '', kind: t.route, operator: t.operator ?? t.network, paths });
    }
    if (e.type === 'node' && Number.isFinite(e.lat) && Number.isFinite(e.lon) && (t.highway === 'bus_stop' || ['station', 'halt', 'tram_stop'].includes(t.railway) || ['platform', 'stop_position'].includes(t.public_transport))) {
      const point: MapPoint = [e.lat!, e.lon!];
      if (inside(point)) stops.push({ id: 'node/' + e.id, name: name || (t.highway === 'bus_stop' ? 'Bus stop' : 'Stop'), en: en || 'Stop', kind: t.railway ?? (t.bus === 'yes' || t.highway === 'bus_stop' ? 'bus' : 'stop'), point });
    }
  }
  // Adjacent OSM way pieces with the same name are one list entry; geometry stays separate.
  const merged = new Map<string, OpenMapLine>();
  for (const road of roads) {
    const key = [road.name, road.ref, road.kind].join('|'), prior = merged.get(key);
    if (prior) prior.paths.push(...road.paths); else merged.set(key, road);
  }
  return { roads: Array.from(merged.values()), routes, stops, bounds, fetchedAt, sourceUrl, source: 'OpenStreetMap contributors', license: 'ODbL 1.0' };
}
