import { describe, expect, it } from 'vitest';
import { scoreRoutes, type Route } from '../../engine/UpgradedScoringEngine';
import { fareLabel, hasEndedService, journeyMinutes, modeIcon } from './plannerUi';

function scored(legs: Route['legs'], walking = 0) {
  return scoreRoutes([{ id: 'test', legs, walkTransferTimeMinutes: walking }], new Date(2026, 10, 13, 12))[0];
}

describe('journey display values', () => {
  it('includes walking and live waiting without treating the weighted score as minutes', () => {
    const route = scored([{ operator: 'KMB', mode: 'BUS', journeyTimeMinutes: 20, realtimeEta: { isLive: true, etaMinutes: 4, dataTime: '', source: 'DATAGOVHK' } }], 5);
    expect(journeyMinutes(route)).toBe(29);
    expect(route.finalScore).toBe(28);
  });

  it('includes half-headway waiting for every transit leg without a live ETA', () => {
    const route = scored([
      { operator: 'KMB', mode: 'BUS', journeyTimeMinutes: 15, scheduledIntervalMinutes: 10 },
      { operator: 'CTB', mode: 'BUS', journeyTimeMinutes: 12, scheduledIntervalMinutes: 8 },
    ], 4);
    expect(journeyMinutes(route)).toBe(40);
  });

  it('does not display stale ETA as a live wait', () => {
    const route = scored([{ operator: 'KMB', mode: 'BUS', journeyTimeMinutes: 20, scheduledIntervalMinutes: 12, realtimeEta: { isLive: false, etaMinutes: 1, dataTime: '', source: 'SCHEDULED' } }]);
    expect(journeyMinutes(route)).toBe(26);
  });

  it('does not add waiting time to walking options', () => {
    expect(journeyMinutes(scored([{ operator: 'WALK', mode: 'WALK', journeyTimeMinutes: 18 }]))).toBe(18);
  });

  it('marks a journey unavailable if any required service has ended', () => {
    const route = scored([{ operator: 'KMB', mode: 'BUS', serviceEnded: true }, { operator: 'CTB', mode: 'BUS' }]);
    expect(hasEndedService(route)).toBe(true);
    expect(hasEndedService(scored([{ operator: 'WALK', mode: 'WALK' }]))).toBe(false);
  });

  it('never labels missing fare data as free', () => {
    const route = scored([{ operator: 'LRT', mode: 'LIGHT_RAIL', fare: 0, fareStatus: 'UNAVAILABLE' }]);
    expect(fareLabel(route, 'en')).toBe('Fare unavailable');
  });

  it('shows the correct symbols for rail, ferries and minibuses', () => {
    expect(modeIcon('SUBWAY')).toBe('train');
    expect(modeIcon('FERRY')).toBe('ferry');
    expect(modeIcon('MINIBUS')).toBe('minibus');
  });
});
