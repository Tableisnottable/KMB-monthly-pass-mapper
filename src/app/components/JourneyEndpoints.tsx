import type { JourneyLocations } from './plannerUi';
export function JourneyEndpoints({ places, originFallback, destinationFallback }: { places: JourneyLocations; originFallback?: string; destinationFallback?: string }) {
  function label(place: JourneyLocations['origin'], fallback?: string) {
    return <div><strong>{place?.name ?? fallback}</strong>{place?.type === 'map' && <small className="trip-address">{place.address}</small>}</div>;
  }
  return <div className="trip-endpoints">{label(places.origin, originFallback)}<span>↓</span>{label(places.destination, destinationFallback)}</div>;
}
