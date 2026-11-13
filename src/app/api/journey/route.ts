import { NextRequest, NextResponse } from 'next/server';
import { findMultimodalJourneys, dedupeJourneys, retimeConnections } from '../../../engine/multimodalJourney';
import { scoreRoutes, type Route } from '../../../engine/UpgradedScoringEngine';
import { haversineKm } from '../../../engine/journeyHelpers';
import { enrichJourneyArrivals } from '../../../data/multimodalLive';
import { transportCoverage, weightingDate } from '../../../data/transportNetwork';
import { getRateLimiter } from '../../../lib/cloudflare';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ipAddress = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limiter = await getRateLimiter();
  if (limiter && !(await limiter.limit({ key: `journey:${ipAddress}` })).success) {
    return NextResponse.json({ error: 'Too many journey requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
  }
  const params = request.nextUrl.searchParams;
  const raw = ['fromLat', 'fromLon', 'toLat', 'toLon'].map(key => params.get(key));
  const [fromLat, fromLon, toLat, toLon] = raw.map(Number);
  if (raw.some(v => !v?.trim()) || [fromLat, fromLon, toLat, toLon].some(v => !Number.isFinite(v)) ||
      Math.abs(fromLat) > 90 || Math.abs(toLat) > 90 || Math.abs(fromLon) > 180 || Math.abs(toLon) > 180) {
    return NextResponse.json({ error: 'Valid fromLat, fromLon, toLat and toLon are required.' }, { status: 400 });
  }
  const locale = params.get('lang') === 'en' ? 'en' : 'zh';
  const now = new Date(), started = Date.now();
  const result = findMultimodalJourneys({ lat: fromLat, lng: fromLon }, { lat: toLat, lng: toLon }, now, locale);
  const candidates: Route[] = result.routes.slice(0, 16);
  await enrichJourneyArrivals(candidates, now);
  retimeConnections(candidates, now);
  let scored = dedupeJourneys(scoreRoutes(candidates, weightingDate(now)));
  const walkMinutes = Math.ceil(haversineKm(fromLat, fromLon, toLat, toLon) * 1.2 / (5 / 60));
  if (walkMinutes <= 45) {
    const walk: Route = { id: 'walk-only', transferCount: 0, walkTransferTimeMinutes: 0,
      legs: [{ id: 'walk', mode: 'WALK', operator: 'WALK', routeNumber: '',
        originStop: { id: 'origin', name: locale === 'en' ? 'Start' : '起點', lat: fromLat, lng: fromLon },
        destinationStop: { id: 'destination', name: locale === 'en' ? 'End' : '目的地', lat: toLat, lng: toLon },
        journeyTimeMinutes: walkMinutes, scheduledIntervalMinutes: 0, realtimeEta: null, fare: 0 }] };
    scored = [...scored.slice(0, 8), scoreRoutes([walk], weightingDate(now))[0]].sort((a, b) => a.finalScore - b.finalScore);
  } else scored = scored.slice(0, 8);
  return NextResponse.json({ data: scored, meta: {
    source: 'Transport Department GTFS; MTR topology/fares; official KMB, Citybus and MTR arrivals',
    live: scored.some(r => r.legs.some(l => l.realtimeEta?.isLive)),
    importedOn: transportCoverage.importedOn, coverage: transportCoverage.counts,
    candidates: result.candidates, durationMs: Date.now() - started,
    originUncovered: !result.originStops.length, destinationUncovered: !result.destinationStops.length,
    tooCloseToRide: walkMinutes <= 6, maxTransfers: 3,
    limitations: transportCoverage.limitations,
  } }, { headers: { 'Cache-Control': 'no-store' } });
}
