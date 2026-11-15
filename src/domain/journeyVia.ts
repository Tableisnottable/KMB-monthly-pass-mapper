import type { Stop } from '../engine/UpgradedScoringEngine';
import { withinRoutingArea } from './routingArea';

export type ViaStop = Stop & { lat: number; lng: number };
/** Repeated coordinate parameters preserve waypoint order, including old single-Via links. */
export function parseJourneyVias(params: URLSearchParams): ViaStop[] {
  const latitudes = params.getAll('viaLat'), longitudes = params.getAll('viaLon'), names = params.getAll('viaName');
  if (latitudes.length !== longitudes.length || names.length > latitudes.length) throw new Error('Choose a valid Via place for every waypoint.');
  return latitudes.map((value, index) => {
    const lat = Number(value), lng = Number(longitudes[index]);
    if (!value.trim() || !longitudes[index].trim() || !withinRoutingArea(lat, lng)) {
      throw new Error('Choose a valid Via place within the Hong Kong–Shenzhen routing area.');
    }
    return { id: index ? 'via-' + index : 'via', name: names[index]?.slice(0, 200) || (params.get('lang') === 'en' ? 'Via' : '\u9014\u7d93\u9ede'), lat, lng };
  });
}
export function parseJourneyVia(params: URLSearchParams): ViaStop | undefined { return parseJourneyVias(params)[0]; }
export function appendJourneyVias(params: URLSearchParams, vias: { lat: number; lng: number; name?: string }[]) {
  for (const key of ['viaLat', 'viaLon', 'viaName']) params.delete(key);
  for (const via of vias) { params.append('viaLat', String(via.lat)); params.append('viaLon', String(via.lng)); params.append('viaName', via.name ?? ''); }
}
