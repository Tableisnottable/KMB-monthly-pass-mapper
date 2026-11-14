import type { PlaceResult } from './PlaceAutocomplete';
export const RECENT_PLACES_KEY = 'transit-compass-recent-places';
export function validRecentPlaces(value: unknown): PlaceResult[] {
  if (!Array.isArray(value)) return [];
  return value.filter((place): place is PlaceResult => Boolean(place) && typeof place === 'object'
    && typeof place.id === 'string' && typeof place.name === 'string' && typeof place.address === 'string'
    && typeof place.type === 'string' && typeof place.googleMapsUrl === 'string'
    && typeof place.lat === 'number' && typeof place.lng === 'number' && Number.isFinite(place.lat) && Number.isFinite(place.lng)
    && place.lat >= 22.1 && place.lat <= 22.6 && place.lng >= 113.8 && place.lng <= 114.5 && place.type !== 'location').slice(0, 5);
}
export function readRecentPlaces(): PlaceResult[] {
  try { return validRecentPlaces(JSON.parse(localStorage.getItem(RECENT_PLACES_KEY) ?? '[]')); } catch { return []; }
}
export function saveRecentPlace(place: PlaceResult) {
  if (place.type === 'location') return;
  try { localStorage.setItem(RECENT_PLACES_KEY, JSON.stringify(validRecentPlaces([place, ...readRecentPlaces().filter(p => p.id !== place.id)]))); } catch { /* Storage can be disabled. */ }
}
