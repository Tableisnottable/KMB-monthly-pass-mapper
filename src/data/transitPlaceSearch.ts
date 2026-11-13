import type { TransitStopRecord } from './hkTransitApi';

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s(),，（）.\-/]/g, '');
}

const airportQueries = new Set([
  'airport', 'hkairport', 'hongkongairport', 'hongkonginternationalairport', 'hkg',
  '機場', '香港機場', '香港國際機場', '机场', '香港机场', '香港国际机场',
]);

export function isAirportQuery(query: string): boolean {
  return airportQueries.has(normalize(query));
}

/** Supplement geocoding with real, named boarding locations. In particular,
 * an aerodrome's polygon centre is not a useful bus journey endpoint. */
export function findTransitPlaces(query: string, stops: TransitStopRecord[]) {
  const needle = normalize(query);
  if (needle.length < 2) return [];
  const airport = isAirportQuery(query);
  const seenNames = new Set<string>();
  return stops.filter(stop => {
    const match = airport
      ? /機場.*地面運輸中心/.test(stop.name_tc)
      : normalize(stop.name_tc).includes(needle) || normalize(stop.name_en).includes(needle);
    if (!match || !Number.isFinite(stop.lat) || !Number.isFinite(stop.long)) return false;
    const key = normalize(stop.name_tc || stop.name_en);
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  }).sort((a, b) => a.name_tc.length - b.name_tc.length).slice(0, 4).map(stop => ({
    id: 'ctb-stop-' + stop.stop,
    name: stop.name_tc + ' ' + stop.name_en,
    address: '香港 Hong Kong · 城巴車站 Citybus stop',
    lat: stop.lat,
    lng: stop.long,
    type: 'bus_stop',
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(stop.lat + ',' + stop.long),
  }));
}
