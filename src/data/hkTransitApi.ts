export const HK_TRANSIT_API = {
  kmb: 'https://data.etabus.gov.hk/v1/transport/kmb',
  citybus: 'https://rt.data.gov.hk/v2/transport/citybus',
} as const;

const REQUEST_TIMEOUT_MS = 5000;

// Module-level Citybus stop cache: the provider has no bulk stop endpoint,
// so keep resolved coordinates across requests for a short period.
const citybusStopCache = new Map<string, { data: { stop: string; name_tc: string; name_en: string; lat: string; long: string }; expiresAt: number }>();
const citybusStopInflight = new Map<string, Promise<{ stop: string; name_tc: string; name_en: string; lat: string; long: string }>>();
const citybusRouteStopCache = new Map<string, { data: CitybusRouteStopRecord[]; expiresAt: number }>();

export interface KmbRouteRecord {
  route: string;
  bound: string;
  service_type: string;
  orig_tc: string;
  dest_tc: string;
}

export interface CitybusRouteRecord {
  co: string;
  route: string;
  orig_tc: string;
  dest_tc: string;
}

export interface TransitStopRecord {
  stop: string;
  name_tc: string;
  name_en: string;
  lat: number;
  long: number;
}

export interface KmbEtaRecord {
  route: string;
  dir: string;
  seq: number;
  dest_tc: string;
  eta: string | null;
  rmk_tc: string;
}

export interface KmbStopEtaRecord {
  route: string;
  dir: string;
  seq: number;
  dest_tc: string;
  dest_en: string;
  eta: string | null;
  rmk_tc: string;
}

export interface CitybusRouteStopRecord {
  co: string;
  route: string;
  dir: string;
  seq: number;
  stop: string;
  data_timestamp: string;
}

export interface CitybusEtaRecord {
  co: string;
  route: string;
  dir: string;
  seq: number;
  dest_tc: string;
  eta: string | null;
  remarks_tc: string;
}

export interface CitybusStopEtaRecord extends CitybusEtaRecord {
  stop: string;
  dest_en: string;
  eta_seq: number;
  rmk_tc: string;
  data_timestamp: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'KMB-Monthly-Pass-Mapper/1.0',
      },
      signal: controller.signal,
      next: { revalidate: 60 },
    });
    if (!response.ok) {
      throw new Error(`Transit provider returned HTTP ${response.status}.`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getKmbRoutes() {
  const payload = await fetchJson<{ data: KmbRouteRecord[] }>(
    `${HK_TRANSIT_API.kmb}/route/`,
  );
  return payload.data;
}

export async function getCitybusRoutes() {
  const payload = await fetchJson<{ data: CitybusRouteRecord[] }>(
    `${HK_TRANSIT_API.citybus}/route/ctb`,
  );
  return payload.data;
}

export async function getKmbStops() {
  const payload = await fetchJson<{ data: TransitStopRecord[] }>(
    `${HK_TRANSIT_API.kmb}/stop/`,
  );
  return payload.data;
}

export async function getCitybusStops() {
  const payload = await fetchJson<{ data: TransitStopRecord[] }>(
    `${HK_TRANSIT_API.citybus}/stop/ctb`,
  );
  return payload.data;
}

export async function getKmbEta(stopId: string, route: string) {
  const payload = await fetchJson<{ data: KmbEtaRecord[] }>(
    `${HK_TRANSIT_API.kmb}/eta/${encodeURIComponent(stopId)}/${encodeURIComponent(route)}`,
  );
  return payload.data;
}

export interface KmbRouteStopRecord {
  route: string;
  bound: string;
  service_type: string;
  seq: string;
  stop: string;
}

export async function getKmbRouteStops(route: string, bound: 'inbound' | 'outbound', serviceType = '1') {
  const payload = await fetchJson<{ data: KmbRouteStopRecord[] }>(
    `${HK_TRANSIT_API.kmb}/route-stop/${encodeURIComponent(route)}/${bound}/${encodeURIComponent(serviceType)}`,
  );
  return payload.data;
}

export async function getKmbStopEta(stopId: string) {
  const payload = await fetchJson<{ data: KmbStopEtaRecord[] }>(
    `${HK_TRANSIT_API.kmb}/stop-eta/${encodeURIComponent(stopId)}`,
  );
  return payload.data;
}

export async function getCitybusEta(stopId: string, route: string) {
  const payload = await fetchJson<{ data: CitybusEtaRecord[] }>(
    `${HK_TRANSIT_API.citybus}/eta/CTB/${encodeURIComponent(stopId)}/${encodeURIComponent(route)}`,
  );
  return payload.data;
}

export async function getCitybusStopEta(stopId: string) {
  // Citybus has no stop-level ETA endpoint: resolve the stop to its
  // (route, dir) pairs via route-stop, then fan out to per-route ETA.
  // Bounded: max routes scanned, small concurrency, early exit once found.
  const routes = await getCitybusRoutes();
  const seen = new Set<string>();
  const pairs: { route: string; dir: string }[] = [];
  const routeNumbers = Array.from(new Set(routes.map((r) => r.route)));
  const CONCURRENCY = 6;
  const MAX_SCAN = 120;
  let scanned = 0;
  let foundStop = false;

  async function scanRoute(route: string) {
    if (foundStop || scanned >= MAX_SCAN) return;
    scanned += 1;
    for (const dir of ['inbound', 'outbound'] as const) {
      if (foundStop) return;
      const key = `${route}|${dir}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const stops = await getCitybusRouteStops(route, dir);
        if (stops.some((s) => s.stop === stopId)) {
          pairs.push({ route, dir: dir === 'inbound' ? 'I' : 'O' });
          foundStop = true;
        }
      } catch {
        // route has no such direction; skip
      }
    }
  }

  // First pass: scan up to MAX_SCAN routes with bounded concurrency.
  for (let i = 0; i < Math.min(routeNumbers.length, MAX_SCAN); i += CONCURRENCY) {
    const batch = routeNumbers.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((route) => scanRoute(route)));
    if (foundStop) break;
  }

  const results: CitybusEtaRecord[] = [];
  for (const pair of pairs.slice(0, 12)) {
    try {
      const etas = await getCitybusEta(stopId, pair.route);
      results.push(...etas.filter((e) => e.dir === pair.dir));
    } catch {
      // ETA unavailable for this route; skip
    }
  }
  return results;
}

export async function getCitybusRouteStops(route: string, dir: 'inbound' | 'outbound') {
  const key = `${route}|${dir}`;
  const cached = citybusRouteStopCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const payload = await fetchJson<{ data: CitybusRouteStopRecord[] }>(
    `${HK_TRANSIT_API.citybus}/route-stop/CTB/${encodeURIComponent(route)}/${dir}`,
  );
  citybusRouteStopCache.set(key, { data: payload.data, expiresAt: Date.now() + 10 * 60 * 1000 });
  return payload.data;
}

export async function getCitybusStop(stopId: string) {
  const cached = citybusStopCache.get(stopId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const inflight = citybusStopInflight.get(stopId);
  if (inflight) {
    return inflight;
  }
  const request = fetchJson<{
    data: { stop: string; name_tc: string; name_en: string; lat: string; long: string };
  }>(`${HK_TRANSIT_API.citybus}/stop/${encodeURIComponent(stopId)}`)
    .then((payload) => {
      citybusStopCache.set(stopId, { data: payload.data, expiresAt: Date.now() + 10 * 60 * 1000 });
      return payload.data;
    })
    .finally(() => {
      citybusStopInflight.delete(stopId);
    });
  citybusStopInflight.set(stopId, request);
  return request;
}
