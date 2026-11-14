export const DEFAULT_WEIGHTS = { ride: 1, wait: 1, walk: 1.35, fare: .45, transfer: 8, waitPeak: 1, waitOffPeak: 1.3, waitNight: 1.8,
  unverified: 4, kmb: -1, lwb: -.46, mtr: .5, ctb: 1 };
export type RouteWeights = typeof DEFAULT_WEIGHTS;
export const WEIGHT_LIMITS: Record<keyof RouteWeights, [number, number]> = {
  ride: [.25, 5], wait: [0, 3],
  walk: [.1, 5], fare: [0, 3], transfer: [0, 60], waitPeak: [0, 5], waitOffPeak: [0, 5], waitNight: [0, 5],
  unverified: [0, 30], kmb: [-5, 5], lwb: [-5, 5], mtr: [-5, 5], ctb: [-5, 5],
};
export const customWeights = (weights: RouteWeights) => (Object.keys(DEFAULT_WEIGHTS) as (keyof RouteWeights)[]).some(key => weights[key] !== DEFAULT_WEIGHTS[key]);
export function parseRouteWeights(raw: string | null): RouteWeights {
  if (!raw) return { ...DEFAULT_WEIGHTS };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid route weights.');
  const weights = { ...DEFAULT_WEIGHTS };
  for (const [key, number] of Object.entries(value)) {
    if (!Object.hasOwn(WEIGHT_LIMITS, key)) throw new Error('Unknown route weight.');
    const [min, max] = WEIGHT_LIMITS[key as keyof RouteWeights];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) throw new Error('Route weight outside its allowed range.');
    weights[key as keyof RouteWeights] = number;
  }
  return weights;
}
