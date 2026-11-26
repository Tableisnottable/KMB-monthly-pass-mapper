import type { MacauPattern, MacauPoint } from '../../domain/macau';
import { haversineKm } from '../../engine/journeyHelpers';

/** Slice only the provider's existing road/track segments. Paths remain separate
 * across source gaps. Monotonic projection distinguishes repeat circular stops.
 * This module deliberately does not import the Hong Kong transport graph.
 */
export function macauGeometry(pattern: MacauPattern, board: number, alight: number): MacauPoint[][] {
  if (!Number.isInteger(board) || !Number.isInteger(alight) || board < 0 || alight >= pattern.stops.length || board >= alight) return [];
  if (pattern.mode === 'LIGHT_RAIL') return pattern.paths.slice(board, alight).filter(path => path.length >= 2);
  const segments = pattern.paths.flatMap((path, piece) => path.slice(1).map((b, index) => ({ a: path[index], b, piece })));
  if (!segments.length) return [];
  const positions: { n: number; point: MacauPoint }[] = [];
  let previous = 0;
  // Project the prefix too, so a second visit to a stop cannot match its first.
  for (const stop of pattern.stops.slice(0, alight + 1)) {
    let best: { n: number; point: MacauPoint; distance: number } | undefined;
    for (let i = Math.floor(previous); i < segments.length; i++) {
      const { a, b } = segments[i], dx = (b[1] - a[1]) * .926, dy = b[0] - a[0];
      const t = Math.max(i === Math.floor(previous) ? previous - i : 0, Math.min(1,
        ((stop[4] - a[1]) * .926 * dx + (stop[3] - a[0]) * dy) / (dx * dx + dy * dy || 1)));
      const point: MacauPoint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const distance = haversineKm(stop[3], stop[4], ...point);
      if (!best || distance < best.distance - .003) best = { n: i + t, point, distance };
    }
    if (!best || best.distance > .25) return [];
    positions.push(best); previous = best.n;
  }
  const start = positions[board], end = positions[alight];
  if (end.n <= start.n) return [];
  const paths: MacauPoint[][] = [];
  let lastPiece = -1;
  for (let i = Math.floor(start.n); i < Math.ceil(end.n); i++) {
    const segment = segments[i]; if (!segment) break;
    const a = i === Math.floor(start.n) ? start.point : segment.a;
    const b = i === Math.ceil(end.n) - 1 ? end.point : segment.b;
    if (lastPiece !== segment.piece) { paths.push([a, b]); lastPiece = segment.piece; }
    else paths[paths.length - 1].push(b);
  }
  return paths.filter(path => path.length >= 2);
}
