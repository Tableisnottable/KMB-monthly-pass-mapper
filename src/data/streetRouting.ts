import { haversineKm } from '../engine/journeyHelpers';
import type { Coordinate, GeometryResult, StreetProfile } from './routeGeometry';
const distance = (a: Coordinate, b: Coordinate) => haversineKm(a[0], a[1], b[0], b[1]);

const cache = new Map<string, { value: GeometryResult; expires: number }>();
const inFlight = new Map<string, Promise<GeometryResult>>();
let nextPublicRequest = 0;
const missing = (): GeometryResult => ({ paths: [], source: 'UNAVAILABLE' });
export async function routeOnStreets(points: Coordinate[], mode: boolean | StreetProfile = false): Promise<GeometryResult> {
  const profile = typeof mode === 'boolean' ? mode ? 'foot' : 'car' : mode;
  const walking = profile === 'foot';
  const source = profile === 'bike' ? 'OSM_BIKE' as const : walking ? 'OSM_FOOT' as const : 'OSM_ROAD' as const;
  if (points.length < 2) return missing();
  // Do not replace nearby, distinct endpoints with a straight-line shortcut.
  if (points.every(p => distance(points[0], p) < .001)) return { paths: [], source, distanceMetres: 0, durationSeconds: 0 };
  const key = `${profile}:${points.map(p => p.map(v => v.toFixed(5)).join(',')).join(';')}`;
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
        const response = await fetch(`${base}/${chunk.map(([lat, lng]) => `${lng},${lat}`).join(';')}?overview=full&geometries=geojson&steps=false`, { signal: AbortSignal.timeout(12000) });
        if (!response.ok) return missing();
        const data = await response.json() as { code?: string; waypoints?: { distance: number }[]; routes?: { geometry: { coordinates: number[][] }; distance: number; duration?: number }[] };
        const route = data.routes?.[0];
        if (data.code !== 'Ok' || !route || data.waypoints?.some(p => !Number.isFinite(p.distance) || p.distance > (walking ? 150 : 100))) return missing();
        const path = route.geometry.coordinates.map(p => [p[1], p[0]] as Coordinate);
        if (path.length < 2 || path.some(p => p.some(v => !Number.isFinite(v))) || !Number.isFinite(route.distance) || route.distance < 0
          || route.distance > Math.max(1200, chunk.reduce((n, p, i) => n + (i ? distance(chunk[i - 1], p) * 1000 : 0), 0) * (walking ? 5 : 8))) return missing();
        paths.push(path);
        distanceMetres += route.distance;
        // Geometry-only responses remain usable, but never invent a duration.
        durationSeconds = route.duration !== undefined && Number.isFinite(route.duration) && route.duration >= 0
          ? durationSeconds + route.duration : NaN;
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
