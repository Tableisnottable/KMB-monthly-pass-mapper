import { NextRequest, NextResponse } from 'next/server';
import { networkPatterns, networkRoutes, networkStops, networkStop, normalAdultFare, transportCoverage } from '../../../data/transportNetwork';
import { transitGeometry } from '../../../data/routeGeometry';
import { enrichJourneyArrivals, enrichTerminalArrivals, notificationTargets } from '../../../data/multimodalLive';
import type { Route } from '../../../engine/UpgradedScoringEngine';
import { getRateLimiter } from '../../../lib/cloudflare';
import { normalizeTransitQuery } from '../../../data/networkPlaceSearch';
import { operatorInfo, transportOperators } from '../../../data/transportOperators';
import { hongKongServiceDate, nextPublishedDeparture, publishedDeparturesAround, publishedTimetableSlots, routeTimetable, upcomingPublishedDepartures } from '../../../data/networkTimetable';
import { isResidentsService, searchTimetableRoutes, timetableRoutes } from '../../../data/timetableCatalog';
import { residentsDirectoryMeta, residentsOperator, residentsRoute, residentsRoutes } from '../../../data/residentsServices';
import { departureTimingType, departureType } from '../../../domain/departureType';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const limiter = await getRateLimiter();
  if (limiter && !(await limiter.limit({ key: 'network:' + (request.headers.get('cf-connecting-ip') ?? 'unknown') })).success) {
    return NextResponse.json({ error: 'Too many transport lookups.' }, { status: 429 });
  }
  const p = request.nextUrl.searchParams, resource = p.get('resource') ?? 'coverage';
  if (resource === 'coverage') return NextResponse.json(transportCoverage);
  if (resource === 'route-map') {
    const routeIndex = networkRoutes.findIndex(route => route[0] === p.get('route'));
    if (routeIndex < 0) return NextResponse.json({ error: 'Unknown route.' }, { status: 404 });
    const route = networkRoutes[routeIndex], locale = p.get('lang') === 'en' ? 'en' : 'zh';
    return NextResponse.json({ route: { id: route[0], operator: route[1], number: route[2], mode: route[5] },
      patterns: networkPatterns.flatMap((pattern, index) => pattern.r !== routeIndex ? [] : [{ id: pattern.id, index, direction: pattern.d,
        stops: pattern.s.map((stop, position) => ({ ...networkStop(stop, locale), boarding: pattern.p[position] === 0,
          ...normalAdultFare(routeIndex, stop, pattern.s.at(-1)!) })) }]) }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  }
  if (resource === 'route-shape') {
    const index = networkPatterns.findIndex(pattern => pattern.id === p.get('pattern'));
    if (index < 0) return NextResponse.json({ error: 'Unknown direction.' }, { status: 404 });
    return NextResponse.json(await transitGeometry(index, 0, networkPatterns[index].s.length - 1), { headers: { 'Cache-Control': 'public, max-age=3600' } });
  }
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
  if (resource === 'pattern-stops') {
    const pattern = networkPatterns.find(pattern => pattern.id === p.get('pattern'));
    const board = Number(p.get('board')), alight = Number(p.get('alight'));
    if (!pattern || p.get('board') === null || p.get('alight') === null || !Number.isInteger(board) || !Number.isInteger(alight)
      || board < 0 || alight >= pattern.s.length || board >= alight) return NextResponse.json({ error: 'Choose a valid stop interval.' }, { status: 400 });
    const locale = p.get('lang') === 'en' ? 'en' : 'zh';
    return NextResponse.json({ data: pattern.s.slice(board, alight + 1).map(stop => networkStop(stop, locale)), stopCount: alight - board });
  }
  if (resource === 'notification-target') {
    const index = networkPatterns.findIndex(pattern => pattern.id === p.get('pattern')), pattern = networkPatterns[index];
    const board = Number(p.get('board')), alight = Number(p.get('alight'));
    if (!pattern || p.get('board') === null || p.get('alight') === null || !Number.isInteger(board) || !Number.isInteger(alight) || board < 0 || alight >= pattern.s.length || board >= alight || pattern.p[board] !== 0) return NextResponse.json({ error: 'Invalid boarding interval' }, { status: 400 });
    const route = networkRoutes[pattern.r];
    try { return NextResponse.json({ data: await notificationTargets({ operator: route[1].split('+')[0], networkOperator: route[1], routeNumber: route[2], mode: route[5], networkPattern: index, boardingIndex: board, alightingIndex: alight, originStop: networkStop(pattern.s[board]), destinationStop: networkStop(pattern.s[alight]) }) }); }
    catch { return NextResponse.json({ error: 'Notification stop lookup unavailable' }, { status: 502 }); }
  }
  if (resource === 'timetable') {
    try {
      const position = p.get('position');
      const data = routeTimetable(p.get('route') ?? '', p.get('date') ?? hongKongServiceDate(), p.get('pattern') ?? undefined,
        p.get('stop') ?? undefined, position === null ? undefined : position.trim() ? Number(position) : NaN);
      return NextResponse.json({ ...data, slots: publishedTimetableSlots(data.entries), company: operatorInfo(data.route[1]), residentDocument: residentsRoutes.find(route => route.number === data.route[2]), meta: { timezone: 'Asia/Hong_Kong',
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
  const includeHistory = p.get('history') === 'true';
  const routeStop = p.get('scope') === 'route-stop';
  if (routeStop) {
    const pattern = networkPatterns.find(item => item.id === p.get('pattern'));
    const board = p.get('board');
    if (!pattern || !board?.trim() || !Number.isInteger(Number(board)) || pattern.s[Number(board)] !== stopIndex
      || networkRoutes[pattern.r][0] !== p.get('route')) {
      return NextResponse.json({ error: 'Choose a stop on this route direction.' }, { status: 400 });
    }
  }
  if (includeHistory && !p.get('route')) return NextResponse.json({ error: 'A route is required to look up past timetable shifts.' }, { status: 400 });
  const now = new Date(), locale = p.get('lang') === 'en' ? 'en' : 'zh';
  const terminalLookup = !routeStop && includeHistory && p.get('terminal') === 'true';
  const candidates: Route[] = [];
  const canBoard = (pattern: typeof networkPatterns[number], position: number) => position < pattern.s.length - 1 && pattern.p[position] === 0;
  networkPatterns.forEach((pattern, index) => {
    const r = networkRoutes[pattern.r], rail = r[5] === 'SUBWAY' || r[5] === 'LIGHT_RAIL';
    if ((!terminalLookup && p.get('pattern') && pattern.id !== p.get('pattern')) || (p.get('route') && r[0] !== p.get('route'))) return;
    if (terminalLookup && pattern.s[0] !== stopIndex) return;
    pattern.s.forEach((s, position) => {
      if (s !== stopIndex || (terminalLookup && position !== 0) || (!routeStop && !canBoard(pattern, position))) return;
      if (p.get('board') !== null && position !== Number(p.get('board'))) return;
      const next = rail || routeStop || includeHistory ? undefined : nextPublishedDeparture(index, position, now);
      const dest = pattern.s.length - 1;
      candidates.push({ id: pattern.id, originWalkMinutes: 0, legs: [{
        id: pattern.id, operator: r[1] === 'KMB+CTB' ? 'KMB' : r[1] === 'LWB+CTB' ? 'LWB' : r[1], networkOperator: r[1], mode: r[5], routeNumber: r[2],
        originStop: networkStop(s, locale), destinationStop: networkStop(pattern.s[dest], locale),
        networkPattern: index, boardingIndex: position, alightingIndex: dest,
        scheduledDepartureMinutes: next ? Math.ceil(next.minutes) : undefined, serviceStatus: rail ? 'UNVERIFIED' : 'TIMETABLE',
        publishedHeadwayMinutes: next?.publishedHeadwayMinutes,
        departureTime: next?.time,
        serviceEnded: !rail && !next,
      }] });
    });
  });
  const unique = candidates.sort((a, b) => (a.legs![0].scheduledDepartureMinutes ?? Infinity) - (b.legs![0].scheduledDepartureMinutes ?? Infinity)).filter((r, i, all) => all.findIndex(other => {
    const left = other.legs![0], right = r.legs![0];
    return includeHistory ? left.networkPattern === right.networkPattern && left.boardingIndex === right.boardingIndex
      : networkPatterns[left.networkPattern!].r === networkPatterns[right.networkPattern!].r && left.destinationStop!.id === right.destinationStop!.id;
  }) === i);
  const liveCandidates = routeStop ? unique.filter(r => {
    const leg = r.legs![0];
    const pattern = networkPatterns[leg.networkPattern!];
    return canBoard(pattern, leg.boardingIndex!) || leg.boardingIndex === pattern.s.length - 1;
  }) : unique;
  if (!includeHistory && liveCandidates.length) {
    const terminal = liveCandidates.filter(r => {
      const leg = r.legs![0], pattern = networkPatterns[leg.networkPattern!];
      return routeStop && leg.boardingIndex === pattern.s.length - 1;
    });
    const ordinary = liveCandidates.filter(r => !terminal.includes(r));
    if (ordinary.length) await enrichJourneyArrivals(ordinary, now);
    if (terminal.length) await enrichTerminalArrivals(terminal, now);
  }
  return NextResponse.json({ data: unique.flatMap(r => {
    const leg = r.legs![0];
    const pattern = networkPatterns[leg.networkPattern!], route = networkRoutes[pattern.r];
    const base = { operator: leg.networkOperator ?? leg.operator, networkOperator: leg.networkOperator ?? leg.operator,
      company: operatorInfo(leg.networkOperator ?? leg.operator),
      routeId: route[0], patternId: pattern.id, stopId: stop, number: leg.routeNumber, mode: leg.mode,
      destination: leg.destinationStop!.name, minutes: leg.realtimeEta?.etaMinutes ?? leg.scheduledDepartureMinutes ?? null,
      publishedHeadwayMinutes: leg.publishedHeadwayMinutes,
      status: leg.serviceEnded ? 'NO_UPCOMING' : leg.serviceStatus };
    const observed = leg.liveDepartures ?? [];
    // Append only beyond the provider's preview. A timetable row must not
    // reintroduce a departure that may already have moved or been cancelled.
    const previewEnd = Math.max(now.getTime() - 1, ...observed.flatMap(row => [Date.parse(row.time),
      ...(departureType(row) === 'CHANGED' && row.timetableTime ? [Date.parse(row.timetableTime)] : [])]).filter(Number.isFinite));
    const cancelled = new Set((leg.departureNotices ?? []).flatMap(row => row.time ? [Date.parse(row.time)] : []));
    const observedTimes = new Set(observed.map(row => Date.parse(row.time)).filter(Number.isFinite));
    const historical = includeHistory && (routeStop || leg.mode !== 'SUBWAY' && leg.mode !== 'LIGHT_RAIL')
      ? publishedDeparturesAround(leg.networkPattern!, leg.boardingIndex ?? 0, now, 24 * 60, 0, routeStop)
        .filter(row => row.pastSchedule && !observedTimes.has(Date.parse(row.time)) && !cancelled.has(Date.parse(row.time)))
      : [];
    const upcoming = (includeHistory ? [] : routeStop
      ? publishedDeparturesAround(leg.networkPattern!, leg.boardingIndex ?? 0, now, 0, Infinity, true)
      : leg.mode === 'SUBWAY' || leg.mode === 'LIGHT_RAIL' ? []
      : upcomingPublishedDepartures(leg.networkPattern!, leg.boardingIndex ?? 0, now))
      .filter(row => Date.parse(row.time) > previewEnd && !cancelled.has(Date.parse(row.time)));
    const estimates = [...historical, ...upcoming];
    const departures = [...observed, ...estimates].map((departure, index) => ({ ...base, ...departure,
      company: operatorInfo(departure.operator ?? base.operator), networkOperator: base.operator,
      id: `${r.id}:${departure.timetableEstimate ? 'estimate' : 'live'}:${index}`, departureType: departureType(departure), timingType: departureTimingType(departure), status: departureTimingType(departure) === 'SCHEDULED' ? 'TIMETABLE' : 'LIVE' }));
    const fallback = !routeStop && !includeHistory && !departures.length && !cancelled.has(Date.parse(leg.departureTime ?? '')) ? [{ ...base, id: r.id,
      departureType: base.status === 'TIMETABLE' ? 'SCHEDULED' : undefined,
      timingType: base.status === 'TIMETABLE' ? 'SCHEDULED' : undefined,
      time: leg.departureTime ?? (base.minutes === null ? null : new Date(now.getTime() + base.minutes * 60000).toISOString()), scheduleMatch: 'UNVERIFIED',
      timetableEstimate: base.status === 'TIMETABLE' || undefined }] : [];
    return [...departures, ...fallback, ...(leg.departureNotices ?? []).map((notice, index) => ({ ...base, ...notice,
      id: `${r.id}:cancelled:${index}`, status: 'UNVERIFIED', minutes: null, time: notice.time ?? null,
      scheduleMatch: 'UNVERIFIED', company: operatorInfo(notice.operator ?? base.operator) }))];
  }).sort((a,b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity)), meta: { fetchedAt: now.toISOString(), stop: networkStop(stopIndex, locale) } },
  { headers: { 'Cache-Control': 'no-store' } });
}
