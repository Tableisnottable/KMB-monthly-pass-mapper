import landmarks from './places.json';
import { macauPatterns, macauStops, macauStopName } from './network';
import type { PlaceResult } from '../../app/components/PlaceAutocomplete';
const normalize = (value: string) => value.toLocaleLowerCase().normalize('NFKC').replace(/澳门/g, '澳門').replace(/轻轨/g, '輕軌').replace(/[\s/()（）.·_-]/g, '');
const toPlace = (id: string, name: string, address: string, lat: number, lng: number, type: string): PlaceResult => ({
  id, name, address, lat, lng, type, googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
});
export function findMacauPlaces(query: string, locale: 'zh' | 'en') {
  const q = normalize(query);
  if (q.length < 2) return [];
  const busRoutes = new Map<string, string[]>();
  for (const p of macauPatterns) for (const s of p.stops) busRoutes.set(s[0], Array.from(new Set([...(busRoutes.get(s[0]) ?? []), p.number])));
  const places = macauStops.map(s => toPlace('MO:' + s[0], macauStopName(s, locale),
    `${s[0]} · ${busRoutes.get(s[0])?.join(' / ')} · ${locale === 'en' ? 'Macao' : '澳門'}`, s[3], s[4], 'station'));
  for (const row of landmarks) places.push(toPlace(String(row[0]), String(row[locale === 'en' ? 2 : 1]),
    `${row[locale === 'en' ? 1 : 2]} · OpenStreetMap · ${locale === 'en' ? 'Macao' : '澳門'}`, Number(row[3]), Number(row[4]), String(row[5])));
  const matches = places.map(place => {
    const name = normalize(place.name), text = normalize(place.name + place.address);
    return { place, rank: name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : text.includes(q) ? 3 : 99 };
  }).filter(row => row.rank < 99).sort((a, b) => a.rank - b.rank || (a.place.type === 'station' ? -1 : 1) - (b.place.type === 'station' ? -1 : 1));
  return matches.filter((row, i, all) => all.findIndex(other => other.place.name === row.place.name && Math.abs(other.place.lat - row.place.lat) < .001 && Math.abs(other.place.lng - row.place.lng) < .001) === i)
    .slice(0, 8).map(row => row.place);
}
