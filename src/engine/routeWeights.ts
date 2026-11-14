export const DEFAULT_WEIGHTS = { ride: 1, wait: 1, walk: 1.35, fare: .45, transfer: 8, waitPeak: 1, waitOffPeak: 1.3, waitNight: 1.8,
  unverified: 4, kmb: -1, lwb: -.46, mtr: .5, ctb: 1 };
export type RouteWeights = typeof DEFAULT_WEIGHTS;
export const WEIGHT_LIMITS: Record<keyof RouteWeights, [number, number]> = {
  ride: [0, 2], wait: [0, 2],
  walk: [0, 2.7], fare: [0, .9], transfer: [0, 16], waitPeak: [0, 5], waitOffPeak: [0, 5], waitNight: [0, 5],
  unverified: [0, 8], kmb: [-5, 5], lwb: [-5, 5], mtr: [-5, 5], ctb: [-5, 5],
};
export const IMPORTANCE_KEYS = ['ride', 'wait', 'walk', 'fare', 'transfer', 'unverified'] as const;
export type ImportanceKey = typeof IMPORTANCE_KEYS[number];
export const customWeights = (weights: RouteWeights) => (Object.keys(DEFAULT_WEIGHTS) as (keyof RouteWeights)[]).some(key => weights[key] !== DEFAULT_WEIGHTS[key]);
/** Independent relative scales; do not round the stored/default coefficients. */
export function weightPercent(key: ImportanceKey, value: number): number {
  return Math.max(0, Math.min(200, value / DEFAULT_WEIGHTS[key] * 100));
}
export function weightFromPercent(key: ImportanceKey, percent: number): number {
  return DEFAULT_WEIGHTS[key] * (Math.max(0, Math.min(200, percent)) / 100);
}
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
