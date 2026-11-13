import { NextRequest, NextResponse } from 'next/server';
import { networkPatterns, networkStops } from '../../../data/transportNetwork';
import { transitGeometry, routeOnStreets, type Coordinate } from '../../../data/routeGeometry';
import { getRateLimiter } from '../../../lib/cloudflare';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const raw = ['fromLat', 'fromLon', 'toLat', 'toLon'].map(k => params.get(k));
  const values = raw.map(Number);
  if (raw.some(v => !v?.trim()) || values.some(v => !Number.isFinite(v)) || values[0] < 22.1 || values[0] > 22.6 || values[2] < 22.1 || values[2] > 22.6 || values[1] < 113.8 || values[1] > 114.5 || values[3] < 113.8 || values[3] > 114.5) {
    return NextResponse.json({ error: 'Valid Hong Kong endpoints are required.' }, { status: 400 });
  }
  const tokens = (params.get('legs') ?? '').split(',').filter(Boolean);
  if (tokens.length > 4 || (!tokens.length && params.get('walk') !== 'true')) return NextResponse.json({ error: 'Choose one to four transit legs, or a walking journey.' }, { status: 400 });
  const legs = tokens.map(token => {
    if (!/^\d+:\d+:\d+$/.test(token)) return null;
    const [pattern, board, alight] = token.split(':').map(Number), p = networkPatterns[pattern];
    return p && board >= 0 && alight < p.s.length && board < alight && p.p[board] === 0 && p.a[alight] === 0 ? { pattern, board, alight } : null;
  });
  if (legs.some(l => !l)) return NextResponse.json({ error: 'Invalid transit leg.' }, { status: 400 });
  const limiter = await getRateLimiter();
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  if (limiter && !(await limiter.limit({ key: 'geometry:' + ip })).success) return NextResponse.json({ error: 'Please try again shortly.' }, { status: 429 });
  const origin: Coordinate = [values[0], values[1]], destination: Coordinate = [values[2], values[3]];
  const jobs: Promise<{ legIndex: number; walk: boolean; paths: Coordinate[][]; source: string }>[] = [];
  let previous = origin;
  for (const [legIndex, leg] of legs.map((l, i) => [i, l!] as const)) {
    const p = networkPatterns[leg.pattern], a = networkStops[p.s[leg.board]], b = networkStops[p.s[leg.alight]];
    jobs.push(routeOnStreets([previous, [a[3], a[4]]], true).then(geometry => ({ legIndex, walk: true, ...geometry })));
    jobs.push(transitGeometry(leg.pattern, leg.board, leg.alight).then(geometry => ({ legIndex, walk: false, ...geometry })));
    previous = [b[3], b[4]];
  }
  jobs.push(routeOnStreets([previous, destination], true).then(geometry => ({ legIndex: legs.length, walk: true, ...geometry })));
  const pieces = await Promise.all(jobs);
  return NextResponse.json({ pieces, missing: pieces.filter(p => p.source === 'UNAVAILABLE').length,
    attribution: 'Hong Kong Transport Department / CSDI; © OpenStreetMap contributors. Road fallback and footpaths use OSRM.' },
    { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
