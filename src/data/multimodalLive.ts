import { getCitybusEta, getKmbStopEta, getKmbStops, type TransitStopRecord } from './hkTransitApi';
import { getStaticCitybusRouteStops, getStaticCitybusStops } from './citybusStopsStatic';
import { getStaticKmbRouteStops } from './kmbRouteStopsStatic';
import { networkPatterns, networkRoutes, networkStops } from './transportNetwork';
import { haversineKm } from '../engine/journeyHelpers';
import type { Segment, Route } from '../engine/UpgradedScoringEngine';
import { matchDepartureToTimetable } from './networkTimetable';
import { departureType, providerMarksScheduled } from '../domain/departureType';

type Train = { dest: string; time: string; valid?: string };
type RailResponse = { status: number; curr_time?: string; sys_time?: string;
  data?: Record<string, { UP?: Train[]; DOWN?: Train[]; curr_time?: string }> };
type LightResponse = { status: number; system_time: string; platform_list?: { route_list?: {
  route_no: string; dest_en: string; dest_ch: string; time_en: string; stop: number;
}[] }[] };
const cache = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function officialJson<T>(url: string): Promise<T> {
  const existing = cache.get(url);
  if (existing && existing.expires > Date.now()) return existing.value as T;
  if (inflight.has(url)) return inflight.get(url) as Promise<T>;
  const request = fetch(url, { signal: AbortSignal.timeout(4000), cache: 'no-store', headers: { Accept: 'application/json' } })
    .then(async response => {
      if (!response.ok) throw new Error('Live provider unavailable');
      const value: unknown = await response.json();
      cache.set(url, { expires: Date.now() + 20_000, value }); return value as T;
    }).finally(() => inflight.delete(url));
  inflight.set(url, request);
  return request;
}

/** MTR timestamps have no offset but always represent Hong Kong time. */
export function providerTimestamp(value: string): number {
  return Date.parse(value.replace(' ', 'T') + (/[Z+]/.test(value) ? '' : '+08:00'));
}
function fresh(value: string | undefined, now: Date) {
  if (!value) return false;
  return Math.abs(now.getTime() - providerTimestamp(value)) <= 120_000;
}
function attach(leg: Segment, predictions: { time: string; remark?: string; operator?: string }[], now: Date, earliest = 0) {
  const seen = new Set<string>();
  const departures = predictions.filter(prediction => {
    const minutes = (Date.parse(prediction.time) - now.getTime()) / 60000;
    const key = prediction.time + ':' + prediction.operator;
    if (!Number.isFinite(minutes) || minutes < Math.max(0, earliest) - 0.5 || seen.has(key)) return false;
    seen.add(key); return true;
  }).map(prediction => ({ ...prediction, minutes: Math.max(0, Math.ceil((Date.parse(prediction.time) - now.getTime()) / 60000)),
    ...matchDepartureToTimetable(leg.networkPattern!, leg.boardingIndex ?? 0,
      leg.alightingIndex ?? networkPatterns[leg.networkPattern!].s.length - 1, prediction.time, prediction.remark) }))
    .map(departure => ({ ...departure, departureType: departureType(departure)! }))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  if (!departures.length) return;
  leg.liveDepartures = departures;
  const scheduled = departures[0].departureType === 'SCHEDULED' || providerMarksScheduled(departures[0].remark);
  leg.realtimeEta = { etaMinutes: departures[0].minutes, dataTime: now.toISOString(), isLive: !scheduled, source: scheduled ? 'SCHEDULED' : 'DATAGOVHK' };
  leg.scheduledWaitMinutes = Math.max(0, departures[0].minutes - (leg.accessWalkMinutes ?? earliest));
  leg.scheduledDepartureMinutes = departures[0].minutes;
  leg.serviceStatus = scheduled ? 'TIMETABLE' : 'LIVE'; leg.serviceEnded = false;
}

function matchBusStops(leg: Segment, stops: TransitStopRecord[], citybus: boolean) {
  let match: { stop: string; dir: string; distance: number } | undefined;
  const byId = new Map(stops.map(s => [s.stop, s]));
  for (const bound of ['inbound', 'outbound'] as const) {
    const sequence = citybus ? getStaticCitybusRouteStops(leg.routeNumber!, bound) : getStaticKmbRouteStops(leg.routeNumber!, bound);
    if (!sequence) continue;
    for (let i = 0; i < sequence.length - 1; i++) {
      const a = byId.get(sequence[i].stop);
      if (!a) continue;
      const originDistance = haversineKm(a.lat, a.long, leg.originStop!.lat!, leg.originStop!.lng!);
      if (originDistance > 0.15) continue;
      for (let j = i + 1; j < sequence.length; j++) {
        const b = byId.get(sequence[j].stop);
        if (!b) continue;
        const destinationDistance = haversineKm(b.lat, b.long, leg.destinationStop!.lat!, leg.destinationStop!.lng!);
        const distance = originDistance + destinationDistance;
        if (destinationDistance <= 0.2 && (!match || distance < match.distance)) {
          match = { stop: a.stop, dir: bound === 'outbound' ? 'O' : 'I', distance };
        }
      }
    }
  }
  return match;
}

export async function enrichJourneyArrivals(routes: Route[], now = new Date()): Promise<void> {
  let kmbStops: TransitStopRecord[] = [];
  if (routes.some(r => r.legs?.[0] && ['KMB', 'LWB'].includes(r.legs[0].operator))) {
    try { kmbStops = await getKmbStops(); } catch { /* Published topology still works offline. */ }
  }
  const citybusStops = getStaticCitybusStops();
  await Promise.all(routes.map(async route => {
    // Live predictions at the current time do not describe a transfer reached
    // 30 minutes later. Enrich the initial boarding only.
    const leg = route.legs?.[0];
    if (!leg || leg.networkPattern === undefined || !leg.originStop || !leg.destinationStop) return;
    const pattern = networkPatterns[leg.networkPattern];
    const boarding = leg.boardingIndex ?? 0, alighting = leg.alightingIndex ?? pattern.s.length - 1;
    const origin = networkStops[pattern.s[boarding]];
    try {
      if (leg.mode === 'SUBWAY') {
        const data = await officialJson<RailResponse>(`https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${encodeURIComponent(leg.routeNumber!)}&sta=${origin[5]}`);
        if (data.status !== 1 || !fresh(data.curr_time ?? data.sys_time, now)) return;
        const station = data.data?.[`${leg.routeNumber}-${origin[5]}`];
        if (!station) return;
        // UP is the reverse of the published DT topology. Determine direction
        // from the train's actual destination in this branch's stop sequence.
        const trains = [...(station.UP ?? []), ...(station.DOWN ?? [])].filter(t => t.valid !== 'N');
        const usable = trains.filter(train => pattern.s.slice(alighting).some(index => networkStops[index][5] === train.dest));
        const arrivals = usable.map(t => ({ time: new Date(providerTimestamp(t.time)).toISOString() }));
        if (arrivals.length) attach(leg, arrivals, now, route.originWalkMinutes);
        else if (!trains.length) { leg.serviceEnded = true; leg.serviceStatus = 'LIVE'; }
      } else if (leg.mode === 'LIGHT_RAIL') {
        const data = await officialJson<LightResponse>(`https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule?station_id=${origin[0].split(':')[1]}`);
        if (data.status !== 1 || !fresh(data.system_time, now)) return;
        const terminus = networkStops[pattern.s[pattern.s.length - 1]];
        const rows = data.platform_list?.flatMap(p => p.route_list ?? []).filter(r => r.route_no === leg.routeNumber && r.stop === 0
          && (r.dest_ch === terminus[1] || r.dest_en.toLowerCase() === terminus[2].toLowerCase()));
        const minutes = rows?.map(r => /arriving|departing/i.test(r.time_en) ? 0 : Number.parseInt(r.time_en, 10))
          .filter(n => Number.isFinite(n) && n >= (route.originWalkMinutes ?? 0) - 0.5).sort((a,b) => a-b);
        if (minutes?.length) attach(leg, minutes.map(value => ({ time: new Date(now.getTime() + value * 60000).toISOString() })), now, route.originWalkMinutes);
      } else if (['KMB', 'LWB', 'CTB'].includes(leg.operator)) {
        const operators = leg.networkOperator?.includes('+') ? leg.networkOperator.split('+') : [leg.operator];
        const results = await Promise.allSettled(operators.map(async operator => {
          const citybus = operator === 'CTB';
          const match = matchBusStops(leg, citybus ? citybusStops : kmbStops, citybus);
          if (!match) return [];
          const rows = citybus ? await getCitybusEta(match.stop, leg.routeNumber!) : await getKmbStopEta(match.stop);
          return rows.filter(r => r.route === leg.routeNumber && r.dir === match.dir && r.eta
            && (!r.data_timestamp || fresh(r.data_timestamp, now)))
            .map(r => ({ time: r.eta!, operator, remark: [r.rmk_tc, r.rmk_en, 'remarks_tc' in r ? r.remarks_tc : '', 'remarks_en' in r ? r.remarks_en : ''].filter(Boolean).join(' · ') }));
        }));
        const predictions = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
        attach(leg, predictions, now, route.originWalkMinutes);
        // Empty ETA can mean an outage or a route without a prediction; keep
        // the published timetable rather than falsely declaring service ended.
      } else if (leg.operator === 'GMB') {
        const routeId = networkRoutes[pattern.r][0];
        const topology = await officialJson<{ data: { route_stops: { stop_seq: number; stop_id: number }[] } }>(
          `https://data.etagmb.gov.hk/route-stop/${routeId}/${pattern.d}`);
        const sequence = topology.data.route_stops;
        const position = sequence.findIndex((s, i) => String(s.stop_id) === origin[0]
          && sequence.slice(i + 1).some(next => String(next.stop_id) === leg.destinationStop!.id));
        if (position < 0) return;
        const data = await officialJson<{ generated_timestamp: string; data: { stop_id: number; eta: { timestamp: string }[] } }>(
          `https://data.etagmb.gov.hk/eta/route-stop/${routeId}/${pattern.d}/${sequence[position].stop_seq}`);
        if (String(data.data.stop_id) !== origin[0] || Math.abs(Date.parse(data.generated_timestamp) - now.getTime()) > 120000) return;
        attach(leg, data.data.eta.map(e => ({ time: e.timestamp })), now, route.originWalkMinutes);
      }
    } catch { /* Remain explicitly timetable-based / unverified. */ }
  }));
}
