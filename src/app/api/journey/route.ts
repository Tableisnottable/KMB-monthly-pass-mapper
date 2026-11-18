import { NextRequest, NextResponse } from 'next/server';
import { findMultimodalJourneys, selectJourneyAlternatives, retimeConnections, setJourneyTimes, nextJourneyConnection } from '../../../engine/multimodalJourney';
import { selectJourneyDeparture } from '../../../domain/departureSelection';
import { isNonOperatingDeparture } from '../../../domain/departureType';
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

import { parseJourneyVias, type ViaStop } from '../../../domain/journeyVia';
import { joinViaJourney } from '../../../engine/viaJourney';

export const dynamic = 'force-dynamic';

/** Slow external feeds may finish later; they must never hold the route list open. */
async function beforeDeadline<T>(promise: Promise<T>, deadline: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | number | undefined;
  try {
    return await Promise.race([promise.catch(() => undefined), new Promise<undefined>(resolve => {
      timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
    })]);
  } finally { clearTimeout(timer); }
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('operation') === 'warm') return NextResponse.json({ ready: true });
  const ipAddress = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const limiter = await getRateLimiter();
  if (limiter && !(await limiter.limit({ key: `journey:${ipAddress}` })).success) {
    return NextResponse.json({ error: 'Too many journey requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
  }
  if (request.nextUrl.searchParams.get('operation') === 'retime') return retimeJourney(request.nextUrl.searchParams);
  return planJourney(request.nextUrl.searchParams);
}

function retimeJourney(params: URLSearchParams) {
  try {
    const route = JSON.parse(params.get('route') ?? 'null') as ScoredRoute;
    const choice = JSON.parse(params.get('departure') ?? 'null');
    const rawIndex = params.get('leg');
    if (!rawIndex || !/^\d+$/.test(rawIndex) || !route?.legs?.length || route.legs.length > 256 || !choice?.time
      || !route.departureTime || route.legs.some(leg => !Number.isFinite(leg.journeyTimeMinutes) || (leg.journeyTimeMinutes ?? -1) < 0)) throw new Error('Invalid journey.');
    const change = parseChangeMinutes(params.get('changeMinutes'));
    const result = selectJourneyDeparture(route, Number(rawIndex), choice, params.get('key') ?? '', (leg, ready) => {
      const live = leg.liveDepartures?.filter(row => !isNonOperatingDeparture(row) && Date.parse(row.time) >= ready.getTime())
        .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))[0];
      // Only extrapolate beyond the provider preview, never fill gaps inside it.
      if (live) return { departure: live };
      return nextJourneyConnection(leg, ready);
    }, change);
    if (!withinJourneyLimits(result, parseJourneyLimits(params.get('limits')))) throw new Error('Selected departure exceeds journey limits.');
    if (params.get('timeMode') === 'arrive' && Date.parse(result.arrivalTime!) > parseJourneyTime('arrive', params.get('time'), new Date()).date.getTime()) throw new Error('Selected departure arrives after your deadline.');
    const scored = scoreRoutes([result], weightingDate(new Date(result.departureTime!)), parseRouteWeights(params.get('weights')))[0];
    return NextResponse.json({ data: scored }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not select departure.' }, { status: 400 }); }
}

async function planJourney(params: URLSearchParams, now = new Date(), responseDeadline = Date.now() + 7000): Promise<NextResponse> {
  const raw = ['fromLat', 'fromLon', 'toLat', 'toLon'].map(key => params.get(key));
  const [fromLat, fromLon, toLat, toLon] = raw.map(Number);
  if (raw.some(v => !v?.trim()) || [fromLat, fromLon, toLat, toLon].some(v => !Number.isFinite(v)) ||
      Math.abs(fromLat) > 90 || Math.abs(toLat) > 90 || Math.abs(fromLon) > 180 || Math.abs(toLon) > 180) {
    return NextResponse.json({ error: 'Valid fromLat, fromLon, toLat and toLon are required.' }, { status: 400 });
  }
  const locale = params.get('lang') === 'en' ? 'en' : 'zh';
  const started = Date.now();
  const preview = params.get('phase') === 'preview';
  let via;
  try { via = parseJourneyVias(params); }
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
  if (via.length) return planViaJourney(params, via, date, now, responseDeadline);
  const walkingRoute = !preview && !requiredOperators?.length && !requiredModes?.length && params.get('walkComparison') !== 'false'
    && limits.walk !== 0 && withinRoutingArea(fromLat, fromLon) && withinRoutingArea(toLat, toLon)
    ? routeOnStreets([[fromLat, fromLon], [toLat, toLon]], 'foot', preferences) : undefined;
  const result = findMultimodalJourneys({ lat: fromLat, lng: fromLon }, { lat: toLat, lng: toLon }, date, locale, mode === 'arrive', preview, { operators, modes, requiredOperators, requiredModes, weights, minimumChangeMinutes, preferences, limits, ...(preview ? { previewBudgetMs: 1000 } : {}) });
  const candidates: Route[] = selectJourneyAlternatives(result.routes.filter(route => (!requiredOperators?.length
    || requiredOperators.every(id => route.legs.some(leg => (leg.networkOperator ?? leg.operator).split('+').includes(id))))
    && (!requiredModes?.length || requiredModes.every(id => route.legs.some(leg => leg.mode === id)))), 64, preferences);
  // A current prediction says nothing about a trip on a selected future date.
  if (mode === 'now' && !preview) {
    // Isolate mutation: a timed-out ETA request cannot change a returned journey.
    const liveCandidates = structuredClone(candidates);
    const enriched = await beforeDeadline(enrichJourneyArrivals(liveCandidates, now).then(() => liveCandidates), responseDeadline);
    if (enriched) { candidates.splice(0, candidates.length, ...enriched); retimeConnections(candidates, now, minimumChangeMinutes); }
    else for (const route of candidates) setJourneyTimes(route, date, mode);
  }
  else for (const route of candidates) setJourneyTimes(route, date, mode);
  let scored: ScoredRoute[] = selectJourneyAlternatives(scoreRoutes(candidates.filter(r => withinJourneyLimits(r, limits) && !r.legs?.some(l => l.serviceEnded)
    && (mode !== 'arrive' || new Date(r.arrivalTime!).getTime() <= date.getTime() + 1)), weightingDate(date), weights), 64, preferences);
  const walkingGeometry = walkingRoute ? await beforeDeadline(walkingRoute, responseDeadline) : undefined;
  const walking = walkingGeometry ? travelOption('walk', walkingGeometry) : undefined;
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
    phase: preview ? 'preview' : 'complete',
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

/** Plan stages in order (backwards for arrive-by), keeping a bounded beam rather than a recursive product. */
async function planViaJourney(params: URLSearchParams, vias: ViaStop[], date: Date, now: Date, responseDeadline: number): Promise<NextResponse> {
  const started = Date.now(), mode = params.get('timeMode') ?? 'now', reverse = mode === 'arrive';
  const preferences = parseRoutePreferences(params.get('preferences'));
  const weights = parseRouteWeights(params.get('weights')), limits = parseJourneyLimits(params.get('limits'));
  const requiredOperators = parseOperatorSelection(params.get('requiredOperators'));
  const requiredModes = parseTransitSelection(params.get('requiredModes'));
  const stagePreferences = { ...preferences, roads: Object.fromEntries(Object.entries(preferences.roads ?? {})
    .map(([id, level]) => [id, level === 'must' ? 'prefer' : level])) };
  const base = new URLSearchParams(params);
  for (const key of ['viaLat', 'viaLon', 'viaName', 'requiredOperators', 'requiredModes']) base.delete(key);
  base.set('preferences', JSON.stringify(stagePreferences));
  const origin = { lat: Number(params.get('fromLat')), lng: Number(params.get('fromLon')) };
  const destination = { lat: Number(params.get('toLat')), lng: Number(params.get('toLon')) };
  const points = [origin, ...vias, destination];
  const change = parseChangeMinutes(params.get('changeMinutes'));
  let beam: ScoredRoute[] = [], firstMeta: Record<string, unknown> = {}, candidates = 0;
  let pendingMarkers: ViaStop[] = [];
  const initial = reverse ? points.length - 2 : 0;
  for (let offset = 0; offset < points.length - 1; offset++) {
    const index = reverse ? initial - offset : offset;
    const from = points[index], to = points[index + 1];
    const boundary = reverse ? vias[index] : vias[index - 1];
    if (from.lat === to.lat && from.lng === to.lng) {
      const stop = Object.keys(firstMeta).length ? (reverse ? vias[index] : vias[index - 1]) : (reverse ? vias[index - 1] : vias[index]);
      if (stop) {
        if (beam.length) beam = beam.map(route => {
          const markers = reverse ? [{ stop, legIndex: 0 }, ...(route.viaStops ?? [])]
            : [...(route.viaStops ?? []), { stop, legIndex: route.legs.length }];
          return { ...route, viaStops: markers, via: markers[0].stop, viaLegIndex: markers[0].legIndex };
        });
        else pendingMarkers.push(stop);
      }
      continue;
    }
    const cache = new Map<string, Promise<{ data: ScoredRoute[]; meta: Record<string, unknown> }>>();
    const stage = async (anchor: Date, timeMode: string) => {
      const query = new URLSearchParams(base);
      query.set('fromLat', String(from.lat)); query.set('fromLon', String(from.lng));
      query.set('toLat', String(to.lat)); query.set('toLon', String(to.lng));
      query.set('timeMode', timeMode); query.set('time', anchor.toISOString());
      const response = await planJourney(query, now, responseDeadline);
      if (!response.ok) throw new Error((await response.json()).error ?? 'Via journey unavailable.');
      return await response.json() as { data: ScoredRoute[]; meta: Record<string, unknown> };
    };
    if (!beam.length && !Object.keys(firstMeta).length) {
      const result = await stage(date, reverse ? 'arrive' : mode);
      firstMeta = result.meta; beam = result.data; candidates += beam.length;
      if (pendingMarkers.length) beam = beam.map(route => {
        const markers = pendingMarkers.map(stop => ({ stop, legIndex: reverse ? route.legs.length : 0 }));
        if (reverse) markers.reverse();
        return { ...route, viaStops: markers, via: markers[0].stop, viaLegIndex: markers[0].legIndex };
      });
    } else {
      const seeds = new Set<ScoredRoute>();
      const add = (route?: ScoredRoute) => { if (route) seeds.add(route); };
      for (const id of requiredOperators ?? []) add(beam.find(r => r.legs.some(l => (l.networkOperator ?? l.operator).split('+').includes(id))));
      for (const id of requiredModes ?? []) add(beam.find(r => r.legs.some(l => l.mode === id)));
      add(beam.find(r => routeRoadsAllowed(r, preferences)));
      for (const route of beam) { if (seeds.size >= 6) break; add(route); }
      const combined: Route[] = [];
      for (const route of Array.from(seeds)) {
        const anchor = new Date(Date.parse(reverse ? route.departureTime! : route.arrivalTime!)
          + (reverse ? -1 : 1) * (route.legs.some(l => l.mode !== 'WALK') ? change : 0) * 60_000);
        const key = anchor.toISOString();
        if (!cache.has(key)) cache.set(key, stage(anchor, reverse ? 'arrive' : 'depart'));
        const next = await cache.get(key)!;
        for (const other of next.data) {
          const joined = reverse ? joinViaJourney(other, route, boundary) : joinViaJourney(route, other, boundary);
          if (joined) { joined.timeMode = mode as Route['timeMode']; combined.push(joined); }
        }
      }
      candidates += combined.length;
      beam = selectJourneyAlternatives(scoreRoutes(combined.filter(route => withinJourneyLimits(route, limits)), weightingDate(date), weights), 40, stagePreferences);
    }
    if (!beam.length) break;
  }
  // All waypoints may coincide with the endpoints; still return the normal zero-distance comparison.
  if (!Object.keys(firstMeta).length) {
    const direct = new URLSearchParams(params);
    for (const key of ['viaLat', 'viaLon', 'viaName']) direct.delete(key);
    const response = await planJourney(direct, now, responseDeadline), payload = await response.json();
    return NextResponse.json({ ...payload, data: payload.data?.map((route: ScoredRoute) => ({ ...route, viaStops: vias.map(stop => ({ stop, legIndex: 0 })) })), meta: { ...payload.meta, vias } }, { status: response.status });
  }
  const allowed = beam.filter(route => withinJourneyLimits(route, limits) && routeRoadsAllowed(route, preferences)
    && (!requiredOperators?.length || requiredOperators.every(id => route.legs.some(l => (l.networkOperator ?? l.operator).split('+').includes(id))))
    && (!requiredModes?.length || requiredModes.every(id => route.legs.some(l => l.mode === id)))
    && (!reverse || Date.parse(route.arrivalTime!) <= date.getTime() + 1));
  const data = selectJourneyAlternatives(allowed, 40, preferences);
  return NextResponse.json({ data, meta: { ...firstMeta, via: vias[0], vias, timeMode: mode, requestedTime: date.toISOString(),
    originUncovered: reverse ? false : firstMeta.originUncovered, destinationUncovered: reverse ? firstMeta.destinationUncovered : false,
    tooCloseToRide: false, candidates, durationMs: Date.now() - started,
    requiredOperators: requiredOperators ?? [], requiredModes: requiredModes ?? [], preferences,
    live: data.some(r => r.legs.some(l => l.realtimeEta?.isLive)),
  } }, { headers: { 'Cache-Control': 'no-store' } });
}
