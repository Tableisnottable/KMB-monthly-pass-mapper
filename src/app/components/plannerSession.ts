import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import { parseRouteWeights } from '../../engine/routeWeights';
import { parseJourneyLimits } from '../../domain/journeyLimits';
import { parseRoutePreferences } from '../../domain/routePreferences';
import type { JourneyTimeSelection } from '../../engine/journeyTime';
import type { JourneyLocations } from './plannerUi';
import type { PlaceResult } from './PlaceAutocomplete';
import { journeyMatchesEndpoints } from '../../domain/journeyEndpointMatch';

export const PLANNER_SESSION_KEY = 'compass-journey-v1';
const place = (value: unknown): value is PlaceResult => !!value && typeof value === 'object'
  && typeof (value as PlaceResult).id === 'string' && typeof (value as PlaceResult).name === 'string'
  && Number.isFinite((value as PlaceResult).lat) && Number.isFinite((value as PlaceResult).lng)
  && Math.abs((value as PlaceResult).lat) <= 90 && Math.abs((value as PlaceResult).lng) <= 180;

export function readPlannerSession<T extends { companies: object; transport: object; comparisons: object; preferences: object; weights: object; limits: object; changeMinutes: number }>(raw: string | null, defaults: T, now = Date.now()) {
  try {
    const saved = JSON.parse(raw ?? 'null');
    if (!saved || saved.version !== 1 || !Number.isFinite(saved.savedAt) || now - saved.savedAt > 7 * 86400000 || saved.savedAt > now + 60000) return null;
    const source = saved.places;
    if (!source || source.origin !== null && !place(source.origin) || source.destination !== null && !place(source.destination)) return null;
    const vias = Array.isArray(source.vias) ? source.vias : [];
    if (vias.some((value: unknown) => value !== null && !place(value))) return null;
    const places: JourneyLocations = { origin: source.origin, destination: source.destination, vias };
    const settings = { ...defaults };
    const stored = saved.settings ?? {};
    for (const key of ['companies', 'transport', 'comparisons'] as const) {
      settings[key] = Object.fromEntries(Object.entries(defaults[key]).map(([id, fallback]) => {
        const value = stored[key]?.[id];
        return [id, key === 'comparisons' ? typeof value === 'boolean' ? value : fallback
          : ['must', 'normal', 'ban'].includes(value) ? value : fallback];
      })) as T[typeof key];
    }
    settings.preferences = parseRoutePreferences(JSON.stringify(stored.preferences ?? defaults.preferences));
    settings.weights = parseRouteWeights(JSON.stringify(stored.weights ?? defaults.weights));
    // Older unlimited-wait settings should not silently restore overnight waits.
    settings.limits = parseJourneyLimits(JSON.stringify({ ...stored.limits,
      wait: saved.waitPolicy === 2 ? stored.limits?.wait : stored.limits?.wait ?? 120 }));
    if (Number.isInteger(stored.changeMinutes) && stored.changeMinutes >= 0 && stored.changeMinutes <= 60) settings.changeMinutes = stored.changeMinutes;
    const time: JourneyTimeSelection = saved.time?.mode === 'depart' || saved.time?.mode === 'arrive'
      ? { mode: saved.time.mode, value: typeof saved.time.value === 'string' ? saved.time.value : '' } : { mode: 'now', value: '' };
    const routes: ScoredRoute[] = now - saved.savedAt < 10 * 60000 && Array.isArray(saved.routes) && places.origin && places.destination
      ? saved.routes.filter((route: ScoredRoute) => Array.isArray(route?.legs) && typeof route.id === 'string'
        && route.legs.every(leg => leg.originStop && leg.destinationStop) && journeyMatchesEndpoints(route, places.origin!, places.destination!)) : [];
    return { places, settings, time, routes, searched: Boolean(saved.searched), savedAt: saved.savedAt };
  } catch { return null; }
}

export function encodePlannerSession(value: { places: JourneyLocations; settings: object; time: JourneyTimeSelection; routes: ScoredRoute[]; searched: boolean }, now = Date.now()): string {
  return JSON.stringify({ ...value, version: 1, waitPolicy: 2, savedAt: now,
    // Geometry is fetched separately; do not fill storage with path coordinates.
    routes: value.routes.map(route => ({ ...route, legs: route.legs.map(({ path, ...leg }) => leg) })),
  });
}
