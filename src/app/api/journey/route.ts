import { NextRequest, NextResponse } from 'next/server';
import {
  getKmbRouteStops,
  getKmbStopEta,
  getKmbStops,
  type TransitStopRecord,
} from '../../../data/hkTransitApi';
import { scoreRoutes, type Route } from '../../../engine/UpgradedScoringEngine';
import { getRateLimiter } from '../../../lib/cloudflare';

export const dynamic = 'force-dynamic';

const MAX_CANDIDATE_ROUTES = 40;
const MAX_RESULTS = 6;
const NEARBY_STOP_LIMIT = 5;
const NEARBY_STOP_LIMIT_WIDE = 15;
const WALK_KM_PER_MIN = 5 / 60; // 5 km/h walking speed
const MAX_WALK_MINUTES = 25; // cap: ignore stops further than a 25-min walk

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const a =
    s1 * s1 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestStops(
  stops: TransitStopRecord[],
  lat: number,
  lon: number,
  limit: number,
): { stop: TransitStopRecord; walkMinutes: number }[] {
  return stops
    .map((stop) => {
      const km = haversineKm(lat, lon, Number(stop.lat), Number(stop.long));
      return { stop, walkMinutes: Math.round(km / WALK_KM_PER_MIN) };
    })
    .filter((s) => s.walkMinutes <= MAX_WALK_MINUTES)
    .sort((a, b) => a.walkMinutes - b.walkMinutes)
    .slice(0, limit);
}

function etaMinutes(eta: string | null): number | null {
  if (!eta) return null;
  const minutes = Math.round((new Date(eta).getTime() - Date.now()) / 60000);
  return minutes < 0 ? 0 : minutes;
}

export async function GET(request: NextRequest) {
  const ipAddress =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  const rateLimiter = await getRateLimiter();
  if (rateLimiter) {
    const result = await rateLimiter.limit({ key: `journey:${ipAddress}` });
    if (!result.success) {
      return NextResponse.json(
        { error: 'Too many journey requests. Please try again shortly.' },
        { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } },
      );
    }
  }

  const params = request.nextUrl.searchParams;
  const fromLat = Number(params.get('fromLat'));
  const fromLon = Number(params.get('fromLon'));
  const toLat = Number(params.get('toLat'));
  const toLon = Number(params.get('toLon'));
  if (
    !Number.isFinite(fromLat) ||
    !Number.isFinite(fromLon) ||
    !Number.isFinite(toLat) ||
    !Number.isFinite(toLon) ||
    Math.abs(fromLat) > 90 ||
    Math.abs(toLat) > 90 ||
    Math.abs(fromLon) > 180 ||
    Math.abs(toLon) > 180
  ) {
    return badRequest('fromLat, fromLon, toLat and toLon are required.');
  }

  try {
    const [, stops] = await Promise.all([Promise.resolve(), getKmbStops()]);
    const fromStops = nearestStops(stops, fromLat, fromLon, NEARBY_STOP_LIMIT);
    // Destination stops use a wider radius: the alighting stop is often
    // further from the destination point than the boarding stop is from
    // the origin (e.g. Central ferry piers vs the stop cluster).
    const toStops = nearestStops(stops, toLat, toLon, NEARBY_STOP_LIMIT_WIDE);

    // Candidate routes: for each nearby origin stop, ask the stop-eta API
    // which routes serve it (1 call per stop), then confirm the route actually
    // reaches a destination stop via route-stop (1 call per candidate route).
    const candidates: {
      route: string;
      bound: string;
      serviceType: string;
      fromStop: TransitStopRecord;
      toStop: TransitStopRecord;
      fromWalk: number;
      toWalk: number;
    }[] = [];
    const seenPairs = new Set<string>();

    const toIds = new Set(toStops.map((s) => s.stop.stop));
    const toStopById = new Map(toStops.map((s) => [s.stop.stop, s]));

    const scanFromStops = async (
      pool: { stop: TransitStopRecord; walkMinutes: number }[],
    ) => {
      for (const entry of pool) {
        if (candidates.length >= MAX_CANDIDATE_ROUTES) break;
        let etas;
        try {
          etas = await getKmbStopEta(entry.stop.stop);
        } catch {
          continue;
        }
        if (!etas || etas.length === 0) continue;
        const routesAtStop = new Set(etas.map((e) => e.route));
        for (const route of Array.from(routesAtStop)) {
          if (candidates.length >= MAX_CANDIDATE_ROUTES) break;
          for (const bound of ['outbound', 'inbound'] as const) {
            let rows;
            try {
              rows = await getKmbRouteStops(route, bound, '1');
            } catch {
              continue;
            }
            if (!rows || rows.length === 0) continue;
            const seqByStop = new Map<string, number>();
            rows.forEach((row, index) => {
              if (!seqByStop.has(row.stop)) seqByStop.set(row.stop, index);
            });
            let bestTo: string | null = null;
            let bestIdx = Number.POSITIVE_INFINITY;
            for (const toId of Array.from(toIds)) {
              const toIdx = seqByStop.get(toId);
              if (toIdx === undefined || toIdx <= 0) continue;
              if (toIdx < bestIdx) {
                bestIdx = toIdx;
                bestTo = toId;
              }
            }
            if (bestTo) {
              const pairKey = `${route}|${bound}|${entry.stop.stop}|${bestTo}`;
              if (seenPairs.has(pairKey)) continue;
              seenPairs.add(pairKey);
              candidates.push({
                route,
                bound,
                serviceType: '1',
                fromStop: entry.stop,
                toStop: toStopById.get(bestTo)!.stop,
                fromWalk: entry.walkMinutes,
                toWalk: toStopById.get(bestTo)!.walkMinutes,
              });
            }
          }
        }
      }
    };

    await scanFromStops(fromStops);
    if (candidates.length === 0) {
      // Wider net: more origin stops so journeys boarding further away match.
      const wideFromStops = nearestStops(stops, fromLat, fromLon, NEARBY_STOP_LIMIT_WIDE);
      await scanFromStops(wideFromStops);
    }

    // Attach live ETA for the boarding stop of each candidate.
    const journeyRoutes: Route[] = [];
    for (const candidate of candidates.slice(0, MAX_RESULTS * 2)) {
      let firstEta: number | null = null;
      try {
        const etas = await getKmbStopEta(candidate.fromStop.stop);
        const match = etas.find(
          (e) => e.route === candidate.route && e.eta,
        );
        firstEta = etaMinutes(match?.eta ?? null);
      } catch {
        firstEta = null;
      }
      journeyRoutes.push({
        id: `journey-${candidate.route}-${candidate.bound}-${candidate.fromStop.stop}`,
        walkTransferTimeMinutes: candidate.fromWalk + candidate.toWalk,
        transferCount: 0,
        legs: [
          {
            id: `leg-${candidate.route}`,
            operator: 'KMB',
            mode: 'BUS',
            routeNumber: candidate.route,
            originStop: {
              id: candidate.fromStop.stop,
              name: candidate.fromStop.name_tc || candidate.fromStop.name_en,
              lat: Number(candidate.fromStop.lat),
              lng: Number(candidate.fromStop.long),
            },
            destinationStop: {
              id: candidate.toStop.stop,
              name: candidate.toStop.name_tc || candidate.toStop.name_en,
              lat: Number(candidate.toStop.lat),
              lng: Number(candidate.toStop.long),
            },
            journeyTimeMinutes: 20,
            scheduledIntervalMinutes: 10,
            realtimeEta:
              firstEta === null
                ? null
                : {
                    etaMinutes: firstEta,
                    dataTime: new Date().toISOString(),
                    isLive: true,
                    source: 'DATAGOVHK',
                  },
            fare: 0,
          },
        ],
      });
    }

    const scored = scoreRoutes(journeyRoutes).slice(0, MAX_RESULTS);
    return NextResponse.json(
      {
        data: scored,
        meta: {
          source: 'KMB route/stop/ETA APIs',
          live: true,
          candidates: candidates.length,
          fromStops: fromStops.map((s) => ({
            stop: s.stop.stop,
            name: s.stop.name_tc || s.stop.name_en,
            walkMinutes: s.walkMinutes,
          })),
          toStops: toStops.map((s) => ({
            stop: s.stop.stop,
            name: s.stop.name_tc || s.stop.name_en,
            walkMinutes: s.walkMinutes,
          })),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Journey provider unavailable.',
        meta: { live: false },
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
