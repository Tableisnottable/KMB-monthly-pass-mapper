import citybusStopsJson from './citybusStops.json';
import citybusRouteStopsJson from './citybusRouteStops.json';
import type { TransitStopRecord } from './hkTransitApi';

export interface CitybusStopEntry {
  stop: string;
  name_tc: string;
  name_en: string;
  lat: string;
  long: string;
}

const stopById = new Map<string, CitybusStopEntry>();
for (const stop of citybusStopsJson.stops) {
  stopById.set(stop.stop, stop);
}

export function getStaticCitybusStop(stopId: string): CitybusStopEntry | undefined {
  return stopById.get(stopId);
}

export function getStaticCitybusStops(): TransitStopRecord[] {
  return citybusStopsJson.stops.map((stop) => ({
    stop: stop.stop,
    name_tc: stop.name_tc,
    name_en: stop.name_en,
    lat: Number(stop.lat),
    long: Number(stop.long),
  }));
}

export const STATIC_CITYBUS_ROUTES = citybusStopsJson.routes;
export const STATIC_CITYBUS_GENERATED_AT = citybusStopsJson.generatedAt;

export interface CitybusRouteStopEntry {
  seq: number;
  stop: string;
}

const routeStopByKey = new Map<string, CitybusRouteStopEntry[]>();
for (const route of citybusRouteStopsJson.routes) {
  routeStopByKey.set(`${route.route}|${route.bound}`, route.stops);
}

export function getStaticCitybusRouteStops(
  route: string,
  bound: 'inbound' | 'outbound',
): CitybusRouteStopEntry[] | undefined {
  return routeStopByKey.get(`${route}|${bound}`);
}
