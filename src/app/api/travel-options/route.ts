import { NextRequest, NextResponse } from 'next/server';
import { routeOnStreets, type Coordinate, type StreetProfile } from '../../../data/routeGeometry';
import { travelOption, type TravelMode } from '../../../domain/travelOptions';
import { getRateLimiter } from '../../../lib/cloudflare';
import { parseComparisonSelection } from '../../../domain/transportSelection';
import { parseRoutePreferences } from '../../../domain/routePreferences';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const raw = ['fromLat', 'fromLon', 'toLat', 'toLon'].map(k => request.nextUrl.searchParams.get(k));
  const values = raw.map(Number);
  if (raw.some(v => !v?.trim()) || values.some(v => !Number.isFinite(v)) || values[0] < 22.1 || values[0] > 22.6
    || values[2] < 22.1 || values[2] > 22.6 || values[1] < 113.8 || values[1] > 114.5 || values[3] < 113.8 || values[3] > 114.5) {
    return NextResponse.json({ error: 'Valid Hong Kong endpoints are required.' }, { status: 400 });
  }
  let selected;
  try { selected = parseComparisonSelection(request.nextUrl.searchParams.get('modes')); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  let preferences;
  try { preferences = parseRoutePreferences(request.nextUrl.searchParams.get('preferences')); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const limiter = await getRateLimiter();
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (limiter && !(await limiter.limit({ key: 'travel-options:' + ip })).success) return NextResponse.json({ error: 'Please try again shortly.' }, { status: 429 });
  const points: Coordinate[] = [[values[0], values[1]], [values[2], values[3]]];
  const modes: [TravelMode, StreetProfile][] = [['walk', 'foot'], ['cycle', 'bike'], ['taxi', 'car'], ['drive', 'car']];
  const profiles = new Map<StreetProfile, ReturnType<typeof routeOnStreets>>();
  const data = await Promise.all(modes.filter(([mode]) => selected === undefined || selected.includes(mode))
    .map(async ([mode, profile]) => {
      if (!profiles.has(profile)) profiles.set(profile, routeOnStreets(points, profile, preferences));
      return travelOption(mode, await profiles.get(profile)!);
    }));
  return NextResponse.json({ data, attribution: '© OpenStreetMap contributors; routing by FOSSGIS / OSRM. Estimated travel times, not live traffic.' },
    { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
