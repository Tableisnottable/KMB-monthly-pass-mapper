import { regions } from '../domain/regions';
import { localMapBounds } from '../domain/openMap';
const agent = 'TransitCompass/1.0 (https://github.com/Tableisnottable/KMB-monthly-pass-mapper)';
/** Stream the public extract. Parsing runs on the device to keep free Workers CPU low. */
export async function openMapResponse(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET') return Response.json({ error: 'GET required.' }, { status: 405 });
  const url = new URL(request.url), region = regions.find(r => r.id === url.searchParams.get('region'));
  const rawLat = url.searchParams.get('lat'), rawLon = url.searchParams.get('lon');
  const lat = Number(rawLat), lon = Number(rawLon);
  if (!region || !rawLat || !rawLon || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -12 || lat > 77 || lon < 25 || lon > 180) return Response.json({ error: 'Choose an Asian region and a valid map location.' }, { status: 400 });
  const bounds = localMapBounds(lat, lon), [s, w, n, e] = bounds;
  try {
    const response = await fetcher(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${w},${s},${e},${n}`, {
      headers: { Accept: 'application/json', 'User-Agent': agent }, redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')) throw new Error('Open map source unavailable');
    return new Response(response.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400',
      'X-Open-Map-Bounds': bounds.join(','), 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return Response.json({ error: 'OPEN_MAP_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
  }
}
