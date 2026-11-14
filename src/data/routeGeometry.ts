import { routeOnStreets } from './streetRouting';
export { routeOnStreets } from './streetRouting';
import { loadAlignmentData } from './alignmentData';
import { networkPatterns, networkRoutes, networkStops } from './transportNetwork';
import { haversineKm } from '../engine/journeyHelpers';

export type Coordinate = [number, number]; // Leaflet order: latitude, longitude.
export type StreetProfile = 'foot' | 'bike' | 'car';
export type GeometryResult = { paths: Coordinate[][]; source: 'TD_CSDI' | 'OSM_TRACK' | 'OSM_ROAD' | 'OSM_FOOT' | 'OSM_BIKE' | 'UNAVAILABLE'; distanceMetres?: number; durationSeconds?: number };
const missing = (): GeometryResult => ({ paths: [], source: 'UNAVAILABLE' });
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
