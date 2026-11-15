import { NextRequest, NextResponse } from 'next/server';
import { findMultimodalJourneys, selectJourneyAlternatives, retimeConnections, setJourneyTimes } from '../../../engine/multimodalJourney';
import { parseJourneyTime } from '../../../engine/journeyTime';
import { scoreRoutes, type Route, type ScoredRoute } from '../../../engine/UpgradedScoringEngine';
import { routeOnStreets } from '../../../data/routeGeometry';
import { travelOption } from '../../../domain/travelOptions';
import { withinRoutingArea } from '../../../domain/routingArea';
import { enrichJourneyArrivals } from '../../../data/multimodalLive';
import { transportCoverage, weightingDate } from '../../../data/transportNetwork';
import { getRateLimiter } from '../../../lib/cloudflare';
import { parseOperatorSelection } from '../../../domain/operatorSelection';
import { parseRouteWeights, customWeights } from '../../../engine/routeWeights';
import { parseRoutePreferences } from '../../../domain/routePreferences';
import { parseChangeMinutes, parseTransitSelection } from '../../../domain/transportSelection';
import { parseJourneyLimits, withinJourneyLimits } from '../../../domain/journeyLimits';

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
  let selection;
  let operators: string[] | undefined, requiredOperators: string[] | undefined;
  let modes: string[] | undefined, requiredModes: string[] | undefined;
  let weights, preferences, limits;
  let minimumChangeMinutes: number;
  try { selection = parseJourneyTime(params.get('timeMode'), params.get('time'), now);
    operators = parseOperatorSelection(params.get('operators')); requiredOperators = parseOperatorSelection(params.get('requiredOperators'));
    if (requiredOperators?.some(id => operators !== undefined && !operators.includes(id))) throw new Error('A required company cannot also be banned.');
    modes = parseTransitSelection(params.get('modes')); requiredModes = parseTransitSelection(params.get('requiredModes'));
    if (requiredModes?.some(id => modes !== undefined && !modes.includes(id))) throw new Error('A required transport type cannot also be banned.');
    minimumChangeMinutes = parseChangeMinutes(params.get('changeMinutes'));
    limits = parseJourneyLimits(params.get('limits'));
    if (limits.change !== null && limits.change < minimumChangeMinutes) throw new Error('Maximum change time must be at least the minimum change time.');
    weights = parseRouteWeights(params.get('weights')); preferences = parseRoutePreferences(params.get('preferences')); }
  catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 400 }); }
  const { mode, date } = selection;
  const walkingRoute = !requiredOperators?.length && !requiredModes?.length && params.get('walkComparison') !== 'false'
    && limits.walk !== 0 && withinRoutingArea(fromLat, fromLon) && withinRoutingArea(toLat, toLon)
    ? routeOnStreets([[fromLat, fromLon], [toLat, toLon]], 'foot', preferences) : undefined;
  const result = findMultimodalJourneys({ lat: fromLat, lng: fromLon }, { lat: toLat, lng: toLon }, date, locale, mode === 'arrive', false, { operators, modes, requiredOperators, requiredModes, weights, minimumChangeMinutes, preferences, limits });
  const candidates: Route[] = selectJourneyAlternatives(result.routes.filter(route => (!requiredOperators?.length
    || requiredOperators.every(id => route.legs.some(leg => (leg.networkOperator ?? leg.operator).split('+').includes(id))))
    && (!requiredModes?.length || requiredModes.every(id => route.legs.some(leg => leg.mode === id)))), 64, preferences);
  // A current prediction says nothing about a trip on a selected future date.
  if (mode === 'now') { await enrichJourneyArrivals(candidates, now); retimeConnections(candidates, now, minimumChangeMinutes); }
  else for (const route of candidates) setJourneyTimes(route, date, mode);
  let scored: ScoredRoute[] = selectJourneyAlternatives(scoreRoutes(candidates.filter(r => withinJourneyLimits(r, limits) && !r.legs?.some(l => l.serviceEnded)
    && (mode !== 'arrive' || new Date(r.arrivalTime!).getTime() <= date.getTime() + 1)), weightingDate(date), weights), 40, preferences);
  const walking = walkingRoute ? travelOption('walk', await walkingRoute) : undefined;
  const walkMinutes = walking?.available ? walking.minutes : undefined;
  if (walkMinutes !== undefined) {
    const walk: Route = { id: 'walk-only', transferCount: 0, walkTransferTimeMinutes: 0,
      legs: [{ id: 'walk', mode: 'WALK', operator: 'WALK', routeNumber: '',
        originStop: { id: 'origin', name: locale === 'en' ? 'Start' : '起點', lat: fromLat, lng: fromLon },
        destinationStop: { id: 'destination', name: locale === 'en' ? 'End' : '目的地', lat: toLat, lng: toLon },
        journeyTimeMinutes: walkMinutes, scheduledIntervalMinutes: 0, realtimeEta: null, fare: 0 }] };
    const departure = mode === 'arrive' ? new Date(date.getTime() - walkMinutes * 60_000) : date;
    walk.departureTime = departure.toISOString(); walk.arrivalTime = new Date(departure.getTime() + walkMinutes * 60_000).toISOString(); walk.timeMode = mode;
    walk.legs![0].departureTime = walk.departureTime; walk.legs![0].arrivalTime = walk.arrivalTime;
    if (withinJourneyLimits(walk, limits)) scored = [...scored, scoreRoutes([walk], weightingDate(date), weights)[0]].sort((a, b) => a.finalScore - b.finalScore);
  }
  return NextResponse.json({ data: scored, meta: {
    source: 'Transport Department GTFS; MTR topology/fares; official KMB, Citybus and MTR arrivals',
    live: scored.some(r => r.legs.some(l => l.realtimeEta?.isLive)),
    timeMode: mode, requestedTime: date.toISOString(), timeZone: 'Asia/Hong_Kong', farePassenger: 'NORMAL_ADULT',
    fareBasis: 'Adult Octopus where published; normal adult fares otherwise. No assumed interchange or pass discount.',
    weightingVersion: 2,
    customWeights: customWeights(weights), weights, preferences, selectedOperators: operators ?? null, requiredOperators: requiredOperators ?? [], minimumChangeMinutes,
    selectedModes: modes ?? null, requiredModes: requiredModes ?? [], limits,
    importedOn: transportCoverage.importedOn, coverage: transportCoverage.counts,
    candidates: result.candidates, durationMs: Date.now() - started,
    originUncovered: !result.originStops.length, destinationUncovered: !result.destinationStops.length,
    tooCloseToRide: walkMinutes !== undefined && walkMinutes <= 6, maxTransfers: limits.transfers,
    limitations: transportCoverage.limitations,
  } }, { headers: { 'Cache-Control': 'no-store' } });
}
