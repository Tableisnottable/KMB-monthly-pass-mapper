import type { Stop } from '../engine/UpgradedScoringEngine';
import { withinRoutingArea } from './routingArea';

/** A waypoint is optional, but a partial/invalid waypoint must never become a direct trip. */
export function parseJourneyVia(params: URLSearchParams): (Stop & { lat: number; lng: number }) | undefined {
  if (!params.has('viaLat') && !params.has('viaLon')) return undefined;
  const lat = Number(params.get('viaLat')), lng = Number(params.get('viaLon'));
  if (!params.get('viaLat')?.trim() || !params.get('viaLon')?.trim() || !withinRoutingArea(lat, lng)) {
    throw new Error('Choose a valid Via place within the Hong Kong–Shenzhen routing area.');
  }
  return { id: 'via', name: params.get('viaName')?.slice(0, 200) || (params.get('lang') === 'en' ? 'Via' : '途經點'), lat, lng };
}
