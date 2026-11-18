import proj4 from 'proj4';

const hk1980 = '+proj=tmerc +lat_0=22.31213333333333 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.24365,-1.15883,-1.094246 +units=m +no_defs';
interface GovernmentPlace { nameZH?: string; nameEN?: string; addressZH?: string; addressEN?: string; districtZH?: string; districtEN?: string; x?: number; y?: number }
const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu, '');

/** Lands Department Location Search. Grid coordinates must not be used as lat/lng. */
export function governmentPlaces(payload: unknown, query: string) {
  if (!Array.isArray(payload)) return [];
  const needle = normalize(query);
  const valid = (payload as GovernmentPlace[]).filter(row => typeof row.nameZH === 'string' && typeof row.nameEN === 'string'
    && typeof row.x === 'number' && typeof row.y === 'number' && Number.isFinite(row.x) && Number.isFinite(row.y));
  const rank = (row: GovernmentPlace) => {
    const names = [normalize(row.nameZH!), normalize(row.nameEN!)];
    return (names.includes(needle) ? 0 : names.some(name => name.startsWith(needle)) ? 1 : 2)
      + (/Automated External Defibrillator|自動心臟除顫器/i.test(row.nameEN! + row.nameZH) ? 10 : 0);
  };
  return valid.sort((a, b) => rank(a) - rank(b)).flatMap(row => {
    const [lng, lat] = proj4(hk1980, 'WGS84', [row.x!, row.y!]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 22.1 || lat > 22.6 || lng < 113.8 || lng > 114.5) return [];
    return [{ id: 'lands:' + row.x + ':' + row.y + ':' + row.nameEN, name: row.nameZH || row.nameEN!,
      nameZh: row.nameZH, nameEn: row.nameEN,
      address: [row.addressZH, row.districtZH].filter(Boolean).join(' · '),
      addressZh: [row.addressZH, row.districtZH].filter(Boolean).join(' · '),
      addressEn: [row.addressEN, row.districtEN].filter(Boolean).join(' · '),
      lat, lng, type: 'place', googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng }];
  }).filter((row, index, all) => all.findIndex(other => normalize(other.name) === normalize(row.name) && Math.abs(other.lat - row.lat) < .0002 && Math.abs(other.lng - row.lng) < .0002) === index).slice(0, 8);
}

export async function findGovernmentPlaces(query: string) {
  const response = await fetch('https://www.map.gov.hk/gs/api/v1.0.0/locationSearch?q=' + encodeURIComponent(query), {
    headers: { Accept: 'application/json', 'User-Agent': 'TransitCompassHK/1.0 (place search)' }, signal: AbortSignal.timeout(6000), next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error('Government location search unavailable.');
  return governmentPlaces(await response.json(), query);
}
