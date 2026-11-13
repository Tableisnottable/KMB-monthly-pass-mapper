import { NextRequest, NextResponse } from 'next/server';
import { networkPatterns, networkRoutes, networkStops, networkStop, transportCoverage } from '../../../data/transportNetwork';
import { enrichJourneyArrivals } from '../../../data/multimodalLive';
import type { Route } from '../../../engine/UpgradedScoringEngine';
import { getRateLimiter } from '../../../lib/cloudflare';
import { normalizeTransitQuery } from '../../../data/networkPlaceSearch';
import { operatorInfo, transportOperators } from '../../../data/transportOperators';
import { hongKongServiceDate, nextPublishedDeparture, routeTimetable } from '../../../data/networkTimetable';
import { isResidentsService, searchTimetableRoutes, timetableRoutes } from '../../../data/timetableCatalog';
import { residentsDirectoryMeta, residentsOperator, residentsRoute, residentsRoutes } from '../../../data/residentsServices';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const limiter = await getRateLimiter();
  if (limiter && !(await limiter.limit({ key: 'network:' + (request.headers.get('cf-connecting-ip') ?? 'unknown') })).success) {
    return NextResponse.json({ error: 'Too many transport lookups.' }, { status: 429 });
  }
  const p = request.nextUrl.searchParams, resource = p.get('resource') ?? 'coverage';
  if (resource === 'coverage') return NextResponse.json(transportCoverage);
  if (resource === 'operators') {
    const residentPatterns = networkPatterns.filter(pattern => isResidentsService({ number: networkRoutes[pattern.r][2] }));
    return NextResponse.json({ data: [...transportOperators.map(operator => ({ ...operator,
    routeCount: networkRoutes.filter(route => route[1] === operator.id).length,
    timetablePatterns: networkPatterns.filter(pattern => networkRoutes[pattern.r][1] === operator.id && pattern.w.length > 0).length,
    scheduleRecords: networkPatterns.filter(pattern => networkRoutes[pattern.r][1] === operator.id).reduce((sum, pattern) => sum + pattern.w.length, 0),
    liveArrivals: ['KMB', 'LWB', 'CTB', 'KMB+CTB', 'LWB+CTB', 'MTR', 'LRT', 'GMB'].includes(operator.id),
    })), { ...residentsOperator, routeCount: timetableRoutes.filter(isResidentsService).length,
      timetablePatterns: residentPatterns.filter(pattern => pattern.w.length > 0).length,
      scheduleRecords: residentPatterns.reduce((sum, pattern) => sum + pattern.w.length, 0) }] });
  }
  if (resource === 'residents') {
    const resident = residentsRoute(p.get('route') ?? '');
    return resident ? NextResponse.json({ resident, meta: residentsDirectoryMeta })
      : NextResponse.json({ error: 'Unknown residents’ service.' }, { status: 404 });
  }
  if (resource === 'timetable') {
    try {
      const data = routeTimetable(p.get('route') ?? '', p.get('date') ?? hongKongServiceDate(), p.get('pattern') ?? undefined, p.get('stop') ?? undefined);
      return NextResponse.json({ ...data, company: operatorInfo(data.route[1]), residentDocument: residentsRoutes.find(route => route.number === data.route[2]), meta: { timezone: 'Asia/Hong_Kong',
        importedOn: transportCoverage.importedOn, source: transportCoverage.sources['td-gtfs-en.zip'],
        frequencyEndExclusive: true, allPublishedWindows: true } });
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid timetable lookup.' }, { status: 400 }); }
  }
  const query = (p.get('q') ?? '').trim().toLowerCase();
  const operator = p.get('operator'), mode = p.get('mode');
  const limit = Math.min(500, Math.max(1, Number(p.get('limit')) || 50));
  if (query.length > 120) return NextResponse.json({ error: 'Query is too long.' }, { status: 400 });
  if (resource === 'routes') {
    const data = searchTimetableRoutes(query, operator, mode);
    const offset = Math.max(0, Math.floor(Number(p.get('offset')) || 0));
    return NextResponse.json({ data: data.slice(offset, offset + limit).map(r => ({ ...r,
      company: r.operator === 'RESIDENTS' ? residentsOperator : operatorInfo(r.operator) })), total: data.length, hasMore: offset + limit < data.length });
  }
  if (resource === 'stops') {
    const needle = normalizeTransitQuery(query);
    const data = networkStops.map((s, index) => ({ s, index })).filter(({ s }) =>
      (!query || [s[0], s[1], s[2]].some(text => normalizeTransitQuery(text).includes(needle))) && (!mode || s[6] === mode));
    const isRail = (s: typeof networkStops[number]) => s[6] === 'SUBWAY' || s[6] === 'LIGHT_RAIL';
    data.sort((a, b) => Number(isRail(b.s)) - Number(isRail(a.s)) || a.s[2].length - b.s[2].length);
    return NextResponse.json({ data: data.slice(0, limit).map(({ s }) => ({ id: s[0], nameTc: s[1], nameEn: s[2],
      lat: s[3], lng: s[4], mode: s[6] })), total: data.length });
  }
  if (resource !== 'departures') return NextResponse.json({ error: 'resource must be coverage, operators, routes, stops, timetable, residents or departures.' }, { status: 400 });
  const stop = p.get('stop'), stopIndex = networkStops.findIndex(s => s[0] === stop);
  if (stopIndex < 0) return NextResponse.json({ error: 'Unknown transport stop.' }, { status: 400 });
  const now = new Date(), locale = p.get('lang') === 'en' ? 'en' : 'zh';
  const candidates: Route[] = [];
  networkPatterns.forEach((pattern, index) => {
    const r = networkRoutes[pattern.r], rail = r[5] === 'SUBWAY' || r[5] === 'LIGHT_RAIL';
    pattern.s.forEach((s, position) => {
      if (s !== stopIndex || pattern.p[position] !== 0 || position === pattern.s.length - 1) return;
      const next = rail ? undefined : nextPublishedDeparture(index, position, now);
      const dest = pattern.s.length - 1;
      candidates.push({ id: pattern.id, originWalkMinutes: 0, legs: [{
        id: pattern.id, operator: r[1] === 'KMB+CTB' ? 'KMB' : r[1] === 'LWB+CTB' ? 'LWB' : r[1], networkOperator: r[1], mode: r[5], routeNumber: r[2],
        originStop: networkStop(s, locale), destinationStop: networkStop(pattern.s[dest], locale),
        networkPattern: index, boardingIndex: position, alightingIndex: dest,
        scheduledDepartureMinutes: next ? Math.ceil(next.minutes) : undefined, serviceStatus: rail ? 'UNVERIFIED' : 'TIMETABLE',
        departureTime: next?.time,
        serviceEnded: !rail && !next,
      }] });
    });
  });
  const unique = candidates.sort((a, b) => (a.legs![0].scheduledDepartureMinutes ?? Infinity) - (b.legs![0].scheduledDepartureMinutes ?? Infinity)).filter((r, i, all) => all.findIndex(other =>
    networkPatterns[other.legs![0].networkPattern!].r === networkPatterns[r.legs![0].networkPattern!].r
    && other.legs![0].destinationStop!.id === r.legs![0].destinationStop!.id) === i);
  await enrichJourneyArrivals(unique, now);
  return NextResponse.json({ data: unique.flatMap(r => {
    const leg = r.legs![0];
    const pattern = networkPatterns[leg.networkPattern!], route = networkRoutes[pattern.r];
    const base = { operator: leg.networkOperator ?? leg.operator, networkOperator: leg.networkOperator ?? leg.operator,
      company: operatorInfo(leg.networkOperator ?? leg.operator),
      routeId: route[0], patternId: pattern.id, stopId: stop, number: leg.routeNumber, mode: leg.mode,
      destination: leg.destinationStop!.name, minutes: leg.realtimeEta?.etaMinutes ?? leg.scheduledDepartureMinutes ?? null,
      status: leg.serviceEnded ? 'NO_UPCOMING' : leg.serviceStatus };
    return leg.liveDepartures?.length ? leg.liveDepartures.map((departure, index) => ({ ...base, ...departure,
      company: operatorInfo(departure.operator ?? base.operator), networkOperator: base.operator,
      id: `${r.id}:live:${index}`, status: 'LIVE' })) : [{ ...base, id: r.id,
      time: leg.departureTime ?? (base.minutes === null ? null : new Date(now.getTime() + base.minutes * 60000).toISOString()), scheduleMatch: 'UNVERIFIED' }];
  }).sort((a,b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity)), meta: { fetchedAt: now.toISOString(), stop: networkStop(stopIndex, locale) } },
  { headers: { 'Cache-Control': 'no-store' } });
}
