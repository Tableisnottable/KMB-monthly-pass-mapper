import { describe, expect, it } from 'vitest';
import { navigationDistance, navigationSteps } from './navigationSteps';
import type { ScoredRoute } from '../engine/UpgradedScoringEngine';

const start = { id: 'start', name: 'Start', lat: 22.3, lng: 114.1 };
const board = { id: 'board', name: 'Board', lat: 22.301, lng: 114.1 };
const alight = { id: 'alight', name: 'Alight', lat: 22.31, lng: 114.1 };
const end = { id: 'end', name: 'End', lat: 22.311, lng: 114.1 };
const route = { id: 'test', originWalkMinutes: 3, destinationWalkMinutes: 3, legs: [{
  id: 'bus', operator: 'KMB', routeNumber: '44', mode: 'BUS', originStop: board, destinationStop: alight, journeyTimeMinutes: 15,
}] } as ScoredRoute;

describe('GO step construction', () => {
  it('includes access walk, boarding, ride, alighting and the final walk', () => {
    expect(navigationSteps(route, { origin: start, destination: end }).map(step => step.kind))
      .toEqual(['walk', 'board', 'ride', 'alight', 'walk', 'arrive']);
  });
  it('includes transfer walks and keeps each boarding associated with its leg', () => {
    const onward = { ...route, legs: [...route.legs, { ...route.legs[0], id: 'bus-2', originStop: end, destinationStop: start }] };
    const steps = navigationSteps(onward, { origin: board, destination: start });
    expect(steps.filter(step => step.kind === 'board').map(step => step.legIndex)).toEqual([0, 1]);
    expect(steps.filter(step => step.kind === 'walk')).toHaveLength(1);
  });
  it('does not duplicate walking-only legs or announce arrival before their completion', () => {
    const walk = { ...route, legs: [{ ...route.legs[0], mode: 'WALK', originStop: start, destinationStop: end }] };
    expect(navigationSteps(walk, { origin: start, destination: end }).map(step => step.kind)).toEqual(['walk', 'arrive']);
  });
  it('rejects inaccurate and absent GPS fixes for automatic proximity progress', () => {
    expect(navigationDistance({ latitude: board.lat, longitude: board.lng, accuracy: 5 }, board)).toBe(0);
    expect(navigationDistance({ latitude: board.lat, longitude: board.lng, accuracy: 500 }, board)).toBeUndefined();
    expect(navigationDistance(null, board)).toBeUndefined();
  });
});
