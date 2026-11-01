import kmbRouteStopsJson from './kmbRouteStops.json';

export interface StaticKmbRouteStop {
  seq: number;
  stop: string;
}

const routeStopByKey = new Map<string, StaticKmbRouteStop[]>();
for (const route of kmbRouteStopsJson.routes) {
  routeStopByKey.set(`${route.route}|${route.bound}`, route.stops);
}

export const STATIC_KMB_ROUTE_STOPS_GENERATED_AT = kmbRouteStopsJson.generatedAt;

export function getStaticKmbRouteStops(
  route: string,
  bound: 'inbound' | 'outbound',
): StaticKmbRouteStop[] | undefined {
  return routeStopByKey.get(`${route}|${bound}`);
}
