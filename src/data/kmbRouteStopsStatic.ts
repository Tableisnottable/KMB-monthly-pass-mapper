import manifest from './kmbRouteStops/manifest.json';
import part0 from './kmbRouteStops/routes-0.json';
import part1 from './kmbRouteStops/routes-1.json';
import part2 from './kmbRouteStops/routes-2.json';
import part3 from './kmbRouteStops/routes-3.json';

export interface StaticKmbRouteStop {
  seq: number;
  stop: string;
}

const routeStopByKey = new Map<string, StaticKmbRouteStop[]>();
for (const route of [part0, part1, part2, part3].flatMap(part => part.routes)) {
  routeStopByKey.set(`${route.route}|${route.bound}`, route.stops);
}

export const STATIC_KMB_ROUTE_STOPS_GENERATED_AT = manifest.generatedAt;

export function getStaticKmbRouteStops(
  route: string,
  bound: 'inbound' | 'outbound',
): StaticKmbRouteStop[] | undefined {
  return routeStopByKey.get(`${route}|${bound}`);
}
