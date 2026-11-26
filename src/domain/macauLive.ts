import { inMacau, type MacauPattern } from './macau';

type Point = [number, number];
export type MacauStopEta = { minutes: number; vehicles: number };
export type MacauBusPosition = { point: Point; fleetNumber?: string };
export type MacauLiveSnapshot = { etaByStop: Record<number, MacauStopEta>; vehicles: MacauBusPosition[]; vehicleCount: number; updatedAt: string };

type LiveBus = { index: number; id: string; point: Point; speed: number; atStop: boolean; fleetNumber?: string };
const distance = (a: Point, b: Point) => {
  const lat = (a[0] + b[0]) / 2 * Math.PI / 180;
  const x = (b[1] - a[1]) * Math.cos(lat) * 111_320, y = (b[0] - a[0]) * 111_320;
  return Math.hypot(x, y);
};

function liveBuses(value: unknown, stopCount: number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid bus position feed.');
  const entries = Object.entries(value).filter(([key]) => /^\d+$/.test(key));
  if (!entries.length || entries.some(([, row]) => !row || !Array.isArray(row.bus))) throw new Error('Invalid bus position feed.');
  const compatible = entries.length === stopCount && entries.every(([key], index) => Number(key) === index);
  const rows: LiveBus[] = [];
  for (const [key, row] of entries) {
    for (const candidate of row.bus as unknown[]) {
      if (!candidate || typeof candidate !== 'object') continue;
      const bus = candidate as Record<string, unknown>, lat = Number(bus.lat), lon = Number(bus.lng), speed = Number(bus.speed);
      const id = [bus.plate, bus.ref].find(value => typeof value === 'string' && value.trim());
      if (typeof id === 'string' && inMacau(lat, lon) && Number.isFinite(speed) && speed >= 0 && speed <= 160) {
        const fleetNumber = typeof bus.ref === 'string' && /^#?[A-Z0-9-]{1,16}$/i.test(bus.ref) ? bus.ref : undefined;
        rows.push({ index: Number(key), id, point: [lat, lon], speed, atStop: String(bus.status) === '1', fleetNumber });
      }
    }
  }
  return { rows, compatible };
}

function project(point: Point, path: Point[]) {
  let best = { metres: Number.POSITIVE_INFINITY, along: 0 };
  let traversed = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], segment = distance(a, b);
    if (!segment) continue;
    const lat = (a[0] + b[0]) / 2 * Math.PI / 180, scaleX = Math.cos(lat) * 111_320, scaleY = 111_320;
    const dx = (b[1] - a[1]) * scaleX, dy = (b[0] - a[0]) * scaleY;
    const px = (point[1] - a[1]) * scaleX, py = (point[0] - a[0]) * scaleY;
    const ratio = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
    const metres = Math.hypot(px - dx * ratio, py - dy * ratio);
    if (metres < best.metres) best = { metres, along: traversed + segment * ratio };
    traversed += segment;
  }
  return { ...best, length: traversed };
}

export function parseMacauLive(value: unknown, pattern: MacauPattern, updatedAt = new Date().toISOString()): MacauLiveSnapshot {
  const { rows, compatible } = liveBuses(value, pattern.stops.length);
  const byVehicle = new Map<string, LiveBus[]>();
  for (const bus of rows) byVehicle.set(bus.id, [...(byVehicle.get(bus.id) ?? []), bus]);
  const etaByStop: Record<number, MacauStopEta> = {};
  const reportsByVehicle = Array.from(byVehicle.values());
  const vehicles = reportsByVehicle.flatMap(reports => reports.length === 1
    ? [{ point: reports[0].point, fleetNumber: reports[0].fleetNumber }] : []);
  const snapshot = { etaByStop, vehicles, vehicleCount: vehicles.length, updatedAt };
  if (!compatible || pattern.paths.length !== pattern.stops.length - 1 || pattern.paths.some(path => path.length < 2)) return snapshot;

  const add = (target: number, minutes: number) => {
    if (pattern.stops[target][5]) return;
    const prior = etaByStop[target];
    etaByStop[target] = { minutes: Math.min(prior?.minutes ?? Infinity, minutes), vehicles: (prior?.vehicles ?? 0) + 1 };
  };
  const lengths = pattern.paths.map(path => project(path[0], path).length);
  for (const reports of reportsByVehicle) {
    // If the provider lists a vehicle in more than one row, its progress is ambiguous.
    if (reports.length !== 1) continue;
    const bus = reports[0];
    const stop = pattern.stops[bus.index];
    const atStop = bus.atStop && distance(bus.point, [stop[3], stop[4]]) <= 60;
    const nearest = [bus.index - 1, bus.index, bus.index + 1]
      .filter(segment => segment >= 0 && segment < lengths.length)
      .map(segment => ({ segment, ...project(bus.point, pattern.paths[segment]) }))
      .sort((a, b) => a.metres - b.metres)[0];
    if (atStop) add(bus.index, 0);
    if (!nearest || nearest.metres > 120 || !atStop && nearest.along >= nearest.length - 10) continue;
    const segment = atStop ? bus.index : nearest.segment;
    let metres = atStop ? lengths[segment] : nearest.length - nearest.along;
    const kmh = Math.max(10, Math.min(25, bus.speed * 0.55 + 8));
    for (let target = segment + 1; target < pattern.stops.length; target++) {
      const dwell = (target - segment - 1) * 0.4;
      add(target, Math.max(1, Math.ceil(metres * .06 / kmh + dwell)));
      metres += lengths[target] ?? 0;
    }
  }
  return snapshot;
}
