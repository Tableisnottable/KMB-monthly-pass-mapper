import { loadAlignmentData } from './alignmentData';
import { networkPatterns, networkRoutes, networkStops } from './transportNetwork';
import { haversineKm } from '../engine/journeyHelpers';
import corridorSegments from './corridorSegments.json';
import { corridorChoices, roadLevel, type CorridorGroup, type RoutePreferences } from '../domain/routePreferences';

export type Coordinate = [number, number]; // Leaflet order: latitude, longitude.
export type StreetProfile = 'foot' | 'bike' | 'car';
export type GeometryResult = { paths: Coordinate[][]; source: 'TD_CSDI' | 'OSM_TRACK' | 'OSM_ROAD' | 'OSM_FOOT' | 'OSM_BIKE' | 'UNAVAILABLE'; distanceMetres?: number; durationSeconds?: number };
let roadRows = new Map<string, string[][]>();
let trackRows = new Map<string, string[]>();
let alignmentLoading: Promise<void> | undefined;
function ensureAlignments() {
  if (!alignmentLoading) alignmentLoading = loadAlignmentData().then(({ roads, tracks }) => {
    const newRoads = new Map<string, string[][]>(), newTracks = new Map<string, string[]>();
    for (const [id, direction, lines] of roads) {
      const key = `${id}:${direction}`; newRoads.set(key, [...(newRoads.get(key) ?? []), lines]);
    }
    for (const [key, lines] of tracks) newTracks.set(key, [...(newTracks.get(key) ?? []), ...lines]);
    roadRows = newRoads; trackRows = newTracks;
  }).catch(error => { alignmentLoading = undefined; throw error; });
  return alignmentLoading;
}
const distance = (a: Coordinate, b: Coordinate) => haversineKm(a[0], a[1], b[0], b[1]);
const MAX_WALKING_GAP_KM = 0.2;
export function hasWalkableGeometry(path: Coordinate[]): boolean {
  return path.length >= 2 && path.every((point, index) => point.every(Number.isFinite)
    && (index === 0 || distance(path[index - 1], point) <= MAX_WALKING_GAP_KM));
}

export function decodePolyline(value: string): Coordinate[] {
  let i = 0, lat = 0, lng = 0; const points: Coordinate[] = [];
  function number() {
    let result = 0, shift = 0, b;
    do { if (i >= value.length || shift > 30) throw new Error('Invalid encoded line'); b = value.charCodeAt(i++) - 63; result |= (b & 31) << shift; shift += 5; } while (b >= 32);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
  while (i < value.length) { lat += number(); lng += number(); points.push([lat / 1e5, lng / 1e5]); }
  return points;
}

/** Project ordered stops onto a continuous official line, retaining its bends. */
export function sliceAlignment(line: Coordinate[], stops: Coordinate[], board: number, alight: number): Coordinate[] | null {
  if (line.length < 2 || board < 0 || alight >= stops.length || board >= alight) return null;
  const positions: { position: number; point: Coordinate }[] = [];
  let previous = 0;
  for (const stop of stops) {
    let best: { position: number; point: Coordinate; distance: number } | undefined;
    for (let i = Math.floor(previous); i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1], dx = (b[1] - a[1]) * .926, dy = b[0] - a[0];
      const t = Math.max(i === Math.floor(previous) ? previous - i : 0, Math.min(1,
        ((stop[1] - a[1]) * .926 * dx + (stop[0] - a[0]) * dy) / (dx * dx + dy * dy || 1)));
      const point: Coordinate = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const d = distance(stop, point);
      // Prefer the first visit when a circular route repeats the same stop.
      if (!best || d < best.distance - .003) best = { position: i + t, point, distance: d };
    }
    if (!best || best.distance > .22) return null;
    positions.push(best); previous = best.position;
  }
  const a = positions[board], b = positions[alight];
  if (b.position <= a.position) return null;
  return [a.point, ...line.slice(Math.floor(a.position) + 1, Math.ceil(b.position)), b.point];
}

type Graph = { points: Coordinate[]; adjacent: [number, number][][] };
const graphs = new Map<string, Graph>();
function graphFor(key: string): Graph | null {
  if (graphs.has(key)) return graphs.get(key)!;
  const lines = trackRows.get(key); if (!lines) return null;
  const points: Coordinate[] = [], adjacent: [number, number][][] = [], ids = new Map<string, number>();
  const node = (p: Coordinate) => { const k = p.join(','); if (!ids.has(k)) { ids.set(k, points.length); points.push(p); adjacent.push([]); } return ids.get(k)!; };
  for (const encoded of lines) {
    const line = decodePolyline(encoded);
    for (let i = 1; i < line.length; i++) {
      const a = node(line[i - 1]), b = node(line[i]), d = distance(line[i - 1], line[i]);
      adjacent[a].push([b, d]); adjacent[b].push([a, d]);
    }
  }
  const graph = { points, adjacent }; graphs.set(key, graph); return graph;
}
class Heap {
  values: [number, number][] = [];
  push(value: [number, number]) { let i = this.values.length; this.values.push(value); while (i) { const p = (i - 1) >> 1; if (this.values[p][0] <= value[0]) break; this.values[i] = this.values[p]; i = p; } this.values[i] = value; }
  pop() { const first = this.values[0], last = this.values.pop()!; if (this.values.length) { let i = 0; while (i * 2 + 1 < this.values.length) { let child = i * 2 + 1; if (child + 1 < this.values.length && this.values[child + 1][0] < this.values[child][0]) child++; if (last[0] <= this.values[child][0]) break; this.values[i] = this.values[child]; i = child; } this.values[i] = last; } return first; }
}
export function followTrack(graph: Graph, from: Coordinate, to: Coordinate, maxSnapKm = .65): Coordinate[] | null {
  const near = (p: Coordinate) => graph.points.map((q, index) => ({ index, d: distance(p, q) })).filter(x => x.d <= maxSnapKm).sort((a, b) => a.d - b.d).slice(0, 8);
  const starts = near(from), ends = new Map(near(to).map(x => [x.index, x.d]));
  if (!starts.length || !ends.size) return null;
  const costs = new Map<number, number>(), parents = new Map<number, number>(), heap = new Heap();
  for (const s of starts) { costs.set(s.index, s.d * 5); heap.push([s.d * 5, s.index]); }
  let best = Infinity, finish = -1;
  while (heap.values.length) {
    const [cost, node] = heap.pop(); if (cost > best) break;
    if (cost !== costs.get(node)) continue;
    const end = ends.get(node);
    if (end !== undefined && cost + end * 5 < best) { best = cost + end * 5; finish = node; }
    for (const [next, d] of graph.adjacent[node]) if (cost + d < (costs.get(next) ?? Infinity)) {
      costs.set(next, cost + d); parents.set(next, node); heap.push([cost + d, next]);
    }
  }
  if (finish < 0) return null;
  const path = [graph.points[finish]];
  while (parents.has(finish)) { finish = parents.get(finish)!; path.push(graph.points[finish]); }
  return path.reverse();
}

const cache = new Map<string, { value: GeometryResult; expires: number }>();
const inFlight = new Map<string, Promise<GeometryResult>>();
let nextPublicRequest = 0;
const missing = (): GeometryResult => ({ paths: [], source: 'UNAVAILABLE' });
const patternById = new Map(networkPatterns.map(pattern => [pattern.id, pattern]));
const corridorGeometryCache = new Map<string, Coordinate[][]>();
const corridorGeometryInflight = new Map<string, Promise<Coordinate[][]>>();

async function corridorGeometry(id: string): Promise<Coordinate[][]> {
  if (corridorGeometryCache.has(id)) return corridorGeometryCache.get(id)!;
  if (corridorGeometryInflight.has(id)) return corridorGeometryInflight.get(id)!;
  const pending = (async () => {
    await ensureAlignments();
    const paths: Coordinate[][] = [];
    const segments = (corridorSegments as [string, number, string][]).filter(([, , corridor]) => corridor === id);
    for (const [patternId, segment] of segments) {
      const pattern = patternById.get(patternId);
      if (!pattern || segment < 0 || segment + 1 >= pattern.s.length) continue;
      const route = networkRoutes[pattern.r];
      const stops = pattern.s.map(index => [networkStops[index][3], networkStops[index][4]] as Coordinate);
      for (const lines of roadRows.get(`${route[0]}:${pattern.d}`) ?? []) for (const line of lines) {
        const path = sliceAlignment(decodePolyline(line), stops, segment, segment + 1);
        if (path && path.length > 1) paths.push(path);
      }
    }
    return paths;
  })().then(paths => { corridorGeometryCache.set(id, paths); return paths; })
    .finally(() => corridorGeometryInflight.delete(id));
  corridorGeometryInflight.set(id, pending);
  return pending;
}

const corridorCell = (p: Coordinate) => `${Math.floor(p[0] / .0002)}:${Math.floor(p[1] / .0002)}`;
function pathsOverlap(a: Coordinate[][], b: Coordinate[][]): boolean {
  const cells = new Map<string, Coordinate[]>();
  for (const line of b) for (const point of line) {
    const key = corridorCell(point); cells.set(key, [...(cells.get(key) ?? []), point]);
  }
  for (const line of a) for (const point of line) {
    const latCell = Math.floor(point[0] / .0002), lonCell = Math.floor(point[1] / .0002);
    for (let lat = latCell - 1; lat <= latCell + 1; lat++) for (let lon = lonCell - 1; lon <= lonCell + 1; lon++) {
      for (const candidate of cells.get(`${lat}:${lon}`) ?? []) if (distance(point, candidate) <= .025) return true;
    }
  }
  return false;
}

export function evaluateStreetPath(paths: Coordinate[][], preferences: RoutePreferences, corridorPaths: ReadonlyMap<string, Coordinate[][]>) {
  const active = Object.values(corridorChoices).flat().map(row => row[0] as string)
    .filter(id => roadLevel(preferences, id) !== 'normal');
  const matched = new Set(active.filter(id => {
    const corridor = corridorPaths.get(id);
    return corridor?.length ? pathsOverlap(paths, corridor) : false;
  }));
  if (active.some(id => roadLevel(preferences, id) === 'ban' && matched.has(id))) return { allowed: false, preferenceCost: 0 };
  const allowed = (Object.keys(corridorChoices) as CorridorGroup[]).every(group => {
    const required = corridorChoices[group].map(row => row[0] as string).filter(id => roadLevel(preferences, id) === 'must');
    return !required.length || required.some(id => matched.has(id));
  });
  if (!allowed) return { allowed: false, preferenceCost: 0 };
  const preferenceCost = (Object.keys(corridorChoices) as CorridorGroup[]).reduce((cost, group) => {
    const preferred = corridorChoices[group].map(row => row[0] as string).filter(id => roadLevel(preferences, id) === 'prefer');
    return cost - (preferred.some(id => matched.has(id)) ? 120 : 0);
  }, 0);
  return { allowed: true, preferenceCost };
}

async function evaluateStreetPathWithData(paths: Coordinate[][], preferences: RoutePreferences) {
  const active = Object.values(corridorChoices).flat().map(row => row[0] as string)
    .filter(id => roadLevel(preferences, id) !== 'normal');
  const corridorPaths = new Map<string, Coordinate[][]>();
  await Promise.all(active.map(async id => corridorPaths.set(id, await corridorGeometry(id))));
  return evaluateStreetPath(paths, preferences, corridorPaths);
}

export async function routeOnStreets(points: Coordinate[], mode: boolean | StreetProfile = false, preferences?: RoutePreferences): Promise<GeometryResult> {
  const profile = typeof mode === 'boolean' ? mode ? 'foot' : 'car' : mode;
  const walking = profile === 'foot';
  const source = profile === 'bike' ? 'OSM_BIKE' as const : walking ? 'OSM_FOOT' as const : 'OSM_ROAD' as const;
  if (points.length < 2) return missing();
  // Do not replace nearby, distinct endpoints with a straight-line shortcut.
  if (points.every(p => distance(points[0], p) < .001)) return { paths: [], source, distanceMetres: 0, durationSeconds: 0 };
  const key = `${profile}:${points.map(p => p.map(v => v.toFixed(5)).join(',')).join(';')}:${preferences ? JSON.stringify(preferences) : ''}`;
  const saved = cache.get(key); if (saved && saved.expires > Date.now()) return saved.value;
  if (inFlight.has(key)) return inFlight.get(key)!;
  const promise = (async () => {
    const base = walking ? process.env.OSRM_FOOT_URL ?? 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'
      : profile === 'bike' ? process.env.OSRM_BIKE_URL ?? 'https://routing.openstreetmap.de/routed-bike/route/v1/cycling'
        : process.env.OSRM_CAR_URL ?? 'https://routing.openstreetmap.de/routed-car/route/v1/driving';
    const paths: Coordinate[][] = [];
    let distanceMetres = 0, durationSeconds = 0;
    try {
      for (let offset = 0; offset < points.length - 1; offset += 79) {
        const chunk = points.slice(offset, offset + 80);
        // Serialize calls to the public demonstration service, including
        // concurrent users in this process. Production can use a private backend.
        const delay = Math.max(0, nextPublicRequest - Date.now()); nextPublicRequest = Date.now() + delay + 1100;
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        const response = await fetch(`${base}/${chunk.map(([lat, lng]) => `${lng},${lat}`).join(';')}?overview=full&geometries=geojson&steps=false${walking || preferences ? '&alternatives=3' : ''}`, { signal: AbortSignal.timeout(12000) });
        if (!response.ok) return missing();
        const data = await response.json() as { code?: string; waypoints?: { distance: number }[]; routes?: { geometry: { coordinates: number[][] }; distance: number; duration?: number }[] };
        if (data.code !== 'Ok' || !data.routes?.length || data.waypoints?.some(p => !Number.isFinite(p.distance) || p.distance > (walking ? 150 : 100))) return missing();
        const maxDistance = Math.max(1200, chunk.reduce((n, p, i) => n + (i ? distance(chunk[i - 1], p) * 1000 : 0), 0) * (walking ? 5 : 8));
        const candidates = data.routes.map(route => ({ route, path: route.geometry.coordinates.map(p => [p[1], p[0]] as Coordinate) }))
          .filter(({ route, path }) => path.length >= 2 && !path.some(p => p.some(v => !Number.isFinite(v)))
            && (!walking || hasWalkableGeometry(path))
            && Number.isFinite(route.distance) && route.distance >= 0 && route.distance <= maxDistance);
        const valid = preferences ? (await Promise.all(candidates.map(async candidate => {
          const evaluation = await evaluateStreetPathWithData([candidate.path], preferences);
          return { ...candidate, ...evaluation, preferenceCost: (candidate.route.duration ?? candidate.route.distance / (walking ? 1.3 : 8)) + evaluation.preferenceCost };
        }))).filter(candidate => candidate.allowed).sort((a, b) => a.preferenceCost - b.preferenceCost)
          : candidates;
        const routeChoice = valid[0];
        if (!routeChoice) return missing();
        paths.push(routeChoice.path);
        distanceMetres += routeChoice.route.distance;
        // Geometry-only responses remain usable, but never invent a duration.
        durationSeconds = routeChoice.route.duration !== undefined && Number.isFinite(routeChoice.route.duration) && routeChoice.route.duration >= 0
          ? durationSeconds + routeChoice.route.duration : NaN;
      }
      return { paths, source, distanceMetres, ...(Number.isFinite(durationSeconds) ? { durationSeconds } : {}) };
    } catch { return missing(); }
  })();
  inFlight.set(key, promise);
  const value = await promise; inFlight.delete(key);
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(key, { value, expires: Date.now() + (value.source === 'UNAVAILABLE' ? 30000 : 86400000) });
  return value;
}

const transitCache = new Map<string, GeometryResult>();
export async function transitGeometry(patternIndex: number, board: number, alight: number): Promise<GeometryResult> {
  const key = `${patternIndex}:${board}:${alight}`;
  if (transitCache.has(key)) return transitCache.get(key)!;
  const p = networkPatterns[patternIndex];
  if (!p || board < 0 || alight >= p.s.length || board >= alight) return missing();
  try { await ensureAlignments(); } catch { return missing(); }
  const r = networkRoutes[p.r], stops = p.s.map(i => [networkStops[i][3], networkStops[i][4]] as Coordinate);
  let result: GeometryResult = missing();
  if (r[5] === 'BUS' || r[5] === 'MINIBUS') {
    for (const lines of roadRows.get(`${r[0]}:${p.d}`) ?? []) for (const line of lines) {
      const path = sliceAlignment(decodePolyline(line), stops, board, alight);
      if (path) { result = { paths: [path], source: 'TD_CSDI' }; break; }
    }
    if (!result.paths.length) result = await routeOnStreets(stops.slice(board, alight + 1));
  } else {
    const fallback = ({ SUBWAY: 'mode:subway', LIGHT_RAIL: 'mode:light_rail', TRAM: 'mode:tram', CABLE_CAR: 'mode:funicular', FERRY: 'mode:ferry' } as Record<string, string>)[r[5]];
    const graph = graphFor(r[0]) ?? graphFor(fallback);
    if (graph) {
      const paths: Coordinate[][] = [];
      for (let i = board; i < alight; i++) {
        const path = followTrack(graph, stops[i], stops[i + 1], r[5] === 'FERRY' ? .8 : .65);
        if (!path || path.length < 2) { paths.length = 0; break; }
        // Keep disconnected pieces separate; never draw a chord over a gap.
        if (paths.length && distance(paths[paths.length - 1].at(-1)!, path[0]) < .003) paths[paths.length - 1].push(...path.slice(1));
        else paths.push(path);
      }
      if (paths.length) result = { paths, source: 'OSM_TRACK' };
    }
  }
  if (result.source !== 'UNAVAILABLE') { if (transitCache.size >= 500) transitCache.delete(transitCache.keys().next().value!); transitCache.set(key, result); }
  return result;
}
