import { describe, expect, it } from 'vitest';
import { scoreRoutes, type Route } from '../../engine/UpgradedScoringEngine';
import { fareLabel, hasEndedService, journeyMinutes, legOperator, modeIcon, operatorColors, routeColor, routeIconColor } from './plannerUi';
import manifest from '../../data/transport/manifest.json';

function scored(legs: Route['legs'], walking = 0) {
  return scoreRoutes([{ id: 'test', legs, walkTransferTimeMinutes: walking }], new Date(2026, 10, 13, 12))[0];
}

describe('journey display values', () => {
  it('includes walking and live waiting without treating the weighted score as minutes', () => {
    const route = scored([{ operator: 'KMB', mode: 'BUS', journeyTimeMinutes: 20, realtimeEta: { isLive: true, etaMinutes: 4, dataTime: '', source: 'DATAGOVHK' } }], 5);
    expect(journeyMinutes(route)).toBe(29);
    expect(route.finalScore).toBe(30.95);
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

describe('Consistent operator colours', () => {
  it('assigns a colour to every operator in the imported network', () => {
    for (const operator of Object.keys(manifest.counts.operators)) {
      expect(operatorColors).toHaveProperty(operator);
      expect(routeColor(operator)).toMatch(/^#[\da-f]{6}$/i);
      expect(routeColor(operator)).not.toBe(routeColor('unknown'));
    }
  });

  it('distinguishes Citybus yellow, KMB red, Long Win orange and green minibuses', () => {
    expect(routeColor('CTB')).toBe('#f7b500');
    expect(new Set(['CTB', 'KMB', 'LWB', 'GMB'].map(routeColor)).size).toBe(4);
    expect(routeIconColor('CTB')).toBe('#17212b');
    expect(routeIconColor('LWB')).toBe('#17212b');
  });

  it('keeps every bus icon readable against its assigned background', () => {
    const luminance = (hex: string) => {
      const rgb = hex.slice(1).match(/../g)!.map(part => parseInt(part, 16) / 255)
        .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    for (const operator of Object.keys(operatorColors)) {
      const values = [luminance(routeColor(operator)), luminance(routeIconColor(operator))].sort((a, b) => a - b);
      expect((values[1] + 0.05) / (values[0] + 0.05)).toBeGreaterThanOrEqual(3);
    }
  });

  it('shows joint-service identity while leaving the weighting operator and score unchanged', () => {
    const leg = { operator: 'KMB', mode: 'BUS', journeyTimeMinutes: 20, scheduledWaitMinutes: 0 };
    const original = scored([leg]), joint = scored([{ ...leg, networkOperator: 'KMB+CTB' }]);
    expect(legOperator(joint.legs[0])).toBe('KMB+CTB');
    expect(joint.legs[0].operator).toBe('KMB');
    expect(joint.finalScore).toBe(original.finalScore);
    expect(routeColor(legOperator(joint.legs[0]))).not.toBe(routeColor('KMB'));
  });
});
