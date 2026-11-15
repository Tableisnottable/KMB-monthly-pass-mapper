import { NextRequest, NextResponse } from 'next/server';
import { networkPatterns, networkStops } from '../../../data/transportNetwork';
import { transitGeometry, routeOnStreets, type Coordinate } from '../../../data/routeGeometry';
import { getRateLimiter } from '../../../lib/cloudflare';
import { withinRoutingArea } from '../../../domain/routingArea';
import { parseRoutePreferences } from '../../../domain/routePreferences';
import { parseJourneyVias } from '../../../domain/journeyVia';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const raw = ['fromLat', 'fromLon', 'toLat', 'toLon'].map(k => params.get(k));
  const values = raw.map(Number);
  if (raw.some(v => !v?.trim()) || !withinRoutingArea(values[0], values[1]) || !withinRoutingArea(values[2], values[3])) {
    return NextResponse.json({ error: 'Endpoints must be within the Hong Kong–Shenzhen routing area.' }, { status: 400 });
  }
  const tokens = (params.get('legs') ?? '').split(',').filter(Boolean);
  if (!tokens.length && params.get('walk') !== 'true') return NextResponse.json({ error: 'Choose transit legs or a walking journey.' }, { status: 400 });
  let preferences, via;
  try { preferences = parseRoutePreferences(params.get('preferences')); via = parseJourneyVias(params); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const rawIndices = params.getAll('viaIndex'), viaIndices = rawIndices.map(Number);
  if (via.length && tokens.length && (rawIndices.length !== via.length || rawIndices.some((raw, i) => !raw.trim()
    || !Number.isSafeInteger(viaIndices[i]) || viaIndices[i] < 0 || viaIndices[i] > tokens.length
    || i > 0 && viaIndices[i] < viaIndices[i - 1]))) {
    return NextResponse.json({ error: 'Choose the Via position in the journey.' }, { status: 400 });
  }
  type GeometryLeg = { walk: true; from: Coordinate; to: Coordinate } | { walk: false; pattern: number; board: number; alight: number };
  const legs = tokens.map((token): GeometryLeg | null => {
    if (token.startsWith('w:')) {
      const parts = token.split(':').slice(1), [a, b, c, d] = parts.map(Number);
      return parts.length === 4 && parts.every(v => v.trim()) && withinRoutingArea(a, b) && withinRoutingArea(c, d)
        ? { walk: true, from: [a, b], to: [c, d] } : null;
    }
    if (!/^\d+:\d+:\d+$/.test(token)) return null;
    const [pattern, board, alight] = token.split(':').map(Number), p = networkPatterns[pattern];
    return p && board >= 0 && alight < p.s.length && board < alight && p.p[board] === 0 && p.a[alight] === 0 ? { walk: false, pattern, board, alight } : null;
  });
  if (legs.some(l => !l)) return NextResponse.json({ error: 'Invalid transit leg.' }, { status: 400 });
  const limiter = await getRateLimiter();
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  if (limiter && !(await limiter.limit({ key: 'geometry:' + ip })).success) return NextResponse.json({ error: 'Please try again shortly.' }, { status: 429 });
  const origin: Coordinate = [values[0], values[1]], destination: Coordinate = [values[2], values[3]];
  const jobs: Promise<{ legIndex: number; walk: boolean; paths: Coordinate[][]; source: string }>[] = [];
  let previous = origin;
  for (const [legIndex, leg] of legs.map((l, i) => [i, l!] as const)) {
    const waypoint: Coordinate[] = via.filter((_, i) => viaIndices[i] === legIndex).map(stop => [stop.lat, stop.lng]);
    if (leg.walk) {
      jobs.push(routeOnStreets([previous, ...waypoint, leg.from, leg.to], true).then(geometry => ({ legIndex, walk: true, ...geometry })));
      previous = leg.to; continue;
    }
    const p = networkPatterns[leg.pattern], a = networkStops[p.s[leg.board]], b = networkStops[p.s[leg.alight]];
    jobs.push(routeOnStreets([previous, ...waypoint, [a[3], a[4]]], true).then(geometry => ({ legIndex, walk: true, ...geometry })));
    jobs.push(transitGeometry(leg.pattern, leg.board, leg.alight).then(geometry => ({ legIndex, walk: false, ...geometry })));
    previous = [b[3], b[4]];
  }
  const finalVia: Coordinate[] = via.filter((_, i) => !legs.length || viaIndices[i] === legs.length).map(stop => [stop.lat, stop.lng]);
  jobs.push(routeOnStreets([previous, ...finalVia, destination], true, legs.length ? undefined : preferences).then(geometry => ({ legIndex: legs.length, walk: true, ...geometry })));
  const pieces = await Promise.all(jobs);
  return NextResponse.json({ pieces, missing: pieces.filter(p => p.source === 'UNAVAILABLE').length,
    attribution: 'Hong Kong Transport Department / CSDI; © OpenStreetMap contributors. Road fallback and footpaths use OSRM.' },
    { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
