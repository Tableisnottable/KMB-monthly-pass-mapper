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
import { parseRoutePreferences, routeRoadsAllowed } from '../../../domain/routePreferences';
import { parseChangeMinutes, parseTransitSelection } from '../../../domain/transportSelection';
import { parseJourneyLimits, withinJourneyLimits } from '../../../domain/journeyLimits';

import { parseJourneyVia } from '../../../domain/journeyVia';
import { joinViaJourney } from '../../../engine/viaJourney';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ipAddress = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limiter = await getRateLimiter();
  if (limiter && !(await limiter.limit({ key: `journey:${ipAddress}` })).success) {
    return NextResponse.json({ error: 'Too many journey requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
  }
  return planJourney(request.nextUrl.searchParams);
}

async function planJourney(params: URLSearchParams, now = new Date()): Promise<NextResponse> {
  const raw = ['fromLat', 'fromLon', 'toLat', 'toLon'].map(key => params.get(key));
  const [fromLat, fromLon, toLat, toLon] = raw.map(Number);
  if (raw.some(v => !v?.trim()) || [fromLat, fromLon, toLat, toLon].some(v => !Number.isFinite(v)) ||
      Math.abs(fromLat) > 90 || Math.abs(toLat) > 90 || Math.abs(fromLon) > 180 || Math.abs(toLon) > 180) {
    return NextResponse.json({ error: 'Valid fromLat, fromLon, toLat and toLon are required.' }, { status: 400 });
  }
  const locale = params.get('lang') === 'en' ? 'en' : 'zh';
  const started = Date.now();
  let via;
  try { via = parseJourneyVia(params); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
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
  if (via) return planViaJourney(params, via, date, now);
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

/** Reuse the normal planner for each stage; only the public request is rate limited. */
async function planViaJourney(params: URLSearchParams, via: NonNullable<ReturnType<typeof parseJourneyVia>>, date: Date, now: Date): Promise<NextResponse> {
  const started = Date.now(), mode = params.get('timeMode') ?? 'now', reverse = mode === 'arrive';
  const atStart = via.lat === Number(params.get('fromLat')) && via.lng === Number(params.get('fromLon'));
  const atEnd = via.lat === Number(params.get('toLat')) && via.lng === Number(params.get('toLon'));
  if (atStart || atEnd) {
    const direct = new URLSearchParams(params);
    for (const key of ['viaLat', 'viaLon', 'viaName']) direct.delete(key);
    const response = await planJourney(direct, now), payload = await response.json();
    return NextResponse.json({ ...payload, data: payload.data?.map((route: ScoredRoute) => ({ ...route, via, viaLegIndex: atStart ? 0 : route.legs.length })),
      meta: { ...payload.meta, via } }, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  }
  const preferences = parseRoutePreferences(params.get('preferences'));
  const weights = parseRouteWeights(params.get('weights')), limits = parseJourneyLimits(params.get('limits'));
  const requiredOperators = parseOperatorSelection(params.get('requiredOperators'));
  const requiredModes = parseTransitSelection(params.get('requiredModes'));
  const stagePreferences = { ...preferences, roads: Object.fromEntries(Object.entries(preferences.roads ?? {})
    .map(([id, level]) => [id, level === 'must' ? 'prefer' : level])) };
  const base = new URLSearchParams(params);
  for (const key of ['viaLat', 'viaLon', 'viaName', 'requiredOperators', 'requiredModes']) base.delete(key);
  base.set('preferences', JSON.stringify(stagePreferences));
  async function stage(first: boolean, anchor: Date, timeMode: string) {
    const query = new URLSearchParams(base);
    query.set(first ? 'toLat' : 'fromLat', String(via.lat));
    query.set(first ? 'toLon' : 'fromLon', String(via.lng));
    query.set('timeMode', timeMode); query.set('time', anchor.toISOString());
    const response = await planJourney(query, now);
    if (!response.ok) throw new Error((await response.json()).error ?? 'Via journey unavailable.');
    return await response.json() as { data: ScoredRoute[]; meta: Record<string, unknown> };
  }
  const seed = await stage(!reverse, date, reverse ? 'arrive' : mode);
  // Keep searches bounded on phones, including options that can satisfy a Must
  // rule on only one side of the waypoint. Cache identical timetable anchors.
  const seeds = new Set<ScoredRoute>();
  const add = (route?: ScoredRoute) => { if (route) seeds.add(route); };
  for (const id of requiredOperators ?? []) add(seed.data.find(r => r.legs.some(l => (l.networkOperator ?? l.operator).split('+').includes(id))));
  for (const id of requiredModes ?? []) add(seed.data.find(r => r.legs.some(l => l.mode === id)));
  add(seed.data.find(r => routeRoadsAllowed(r, preferences)));
  for (const route of seed.data) { if (seeds.size >= 6) break; add(route); }
  const onwardCache = new Map<string, ReturnType<typeof stage>>();
  const combined: Route[] = [];
  const change = parseChangeMinutes(params.get('changeMinutes'));
  for (const route of Array.from(seeds)) {
    const transit = route.legs.some(l => l.mode !== 'WALK');
    const anchor = new Date(Date.parse(reverse ? route.departureTime! : route.arrivalTime!) + (reverse ? -1 : 1) * (transit ? change : 0) * 60_000);
    const key = anchor.toISOString();
    if (!onwardCache.has(key)) onwardCache.set(key, stage(reverse, anchor, reverse ? 'arrive' : 'depart'));
    const onward = await onwardCache.get(key)!;
    for (const other of onward.data) {
      const joined = reverse ? joinViaJourney(other, route, via) : joinViaJourney(route, other, via);
      if (joined) { joined.timeMode = mode as Route['timeMode']; combined.push(joined); }
    }
  }
  const allowed = combined.filter(route => withinJourneyLimits(route, limits) && routeRoadsAllowed(route, preferences)
    && (!requiredOperators?.length || requiredOperators.every(id => route.legs!.some(l => (l.networkOperator ?? l.operator).split('+').includes(id))))
    && (!requiredModes?.length || requiredModes.every(id => route.legs!.some(l => l.mode === id)))
    && (!reverse || Date.parse(route.arrivalTime!) <= date.getTime() + 1));
  const scored = selectJourneyAlternatives(scoreRoutes(allowed, weightingDate(date), weights), 40, preferences);
  return NextResponse.json({ data: scored, meta: { ...seed.meta, via, timeMode: mode, requestedTime: date.toISOString(),
    originUncovered: reverse ? false : seed.meta.originUncovered, destinationUncovered: reverse ? seed.meta.destinationUncovered : false,
    tooCloseToRide: false, candidates: combined.length, durationMs: Date.now() - started,
    requiredOperators: requiredOperators ?? [], requiredModes: requiredModes ?? [], preferences,
    live: scored.some(r => r.legs.some(l => l.realtimeEta?.isLive)),
  } }, { headers: { 'Cache-Control': 'no-store' } });
}
