import { localMapBounds, parseOpenMap, type MapPoint, type OpenMapArea } from '../domain/openMap';

/** Public OSM CORS endpoint avoids depending on shared hosting egress. */
export async function loadOpenMapArea(region: string, center: MapPoint, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<OpenMapArea> {
  const [lat, lon] = center;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -12 || lat > 77 || lon < 25 || lon > 180) throw new Error('Outside the Asian map directory');
  const bounds = localMapBounds(lat, lon), [s, w, n, e] = bounds;
  const source = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${w},${s},${e},${n}`;
  const proxy = '/api/open-map?' + new URLSearchParams({ region, lat: String(lat), lon: String(lon) });
  for (const url of [source, proxy]) {
    signal.throwIfAborted();
    const attempt = new AbortController(), abort = () => attempt.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => attempt.abort(), 15000);
    try {
      const response = await fetcher(url, { signal: attempt.signal, credentials: 'omit', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Map unavailable');
      const raw = await response.json();
      if (!Array.isArray(raw.elements)) throw new Error('Invalid map extract');
      return parseOpenMap(raw.elements, bounds, source);
    } catch {
      signal.throwIfAborted();
    } finally {
      clearTimeout(timeout); signal.removeEventListener('abort', abort);
    }
  }
  throw new Error('Open map unavailable');
}
