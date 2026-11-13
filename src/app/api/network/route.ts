import { NextRequest, NextResponse } from 'next/server';
import { networkPatterns, networkRoutes, networkStops, networkStop, transportCoverage } from '../../../data/transportNetwork';
import { activeWindows, nextDeparture } from '../../../engine/multimodalJourney';
import { enrichJourneyArrivals } from '../../../data/multimodalLive';
import type { Route } from '../../../engine/UpgradedScoringEngine';
import { getRateLimiter } from '../../../lib/cloudflare';
import { normalizeTransitQuery } from '../../../data/networkPlaceSearch';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const limiter = await getRateLimiter();
  if (limiter && !(await limiter.limit({ key: 'network:' + (request.headers.get('cf-connecting-ip') ?? 'unknown') })).success) {
    return NextResponse.json({ error: 'Too many transport lookups.' }, { status: 429 });
  }
  const p = request.nextUrl.searchParams, resource = p.get('resource') ?? 'coverage';
  if (resource === 'coverage') return NextResponse.json(transportCoverage);
  const query = (p.get('q') ?? '').trim().toLowerCase();
  const operator = p.get('operator'), mode = p.get('mode');
  const limit = Math.min(500, Math.max(1, Number(p.get('limit')) || 50));
  if (query.length > 120) return NextResponse.json({ error: 'Query is too long.' }, { status: 400 });
  if (resource === 'routes') {
    const data = networkRoutes.filter(r => (!operator || r[1] === operator) && (!mode || r[5] === mode)
      && (!query || [r[2], r[3], r[4]].join(' ').toLowerCase().includes(query)));
    return NextResponse.json({ data: data.slice(0, limit).map(r => ({ id: r[0], operator: r[1], number: r[2],
      nameTc: r[3], nameEn: r[4], mode: r[5] })), total: data.length });
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
  if (resource !== 'departures') return NextResponse.json({ error: 'resource must be coverage, routes, stops or departures.' }, { status: 400 });
  const stop = p.get('stop'), stopIndex = networkStops.findIndex(s => s[0] === stop);
  if (stopIndex < 0) return NextResponse.json({ error: 'Unknown transport stop.' }, { status: 400 });
  const now = new Date(), locale = p.get('lang') === 'en' ? 'en' : 'zh';
  const candidates: Route[] = [];
  networkPatterns.forEach((pattern, index) => {
    const r = networkRoutes[pattern.r], rail = r[5] === 'SUBWAY' || r[5] === 'LIGHT_RAIL';
    pattern.s.forEach((s, position) => {
      if (s !== stopIndex || pattern.p[position] !== 0 || position === pattern.s.length - 1) return;
      const next = rail ? undefined : nextDeparture(activeWindows(pattern, now), pattern.t[position], 0);
      if (!rail && !next) return;
      const dest = pattern.s.length - 1;
      candidates.push({ id: pattern.id, originWalkMinutes: 0, legs: [{
        id: pattern.id, operator: r[1] === 'KMB+CTB' ? 'KMB' : r[1], mode: r[5], routeNumber: r[2],
        originStop: networkStop(s, locale), destinationStop: networkStop(pattern.s[dest], locale),
        networkPattern: index, boardingIndex: position, alightingIndex: dest,
        scheduledDepartureMinutes: next ? Math.ceil(next.wait) : undefined, serviceStatus: rail ? 'UNVERIFIED' : 'TIMETABLE',
      }] });
    });
  });
  const unique = candidates.filter((r, i, all) => all.findIndex(other =>
    networkPatterns[other.legs![0].networkPattern!].r === networkPatterns[r.legs![0].networkPattern!].r
    && other.legs![0].destinationStop!.id === r.legs![0].destinationStop!.id) === i).slice(0, 24);
  await enrichJourneyArrivals(unique, now);
  return NextResponse.json({ data: unique.map(r => {
    const leg = r.legs![0];
    return { id: r.id, operator: leg.operator, number: leg.routeNumber, mode: leg.mode,
      destination: leg.destinationStop!.name, minutes: leg.realtimeEta?.etaMinutes ?? leg.scheduledDepartureMinutes ?? null,
      status: leg.serviceEnded ? 'NO_UPCOMING' : leg.serviceStatus };
  }).sort((a,b) => (a.minutes ?? 999) - (b.minutes ?? 999)), meta: { fetchedAt: now.toISOString(), stop: networkStop(stopIndex, locale) } },
  { headers: { 'Cache-Control': 'no-store' } });
}
