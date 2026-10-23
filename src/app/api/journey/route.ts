import { NextRequest, NextResponse } from 'next/server';
import {
  getCitybusEta,
  getCitybusRouteStops,
  getCitybusRoutes,
  getKmbRouteStops,
  getKmbStopEta,
  getKmbStops,
  type TransitStopRecord,
} from '../../../data/hkTransitApi';
import { getStaticCitybusStops, STATIC_CITYBUS_ROUTES } from '../../../data/citybusStopsStatic';
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

import {
  deriveHeadway,
  etaMinutes,
  routeEtaMinutes,
  type JourneyBound,
} from '../../../engine/journeyHelpers';

// Average urban bus speed in km/min used to estimate in-vehicle time
// from the straight-line distance between boarding and alighting stops.
const BUS_SPEED_KM_MIN = 0.3; // ~18 km/h including stops and traffic

function estimateRideMinutes(
  from: TransitStopRecord,
  to: TransitStopRecord,
): number {
  const km = haversineKm(
    Number(from.lat),
    Number(from.long),
    Number(to.lat),
    Number(to.long),
  );
  // Straight-line distance underestimates road distance; apply a 1.35
  // winding factor, then convert to minutes at bus speed.
  return Math.max(4, Math.round((km * 1.35) / BUS_SPEED_KM_MIN));
}

// KMB urban fare estimate by distance (adult Octopus). Actual fares vary
// by route and distance band; this approximates the official fare table.
function estimateFare(from: TransitStopRecord, to: TransitStopRecord): number {
  const km = haversineKm(
    Number(from.lat),
    Number(from.long),
    Number(to.lat),
    Number(to.long),
  );
  const roadKm = km * 1.35;
  if (roadKm <= 3.5) return 5.8; // short urban
  if (roadKm <= 7) return 6.8; // mid urban
  if (roadKm <= 12) return 8.7; // cross-district
  if (roadKm <= 20) return 12.5; // long haul
  return 15.5; // inter-district / new territories
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
  const rawFromLat = params.get('fromLat');
  const rawFromLon = params.get('fromLon');
  const rawToLat = params.get('toLat');
  const rawToLon = params.get('toLon');
  if (!rawFromLat || !rawFromLon || !rawToLat || !rawToLon) {
    return badRequest('fromLat, fromLon, toLat and toLon are required.');
  }
  const fromLat = Number(rawFromLat);
  const fromLon = Number(rawFromLon);
  const toLat = Number(rawToLat);
  const toLon = Number(rawToLon);
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
    const journeyStartedAt = Date.now();
    const [stops, citybusRoutes] = await Promise.all([
      getKmbStops(),
      getCitybusRoutes(),
    ]);
    const fromStops = nearestStops(stops, fromLat, fromLon, NEARBY_STOP_LIMIT);
    // Destination stops use a wider radius: the alighting stop is often
    // further from the destination point than the boarding stop is from
    // the origin.
    const toStops = nearestStops(stops, toLat, toLon, NEARBY_STOP_LIMIT_WIDE);

    // Citybus has no bulk stop-list endpoint (returns an empty object), so
    // use the static cross-harbour stop catalog (fetched by
    // scripts/fetch-citybus-stops.mjs) for coordinates, then scan route-stop
    // sequences to match origin/destination stops in order.
    const citybusStops = getStaticCitybusStops();
    const cityFromStops = nearestStops(citybusStops, fromLat, fromLon, NEARBY_STOP_LIMIT);
    const cityToStops = nearestStops(citybusStops, toLat, toLon, NEARBY_STOP_LIMIT_WIDE);

    // Fetch cross-harbour route-stop sequences live (they change less often
    // and are cached in-memory by the data module).
    const citybusRouteRows = await Promise.all(
      STATIC_CITYBUS_ROUTES.flatMap((routeNum) =>
        (['outbound', 'inbound'] as const).map(async (bound) => {
          try {
            return { routeNum, bound, rows: await getCitybusRouteStops(routeNum, bound) };
          } catch {
            return { routeNum, bound, rows: [] };
          }
        }),
      ),
    );

    const citybusCandidates: {
      route: string;
      bound: JourneyBound;
      fromStop: TransitStopRecord;
      toStop: TransitStopRecord;
      fromWalk: number;
      toWalk: number;
    }[] = [];
    const seenCitybus = new Set<string>();
    const scanCitybusStops = async () => {
      // For each cross-harbour route, find origin/destination stops in order
      // using geographic distance from the origin/destination points.
      let scanCount = 0;
      for (const result of citybusRouteRows) {
        if (citybusCandidates.length >= MAX_CANDIDATE_ROUTES) break;
        const { routeNum, bound, rows } = result;
        if (!rows || rows.length === 0) continue;
        const fromMatch: { entry: (typeof citybusStops)[number]; index: number; walk: number } | null = (() => {
          let best: { entry: (typeof citybusStops)[number]; index: number; walk: number } | null = null;
          for (const row of rows) {
            const stop = citybusStops.find((s) => s.stop === row.stop);
            if (!stop) continue;
            const walk = Math.round(haversineKm(fromLat, fromLon, Number(stop.lat), Number(stop.long)) / WALK_KM_PER_MIN);
            if (walk > MAX_WALK_MINUTES) continue;
            const index = rows.findIndex((r) => r.stop === row.stop);
            if (!best || walk < best.walk) best = { entry: stop, index, walk };
          }
          return best;
        })();
        if (!fromMatch) continue;
        let toMatch: { entry: (typeof citybusStops)[number]; index: number; walk: number } | null = null;
        for (const row of rows) {
          const index = rows.findIndex((r) => r.stop === row.stop);
          if (index <= fromMatch.index) continue;
          const stop = citybusStops.find((s) => s.stop === row.stop);
          if (!stop) continue;
          const walk = Math.round(haversineKm(toLat, toLon, Number(stop.lat), Number(stop.long)) / WALK_KM_PER_MIN);
          if (walk > MAX_WALK_MINUTES) continue;
          if (!toMatch || walk < toMatch.walk) toMatch = { entry: stop, index, walk };
        }
        if (!toMatch) continue;
        const key = `${routeNum}|${bound}|${fromMatch.entry.stop}|${toMatch.entry.stop}`;
        if (seenCitybus.has(key)) continue;
        seenCitybus.add(key);
        citybusCandidates.push({
          route: routeNum,
          bound,
          fromStop: fromMatch.entry,
          toStop: toMatch.entry,
          fromWalk: fromMatch.walk,
          toWalk: toMatch.walk,
        });
      }
    };
    await scanCitybusStops();

    const toIds = new Set(toStops.map((s) => s.stop.stop));
    const toStopById = new Map(toStops.map((s) => [s.stop.stop, s]));
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

    // Transfer routes: when direct options are limited, find one-transfer
    // journeys via a common intermediate stop served by both an origin-side
    // route and a destination-side route.
    const transferCandidates: {
      routeA: string;
      boundA: string;
      fromStop: TransitStopRecord;
      transferStop: TransitStopRecord;
      routeB: string;
      boundB: string;
      toStop: TransitStopRecord;
      fromWalk: number;
      toWalk: number;
    }[] = [];

    if (candidates.length < MAX_RESULTS) {
      const MAX_TRANSFER_ROUTES = 8;
      // Routes serving origin stops (from stop-eta).
      const originRoutes = new Map<string, Set<string>>(); // stopId -> routes
      for (const entry of fromStops) {
        try {
          const etas = await getKmbStopEta(entry.stop.stop);
          const rs = new Set(etas.map((e) => e.route));
          if (rs.size > 0) originRoutes.set(entry.stop.stop, rs);
        } catch {
          continue;
        }
      }

      // Build stop->routes index for origin-side routes (via route-stop).
      // Store BOTH bounds so transfer search can find the right direction.
      const originRouteStops = new Map<string, Map<string, number>>(); // route|bound -> stop->seq
      let scanned = 0;
      for (const [stopId, rs] of Array.from(originRoutes)) {
        for (const route of Array.from(rs)) {
          if (scanned >= MAX_TRANSFER_ROUTES * 2) break;
          for (const bound of ['outbound', 'inbound'] as const) {
            const key = `${route}|${bound}`;
            if (originRouteStops.has(key)) continue;
            try {
              const rows = await getKmbRouteStops(route, bound, '1');
              if (!rows || rows.length === 0) continue;
              const m = new Map<string, number>();
              rows.forEach((row, i) => {
                if (!m.has(row.stop)) m.set(row.stop, i);
              });
              originRouteStops.set(key, m);
              scanned++;
            } catch {
              continue;
            }
          }
        }
        if (scanned >= MAX_TRANSFER_ROUTES * 2) break;
      }

      // Find transfer points: stops on an origin route after boarding that
      // are served by routes reaching a destination stop.
      const seenTransfers = new Set<string>();

      for (const [key, stopSeq] of Array.from(originRouteStops)) {
        if (transferCandidates.length >= MAX_CANDIDATE_ROUTES) break;
        const [routeA, boundA] = key.split('|');
        // Boarding stop on routeA before transfer.
        let fromStop: TransitStopRecord | null = null;
        let fromIdx = Number.POSITIVE_INFINITY;
        for (const entry of fromStops) {
          const idx = stopSeq.get(entry.stop.stop);
          if (idx !== undefined && idx < fromIdx) {
            fromIdx = idx;
            fromStop = entry.stop;
          }
        }
        if (!fromStop) continue;

        // For each stop on routeA after boarding, check if it's served by
        // routes that reach a destination stop.
        for (const [transferId, transferIdx] of Array.from(stopSeq)) {
          if (transferIdx <= fromIdx) continue;
          if (transferCandidates.length >= MAX_CANDIDATE_ROUTES) break;

          // Find routes serving this transfer stop (via stop-eta).
          let transferRoutes: Set<string>;
          try {
            const etas = await getKmbStopEta(transferId);
            transferRoutes = new Set(etas.map((e) => e.route));
          } catch {
            continue;
          }
          if (transferRoutes.size === 0) continue;

          // For each route serving the transfer stop, check if it reaches
          // a destination stop after the transfer.
          for (const routeB of Array.from(transferRoutes)) {
            if (transferCandidates.length >= MAX_CANDIDATE_ROUTES) break;
            if (routeB === routeA) continue;
            for (const boundB of ['outbound', 'inbound'] as const) {
              if (transferCandidates.length >= MAX_CANDIDATE_ROUTES) break;
              let rowsB;
              try {
                rowsB = await getKmbRouteStops(routeB, boundB, '1');
              } catch {
                continue;
              }
              if (!rowsB || rowsB.length === 0) continue;
              const seqB = new Map<string, number>();
              rowsB.forEach((row, i) => {
                if (!seqB.has(row.stop)) seqB.set(row.stop, i);
              });
              const tIdxB = seqB.get(transferId);
              if (tIdxB === undefined) continue;

              // Destination stop on routeB after transfer.
              let destStop: TransitStopRecord | null = null;
              let destIdx = Number.POSITIVE_INFINITY;
              for (const entry of toStops) {
                const idx = seqB.get(entry.stop.stop);
                if (idx !== undefined && idx > tIdxB && idx < destIdx) {
                  destIdx = idx;
                  destStop = entry.stop;
                }
              }
              if (!destStop) continue;

              const transferStop = stops.find((s) => s.stop === transferId);
              if (!transferStop) continue;
              const pairKey = `${routeA}|${transferId}|${routeB}|${destStop.stop}`;
              if (seenTransfers.has(pairKey)) continue;
              seenTransfers.add(pairKey);
              transferCandidates.push({
                routeA,
                boundA,
                fromStop,
                transferStop,
                routeB,
                boundB,
                toStop: destStop,
                fromWalk: fromStops.find((e) => e.stop.stop === fromStop!.stop)?.walkMinutes ?? 0,
                toWalk: toStops.find((e) => e.stop.stop === destStop.stop)?.walkMinutes ?? 0,
              });
              break; // one transfer per route pair is enough
            }
          }
        }
      }
    }

    // Build direct KMB journey routes.
    const journeyRoutes: Route[] = [];
    for (const candidate of candidates.slice(0, MAX_RESULTS * 2)) {
      let firstEta: number | null = null;
      let headway = 10; // default scheduled interval (minutes)
      try {
        const etas = await getKmbStopEta(candidate.fromStop.stop);
        const routeEtas = routeEtaMinutes(
          etas,
          candidate.route,
          candidate.bound as JourneyBound,
        );
        if (routeEtas.length > 0) {
          firstEta = routeEtas[0];
        }
        headway = deriveHeadway(routeEtas);
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
            journeyTimeMinutes: estimateRideMinutes(candidate.fromStop, candidate.toStop),
            scheduledIntervalMinutes: headway,
            realtimeEta:
              firstEta === null
                ? null
                : {
                    etaMinutes: firstEta,
                    dataTime: new Date().toISOString(),
                    isLive: true,
                    source: 'DATAGOVHK',
                  },
            // KMB distance-based fare estimate (adult Octopus).
            fare: estimateFare(candidate.fromStop, candidate.toStop),
          },
        ],
      });
    }

    // Build direct Citybus journey routes for cross-harbour coverage.
    for (const candidate of citybusCandidates.slice(0, MAX_RESULTS * 2)) {
      let firstEta: number | null = null;
      try {
        const etas = await getCitybusEta(candidate.fromStop.stop, candidate.route);
        const routeEtas = routeEtaMinutes(etas, candidate.route, candidate.bound);
        firstEta = routeEtas[0] ?? null;
      } catch {
        firstEta = null;
      }
      journeyRoutes.push({
        id: `journey-ctb-${candidate.route}-${candidate.bound}-${candidate.fromStop.stop}`,
        walkTransferTimeMinutes: candidate.fromWalk + candidate.toWalk,
        transferCount: 0,
        legs: [
          {
            id: `leg-ctb-${candidate.route}`,
            operator: 'CTB',
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
            journeyTimeMinutes: estimateRideMinutes(candidate.fromStop, candidate.toStop),
            scheduledIntervalMinutes: 10,
            realtimeEta:
              firstEta === null
                ? null
                : { etaMinutes: firstEta, dataTime: new Date().toISOString(), isLive: true, source: 'DATAGOVHK' },
            fare: estimateFare(candidate.fromStop, candidate.toStop),
          },
        ],
      });
    }

    const scored = scoreRoutes(journeyRoutes).slice(0, MAX_RESULTS);

    // Build transfer (1-transfer) journey routes when direct results are few.
    if (scored.length < MAX_RESULTS && transferCandidates.length > 0) {
      const transferRoutes: Route[] = [];
      for (const tc of transferCandidates.slice(0, MAX_RESULTS - scored.length)) {
        let etaA: number | null = null;
        let headwayA = 10;
        try {
          const etas = await getKmbStopEta(tc.fromStop.stop);
          const routeEtas = routeEtaMinutes(etas, tc.routeA, tc.boundA as JourneyBound);
          if (routeEtas.length > 0) etaA = routeEtas[0];
          headwayA = deriveHeadway(routeEtas);
        } catch {
          etaA = null;
        }

        const rideA = estimateRideMinutes(tc.fromStop, tc.transferStop);
        const rideB = estimateRideMinutes(tc.transferStop, tc.toStop);
        const transferWalk = 3; // assumed transfer walk at interchange

        transferRoutes.push({
          id: `journey-t-${tc.routeA}-${tc.routeB}-${tc.transferStop.stop}`,
          walkTransferTimeMinutes: tc.fromWalk + tc.toWalk + transferWalk,
          transferCount: 1,
          legs: [
            {
              id: `leg-a-${tc.routeA}`,
              operator: 'KMB',
              mode: 'BUS',
              routeNumber: tc.routeA,
              originStop: {
                id: tc.fromStop.stop,
                name: tc.fromStop.name_tc || tc.fromStop.name_en,
                lat: Number(tc.fromStop.lat),
                lng: Number(tc.fromStop.long),
              },
              destinationStop: {
                id: tc.transferStop.stop,
                name: tc.transferStop.name_tc || tc.transferStop.name_en,
                lat: Number(tc.transferStop.lat),
                lng: Number(tc.transferStop.long),
              },
              journeyTimeMinutes: rideA,
              scheduledIntervalMinutes: headwayA,
              realtimeEta:
                etaA === null
                  ? null
                  : { etaMinutes: etaA, dataTime: new Date().toISOString(), isLive: true, source: 'DATAGOVHK' },
              fare: estimateFare(tc.fromStop, tc.transferStop),
            },
            {
              id: `leg-b-${tc.routeB}`,
              operator: 'KMB',
              mode: 'BUS',
              routeNumber: tc.routeB,
              originStop: {
                id: tc.transferStop.stop,
                name: tc.transferStop.name_tc || tc.transferStop.name_en,
                lat: Number(tc.transferStop.lat),
                lng: Number(tc.transferStop.long),
              },
              destinationStop: {
                id: tc.toStop.stop,
                name: tc.toStop.name_tc || tc.toStop.name_en,
                lat: Number(tc.toStop.lat),
                lng: Number(tc.toStop.long),
              },
              journeyTimeMinutes: rideB,
              scheduledIntervalMinutes: 10,
              realtimeEta: null,
              fare: estimateFare(tc.transferStop, tc.toStop),
            },
          ],
        });
      }
      const scoredTransfers = scoreRoutes(transferRoutes);
      const merged = [...scored, ...scoredTransfers]
        .sort((a, b) => a.finalScore - b.finalScore)
        .slice(0, MAX_RESULTS);
      return NextResponse.json(
        {
          data: merged,
          meta: {
            source: 'KMB/Citybus route/stop/ETA APIs',
            live: true,
            durationMs: Date.now() - journeyStartedAt,
            candidates: candidates.length,
            transfers: transferCandidates.length,
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
    }

    return NextResponse.json(
      {
        data: scored,
        meta: {
          source: 'KMB/Citybus route/stop/ETA APIs',
          live: true,
          durationMs: Date.now() - journeyStartedAt,
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
