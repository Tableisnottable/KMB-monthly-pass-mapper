import { buses } from './buses';
import rail from './rail.json';
import type { MacauPattern, MacauPayment, MacauStop } from '../../domain/macau';
import { haversineKm } from '../../engine/journeyHelpers';
export { default as macauCoverage } from './manifest.json';

export const macauPatterns = [...buses, ...rail] as MacauPattern[];
export const macauPatternById = new Map(macauPatterns.map(pattern => [pattern.id, pattern]));
export const macauStops = Array.from(new Map(macauPatterns.flatMap(pattern => pattern.stops.map(stop => [stop[0], stop] as const))).values());
export const macauStopName = (stop: MacauStop, locale: 'zh' | 'en') => stop[locale === 'en' ? 2 : 1] || stop[1];
export function macauStop(stop: MacauStop, locale: 'zh' | 'en') { return { id: 'MO:' + stop[0], name: macauStopName(stop, locale), lat: stop[3], lng: stop[4] }; }
export function pathKm(path: number[][]) {
  return path.reduce((sum, point, index) => sum + (index ? haversineKm(path[index - 1][0], path[index - 1][1], point[0], point[1]) : 0), 0);
}
export function patternMinutes(pattern: MacauPattern) {
  const offsets = [0];
  for (let i = 1; i < pattern.stops.length; i++) {
    const a = pattern.stops[i - 1], b = pattern.stops[i];
    const estimatedRail = [a[0], b[0]].includes('LRT:BARRA') ? 6 : 2;
    const km = pattern.paths.length === pattern.stops.length - 1 ? pathKm(pattern.paths[i - 1]) : haversineKm(a[3], a[4], b[3], b[4]) * 1.25;
    offsets.push(offsets[i - 1] + (pattern.mode === 'LIGHT_RAIL' ? estimatedRail : Math.max(1, Math.round(km / 18 * 60 + .5))));
  }
  return offsets;
}
export const macauOffsets = new Map(macauPatterns.map(pattern => [pattern.id, patternMinutes(pattern)]));

// Published MLM band calculation, including the two sea-crossing sections.
// Union Hospital is excluded from through-trip counts unless it or SPV is an endpoint.
export function lrtFare(path: string[], payment: MacauPayment) {
  let count = path.length - 1;
  for (let i = 1; i < path.length; i++) if ([path[i - 1], path[i]].sort().join('|') === ['LRT:BARRA', 'LRT:OCEAN'].sort().join('|')
    || [path[i - 1], path[i]].sort().join('|') === ['LRT:HENGQIN', 'LRT:LOTUS'].sort().join('|')) count++;
  if (path.slice(1, -1).includes('LRT:UNION-HOSPITAL') && !path.some(id => id === 'LRT:SEAC-PAI-VAN') && path[0] !== 'LRT:UNION-HOSPITAL' && path.at(-1) !== 'LRT:UNION-HOSPITAL') count--;
  const fare = count <= 3 ? 6 : count <= 6 ? 8 : count <= 9 ? 10 : 12;
  return payment === 'cash' ? fare : payment === 'macau-pass' ? fare / 2 : fare / 4;
}
