import { networkStops } from './networkStops';

function normalize(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/茘/g, '荔').replace(/[\s(),，（）.\-/]/g, '');
}

export function normalizeTransitQuery(query: string) {
  return normalize(query).replace(/^(mtr|港鐵|輕鐵)/, '').replace(/(?:mtrstation|lightrailstop|station|輕鐵站|站)$/, '');
}

export function findNetworkPlaces(query: string) {
  const needle = normalizeTransitQuery(query);
  if (needle.length < 2) return [];
  const seen = new Set<string>();
  return networkStops.filter(s => normalize(s[1]).includes(needle) || normalize(s[2]).includes(needle))
    .sort((a, b) => {
      const rank = (s: typeof a) => (normalize(s[1]) === needle || normalize(s[2]) === needle ? 0 : 10)
        + (s[6] === 'SUBWAY' || s[6] === 'LIGHT_RAIL' ? 0 : 2) + Math.min(s[2].length / 100, 1);
      return rank(a) - rank(b);
    }).filter(s => {
      const key = normalize(s[1]) + ':' + s[3].toFixed(3) + ':' + s[4].toFixed(3);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 6).map(s => ({
      id: 'network:' + s[0], name: s[1] + ' ' + s[2], nameZh: s[1], nameEn: s[2],
      address: '香港 Hong Kong · ' + (s[6] === 'SUBWAY' ? '港鐵站 MTR station'
        : s[6] === 'LIGHT_RAIL' ? '輕鐵站 Light Rail stop' : s[6] === 'FERRY' ? '渡輪碼頭 Ferry pier' : '公共交通站點 Public transport stop'),
      lat: s[3], lng: s[4], type: s[6] === 'SUBWAY' || s[6] === 'LIGHT_RAIL' ? 'station' : s[6] === 'FERRY' ? 'ferry_terminal' : 'bus_stop',
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s[3] + ',' + s[4]),
    }));
}
