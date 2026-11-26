// Keep map math independent of the full transport dataset and routing engine.
type Coordinate = [number, number];
export interface ScheduledBusRun {
  id: string;
  departureTime: string;
  arrivalTime: string;
  stopOffsetsMinutes: number[];
}
export interface BusTrack { points: Coordinate[]; distances: number[]; stopDistances: number[] }
const distance = (a: Coordinate, b: Coordinate) => {
  const rad = Math.PI / 180, lat = (b[0] - a[0]) * rad, lng = (b[1] - a[1]) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
};

/** Snap stops in order to one continuous road line. Never join missing pieces. */
export function buildBusTrack(paths: Coordinate[][], stops: Coordinate[]): BusTrack | null {
  if (stops.length < 2 || stops.some(point => point.some(value => !Number.isFinite(value)))) return null;
  for (const points of paths) {
    if (points.length < 2 || points.some(point => point.some(value => !Number.isFinite(value)))) continue;
    const distances = [0];
    for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + distance(points[i - 1], points[i]));
    const stopDistances: number[] = [];
    let previous = 0;
    for (const stop of stops) {
      let best: { position: number; distance: number; along: number } | undefined;
      for (let i = Math.floor(previous); i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1], scale = Math.cos(stop[0] * Math.PI / 180);
        const dx = (b[1] - a[1]) * scale, dy = b[0] - a[0];
        const t = Math.max(i === Math.floor(previous) ? previous - i : 0, Math.min(1,
          ((stop[1] - a[1]) * scale * dx + (stop[0] - a[0]) * dy) / (dx * dx + dy * dy || 1)));
        const point: Coordinate = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const gap = distance(stop, point);
        // Keep the first visit on loop routes when equally close to the stop.
        if (!best || gap < best.distance - 3) best = { position: i + t, distance: gap, along: distances[i] + (distances[i + 1] - distances[i]) * t };
      }
      if (!best || best.distance > 220) break;
      previous = best.position; stopDistances.push(best.along);
    }
    if (stopDistances.length === stops.length && stopDistances.at(-1)! > stopDistances[0]) return { points, distances, stopDistances };
  }
  return null;
}

/** Interpolate only along a verified road line and only during a trip's run. */
export function scheduledBusPosition(run: ScheduledBusRun, track: BusTrack, now: number) {
  const start = Date.parse(run.departureTime), finish = Date.parse(run.arrivalTime);
  if (!Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(finish) || now < start || now >= finish) return null;
  const offsets = run.stopOffsetsMinutes, elapsed = (now - start) / 60000;
  if (offsets.length !== track.stopDistances.length || offsets.some((offset, i) => !Number.isFinite(offset) || (i > 0 && offset < offsets[i - 1]))) return null;
  const nextStop = offsets.findIndex(offset => offset > elapsed);
  if (nextStop < 1) return null;
  const progress = (elapsed - offsets[nextStop - 1]) / (offsets[nextStop] - offsets[nextStop - 1]);
  const along = track.stopDistances[nextStop - 1] + (track.stopDistances[nextStop] - track.stopDistances[nextStop - 1]) * progress;
  const i = track.distances.findIndex(value => value >= along && value > 0);
  if (i < 1) return null;
  const fraction = (along - track.distances[i - 1]) / (track.distances[i] - track.distances[i - 1]);
  const a = track.points[i - 1], b = track.points[i];
  const point: Coordinate = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
  return { point, nextStop, arrivalTime: new Date(start + offsets[nextStop] * 60000).toISOString() };
}
