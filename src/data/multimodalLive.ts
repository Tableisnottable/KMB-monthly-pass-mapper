import { getCitybusEta, getKmbStopEta, getKmbStops, type TransitStopRecord } from './hkTransitApi';
import { getStaticCitybusRouteStops, getStaticCitybusStops } from './citybusStopsStatic';
import { getStaticKmbRouteStops } from './kmbRouteStopsStatic';
import { networkPatterns, networkRoutes, networkStops, networkStop, type NetworkPattern, type NetworkRoute } from './transportNetwork';
import { haversineKm } from '../engine/journeyHelpers';
import type { Segment, Route } from '../engine/UpgradedScoringEngine';
import { classifyDepartureTypes, compareDepartureToTimetable, matchDepartureToTimetable, runMinutesNearPrediction, type LiveDeparture } from './networkTimetable';
import { normalizeTransitQuery } from './networkPlaceSearch';
import { departureTimingType, departureType, isNonOperatingDeparture, providerMarksAdditional, providerMarksCancelled, providerMarksMissed, providerMarksScheduled, providerMarksSpecial } from '../domain/departureType';
import type { NotificationTarget } from '../domain/journeyNotifications';

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
type ArrivalScope = 'journey' | 'route-stop' | 'terminal';
type Prediction = Pick<LiveDeparture, 'remark' | 'operator' | 'destinationTc' | 'destinationEn'> & {
  time: string | null;
  timetable?: { index: number; boarding: number; alighting: number };
  destinationChecked?: boolean;
};

function attach(leg: Segment, predictions: Prediction[], now: Date, earliest = 0) {
  leg.departureNotices = predictions.filter(isNonOperatingDeparture).map(row => ({
    departureType: providerMarksMissed(row.remark) && !providerMarksCancelled(row.remark) ? 'MISSED' : 'CANCELLED', operator: row.operator, remark: row.remark!,
    time: row.time && Number.isFinite(Date.parse(row.time)) ? row.time : undefined,
    ...(row.destinationTc ? { destinationTc: row.destinationTc } : {}),
    ...(row.destinationEn ? { destinationEn: row.destinationEn } : {}),
  }));
  const selected = leg.networkPattern!, boarding = leg.boardingIndex ?? 0;
  const groups = new Map<number, Map<number, LiveDeparture[]>>();
  const departures: LiveDeparture[] = [];
  for (const { time, timetable, destinationChecked, ...prediction } of predictions) {
    if (!time || isNonOperatingDeparture(prediction)) continue;
    const minutes = (Date.parse(time) - now.getTime()) / 60000;
    // Distinct provider rows can share an ETA (for example B10).
    if (!Number.isFinite(minutes) || minutes < Math.max(0, earliest) - 0.5) continue;
    const match = timetable ?? (destinationChecked ? undefined : {
      index: selected, boarding, alighting: leg.alightingIndex ?? networkPatterns[selected].s.length - 1,
    });
    const row: LiveDeparture = { ...prediction, time, minutes: Math.max(0, Math.ceil(minutes)),
      timingType: providerMarksScheduled(prediction.remark) ? 'SCHEDULED' : 'LIVE',
      scheduleMatch: 'UNVERIFIED',
      ...(destinationChecked ? { timetablePatternId: match ? networkPatterns[match.index].id : null } : {}),
    };
    if (match) {
      Object.assign(row, compareDepartureToTimetable(match.index, match.boarding, time),
        matchDepartureToTimetable(match.index, match.boarding, match.alighting, time, prediction.remark));
    }
    if (match && !providerMarksSpecial(prediction.remark)) {
      let byStop = groups.get(match.index);
      if (!byStop) { byStop = new Map(); groups.set(match.index, byStop); }
      const rows = byStop.get(match.boarding);
      if (rows) rows.push(row); else byStop.set(match.boarding, [row]);
    } else {
      if (providerMarksAdditional(prediction.remark)) { row.scheduleMatch = 'ADDED'; row.addedReason = 'PROVIDER'; }
      else if (row.addedReason === 'NOT_IN_TIMETABLE') { row.scheduleMatch = 'UNVERIFIED'; delete row.addedReason; }
      row.departureType = departureType(row);
      departures.push(row);
    }
  }
  groups.forEach((byStop, index) => {
    byStop.forEach((rows, position) => departures.push(...classifyDepartureTypes(index, position, rows)));
  });
  departures.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  if (!departures.length) return;
  leg.liveDepartures = departures;
  const scheduled = departureTimingType(departures[0]) === 'SCHEDULED';
  leg.realtimeEta = { etaMinutes: departures[0].minutes, dataTime: now.toISOString(), isLive: !scheduled, source: scheduled ? 'SCHEDULED' : 'DATAGOVHK' };
  leg.scheduledWaitMinutes = Math.max(0, departures[0].minutes - (leg.accessWalkMinutes ?? earliest));
  leg.scheduledDepartureMinutes = departures[0].minutes;
  leg.serviceStatus = scheduled ? 'TIMETABLE' : 'LIVE'; leg.serviceEnded = false;
}

interface BusVariant {
  index: number;
  pattern: NetworkPattern;
  names: Set<string>;
}

const busVariantsByNumber = new Map<string, BusVariant[]>();
function stopNames(stop: number) {
  return networkStops[stop].slice(1, 3).flatMap(value => {
    const name = String(value);
    return [name, name.split(/[,，]/)[0]].map(normalizeTransitQuery);
  });
}

function variantNames(pattern: NetworkPattern, route: NetworkRoute) {
  const origin = stopNames(pattern.s[0]), destination = stopNames(pattern.s.at(-1)!);
  const names = new Set(destination);
  for (const label of [route[3], route[4]]) {
    const parts = label.split(/\s+[-–—]\s+/).map(normalizeTransitQuery);
    if (parts.length !== 2) continue;
    const [first, last] = parts;
    if (origin.includes(first) || destination.includes(last)) names.add(last);
    else if (origin.includes(last) || destination.includes(first)) names.add(first);
  }
  if (route[1] === 'CTB' && route[0] === '8715') {
    // The fare-stop and GTFS route names use different forms of this terminus.
    for (const alias of ['旺角', 'Mong Kok', '旺角（弼街）', 'Mong Kok (Bute Street)']) names.add(normalizeTransitQuery(alias));
  }
  return names;
}

function busVariants(number: string) {
  let variants = busVariantsByNumber.get(number);
  if (!variants) {
    variants = networkPatterns.flatMap((pattern, index) => {
      const route = networkRoutes[pattern.r];
      return route[2] === number && route[5] === 'BUS' ? [{ index, pattern, names: variantNames(pattern, route) }] : [];
    });
    busVariantsByNumber.set(number, variants);
  }
  return variants;
}

/** Match to onward patterns at this stop before using a bus for a connection or timetable inference. */
function busPrediction(leg: Segment, prediction: Prediction, scope: ArrivalScope): Prediction | undefined {
  const names = [prediction.destinationTc, prediction.destinationEn].filter((name): name is string => !!name).map(normalizeTransitQuery);
  if (!names.length) return prediction;
  const index = leg.networkPattern!, pattern = networkPatterns[index];
  const boarding = leg.boardingIndex ?? 0, alighting = leg.alightingIndex ?? pattern.s.length - 1;
  const boardStop = pattern.s[boarding], alightStop = pattern.s[alighting];
  const variants = busVariants(leg.routeNumber!).filter(variant => (networkRoutes[variant.pattern.r][1].split('+').includes(prediction.operator!)));
  const matches = variants.filter(variant => names.some(name => variant.names.has(name)));
  const atStop = matches.flatMap(variant => variant.pattern.s.flatMap((stop, position) =>
    stop === boardStop && position < variant.pattern.s.length - 1 && variant.pattern.p[position] === 0
      ? [{ ...variant, position }] : []));
  if (atStop.length) {
    const compatible = scope === 'route-stop' ? atStop : atStop.filter(variant => scope === 'terminal'
      ? variant.pattern.s.at(-1) === alightStop
      : variant.pattern.s.indexOf(alightStop, variant.position + 1) >= 0);
    if (!compatible.length || (scope === 'journey' && compatible.length !== atStop.length)) return undefined;
    // This also handles circular services where a stop occurs more than once.
    const selected = compatible.find(variant => variant.index === index && variant.position === boarding);
    const first = selected ?? compatible[0];
    const onward = first.pattern.s.slice(first.position);
    const sameService = compatible.every(variant => variant.pattern.r === first.pattern.r
      && variant.pattern.s.length - variant.position === onward.length
      && onward.every((stop, offset) => variant.pattern.s[variant.position + offset] === stop));
    return { ...prediction, destinationChecked: true, timetable: sameService ? {
      index: first.index, boarding: first.position,
      alighting: scope === 'journey' ? first.pattern.s.indexOf(alightStop, first.position + 1) : first.pattern.s.length - 1,
    } : undefined };
  }
  // Some operator-only short turns have no published pattern. Check whether
  // the named endpoint is an intermediate stop before using it for a journey.
  const stops = pattern.s.flatMap((stop, position) =>
    position > boarding && names.some(name => stopNames(stop).includes(name)) ? [position] : []);
  if (scope !== 'route-stop' && (stops.length ? stops.every(position => position < alighting) || scope === 'terminal' && !stops.includes(alighting)
    : matches.length > 0 || scope === 'terminal')) return undefined;
  return { ...prediction, destinationChecked: true };
}

function matchBusStops(leg: Segment, stops: TransitStopRecord[], citybus: boolean) {
  let match: { stop: string; seq: number; dir: string; distance: number } | undefined;
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
          match = { stop: a.stop, seq: sequence[i].seq, dir: bound === 'outbound' ? 'O' : 'I', distance };
        }
      }
    }
  }
  return match;
}

export async function notificationTargets(leg: Segment): Promise<NotificationTarget[]> {
  if (leg.networkPattern === undefined || !leg.routeNumber || !leg.originStop || !leg.destinationStop) return [];
  const pattern = networkPatterns[leg.networkPattern], boarding = leg.boardingIndex ?? 0, origin = networkStops[pattern.s[boarding]];
  if (leg.mode === 'SUBWAY') return [{ provider: 'MTR', route: leg.routeNumber, stop: origin[5], destinations: pattern.s.slice(leg.alightingIndex ?? boarding + 1).map(i => networkStops[i][5]) }];
  if (leg.mode === 'LIGHT_RAIL') return [{ provider: 'LRT', route: leg.routeNumber, stop: origin[0].split(':')[1], destinations: networkStops[pattern.s.at(-1)!].slice(1, 3) as string[] }];
  if (leg.operator === 'GMB') {
    const route = networkRoutes[pattern.r][0];
    const data = await officialJson<{ data: { route_stops: { stop_id: number; stop_seq: number }[] } }>(`https://data.etagmb.gov.hk/route-stop/${route}/${pattern.d}`);
    const match = data.data.route_stops.find(row => String(row.stop_id) === origin[0]);
    return match ? [{ provider: 'GMB', route, stop: String(match.stop_id), direction: pattern.d, seq: match.stop_seq }] : [];
  }
  if (!['KMB', 'LWB', 'CTB'].includes(leg.operator)) return [];
  const companies = (leg.networkOperator ?? leg.operator).split('+');
  const kmb = companies.some(id => id !== 'CTB') ? await getKmbStops() : [];
  return companies.flatMap(company => {
    const citybus = company === 'CTB', match = matchBusStops(leg, citybus ? getStaticCitybusStops() : kmb, citybus);
    return match ? [{ provider: citybus ? 'CTB' as const : 'KMB' as const, route: leg.routeNumber!, stop: match.stop, direction: match.dir, seq: match.seq }] : [];
  });
}

export async function enrichJourneyArrivals(routes: Route[], now = new Date(), scope: ArrivalScope = 'journey'): Promise<void> {
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
          const remark = (r: typeof rows[number]) => [r.rmk_tc, r.rmk_en, 'remarks_tc' in r ? r.remarks_tc : '', 'remarks_en' in r ? r.remarks_en : ''].filter(Boolean).join(' · ');
          return rows.filter(r => r.route === leg.routeNumber && r.dir === match.dir && (citybus || Number(r.seq) === Number(match.seq)) && (r.eta || providerMarksCancelled(remark(r)) || providerMarksMissed(remark(r)))
            && (!r.data_timestamp || fresh(r.data_timestamp, now)))
            .flatMap(r => {
              const prediction = busPrediction(leg, { time: r.eta, operator, remark: remark(r),
                destinationTc: r.dest_tc?.trim() || undefined, destinationEn: r.dest_en?.trim() || undefined }, scope);
              return prediction ? [prediction] : [];
            });
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

/** Propagate a live ETA from the previous boardable stop to a terminal. */
export async function enrichTerminalArrivals(routes: Route[], now = new Date()): Promise<void> {
  await Promise.all(routes.map(async route => {
    const leg = route.legs?.[0];
    if (!leg || leg.networkPattern === undefined || !leg.originStop || !leg.destinationStop) return;
    const pattern = networkPatterns[leg.networkPattern], terminal = leg.boardingIndex ?? -1;
    if (terminal !== pattern.s.length - 1 || terminal <= 0) return;
    let previous = terminal - 1;
    while (previous > 0 && pattern.p[previous] !== 0) previous--;
    const tempLeg: Segment = { ...leg, boardingIndex: previous, alightingIndex: terminal,
      originStop: networkStop(pattern.s[previous]), destinationStop: networkStop(pattern.s[terminal]),
      liveDepartures: undefined, departureNotices: undefined };
    await enrichJourneyArrivals([{ ...route, originWalkMinutes: 0, legs: [tempLeg] }], now, 'terminal');
    const projectTime = (upstream: string) => {
      const time = new Date(upstream);
      const runMinutes = runMinutesNearPrediction(pattern, previous, terminal, time);
      return new Date(time.getTime() + runMinutes * 60000).toISOString();
    };
    leg.departureNotices = tempLeg.departureNotices?.map(notice => ({
      ...notice, time: notice.time ? projectTime(notice.time) : undefined,
    }));
    if (!tempLeg.liveDepartures?.length) return;
    leg.liveDepartures = tempLeg.liveDepartures.map(row => {
      const time = projectTime(row.time);
      return { ...row, time, minutes: Math.max(0, Math.ceil((Date.parse(time) - now.getTime()) / 60000)),
        projectedArrival: true, timetableTime: undefined, deviationMinutes: undefined, comparisonBasis: undefined,
        ...compareDepartureToTimetable(leg.networkPattern!, terminal, time, true) };
    }).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    const first = leg.liveDepartures[0];
    leg.realtimeEta = first ? { etaMinutes: first.minutes, dataTime: now.toISOString(), isLive: departureTimingType(first) === 'LIVE', source: departureTimingType(first) === 'LIVE' ? 'DATAGOVHK' : 'SCHEDULED' } : null;
    leg.scheduledWaitMinutes = first?.minutes;
    leg.scheduledDepartureMinutes = first?.minutes;
    leg.serviceStatus = first && departureTimingType(first) === 'LIVE' ? 'LIVE' : 'TIMETABLE';
    leg.serviceEnded = false;
  }));
}
