import { describe, expect, it } from 'vitest';
import { encodePlannerSession, readPlannerSession } from './plannerSession';
import { DEFAULT_WEIGHTS } from '../../engine/routeWeights';
import { DEFAULT_LIMITS } from '../../domain/journeyLimits';
import { DEFAULT_PREFERENCES } from '../../domain/routePreferences';
import { scoreRoutes } from '../../engine/UpgradedScoringEngine';

const now = Date.parse('2026-11-23T00:00:00Z');
const origin = { id: 'a', name: 'A', lat: 22.3, lng: 114.1, address: '', type: 'map' as const, googleMapsUrl: '' };
const destination = { ...origin, id: 'b', name: 'B', lat: 22.31 };
const defaults = { companies: { KMB: 'normal', CTB: 'normal' }, transport: { BUS: 'normal' }, comparisons: { walk: true },
  preferences: DEFAULT_PREFERENCES, weights: DEFAULT_WEIGHTS, limits: DEFAULT_LIMITS, changeMinutes: 3 };
const route = scoreRoutes([{ id: 'saved', legs: [{ operator: 'KMB', mode: 'BUS', routeNumber: '44',
  originStop: origin, destinationStop: destination, path: [[22.3, 114.1], [22.31, 114.1]] }] }], new Date(now))[0];
const value = { places: { origin, destination, vias: [origin] }, time: { mode: 'now' as const, value: '' },
  settings: { ...defaults, companies: { KMB: 'must', CTB: 'ban' }, changeMinutes: 15 }, routes: [route], searched: true };

describe('Reloadable planner session', () => {
  it('restores places, ordered vias, hard filters, transfer time and cached routes', () => {
    const restored = readPlannerSession(encodePlannerSession(value, now), defaults, now);
    expect(restored?.places).toEqual(value.places);
    expect(restored?.settings.companies).toEqual({ KMB: 'must', CTB: 'ban' });
    expect(restored?.settings.changeMinutes).toBe(15);
    expect(restored?.routes[0].legs[0].path).toBeUndefined();
  });
  it('keeps input preferences but drops route times older than ten minutes', () => {
    const restored = readPlannerSession(encodePlannerSession(value, now), defaults, now + 11 * 60000);
    expect(restored?.places.origin).toEqual(origin);
    expect(restored?.routes).toEqual([]);
    expect(restored?.searched).toBe(true);
  });
  it('ignores broken, expired and invalid saved sessions safely', () => {
    expect(readPlannerSession('{broken', defaults, now)).toBeNull();
    expect(readPlannerSession(encodePlannerSession(value, now), defaults, now + 8 * 86400000)).toBeNull();
    expect(readPlannerSession(encodePlannerSession({ ...value, settings: { ...defaults, limits: { walk: -1 } } }, now), defaults, now)).toBeNull();
  });
});
