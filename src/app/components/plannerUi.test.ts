import { describe, expect, it } from 'vitest';
import { scoreRoutes, type Route } from '../../engine/UpgradedScoringEngine';
import { fareLabel, hasEndedService, journeyMinutes, legOperator, modeIcon, routeBadgeStyle, routeColor, routeIconColor, routeSignColours } from './plannerUi';
import catalogue from '../../data/transport/routes-0.json';

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

describe('Bus display colours', () => {
  it('keeps company colours across local, tunnel, airport and premium routes', () => {
    for (const number of ['2A', '104', '301', '600X', '936', 'A23', 'E21', 'P960']) {
      expect(routeBadgeStyle('KMB', number)).toMatchObject({ backgroundColor: '#e62232', color: '#ffffff' });
      expect(routeBadgeStyle('CTB', number)).toMatchObject({ backgroundColor: '#f7b500', color: '#17212b' });
      expect(routeColor('LWB', number)).toBe('#ef8528');
    }
  });
  it('uses black with white text and icons for all N/NA night buses, including joint services', () => {
    for (const operator of ['KMB', 'CTB', 'LWB', 'NLB', 'KMB+CTB', 'LWB+CTB', 'unknown']) {
      for (const number of ['N122', 'N241', 'N8P', 'NA11', ' n21 ']) {
        expect(routeBadgeStyle(operator, number)).toEqual({ backgroundColor: '#000000', color: '#ffffff',
          '--route-icon-background': '#000000', '--route-icon-colour': '#ffffff' });
        expect(routeColor(operator, number)).toBe('#000000');
        expect(routeIconColor(operator, number)).toBe('#ffffff');
      }
    }
    const nightBuses = catalogue.filter(route => route[5] === 'BUS' && /^NA?\d/i.test(route[2]));
    expect(nightBuses.length).toBeGreaterThan(0);
    for (const route of nightBuses) expect(routeColor(route[1], route[2])).toBe('#000000');
  });
  it('does not treat NR residents routes or non-bus route numbers as night buses', () => {
    expect(routeSignColours('RESIDENTS', 'NR10')).toMatchObject({ line: '#656565', verified: false });
    expect(routeColor('NLB', '1')).toBe('#317dc1');
    for (const operator of ['MTR', 'LRT', 'GMB', 'FERRY', 'TRAM', 'PTRAM', 'WALK']) {
      expect(routeSignColours(operator, 'N1')).toEqual(routeSignColours(operator));
    }
  });
  it('shows both companies for joint routes without an invented joint colour', () => {
    expect(routeBadgeStyle('KMB+CTB', '914')).toMatchObject({ backgroundColor: '#e62232', color: '#ffffff',
      '--route-icon-background': '#f7b500', '--route-icon-colour': '#17212b' });
    expect(routeIconColor('KMB+CTB', '104')).toBe('#17212b');
    expect(routeColor('KMB+CTB', '914')).toBe(routeColor('KMB'));
    expect(routeBadgeStyle('LWB+CTB', 'S1')).toMatchObject({ backgroundColor: '#ef8528', '--route-icon-background': '#f7b500' });
  });
  it('has readable number and icon colours for every imported bus operator', () => {
    const luminance = (hex: string) => hex.slice(1).match(/../g)!.map(part => parseInt(part, 16) / 255)
      .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    for (const route of catalogue) {
      const colours = routeSignColours(route[1], route[2]);
      for (const colour of [colours.background, colours.foreground, colours.line]) expect(colour).toMatch(/^#[\da-f]{6}$/i);
      expect(colours.line).not.toBe('#ffffff');
      if (route[5] !== 'BUS') continue;
      const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
      expect(contrast(colours.background, colours.foreground)).toBeGreaterThanOrEqual(3);
      expect(contrast(colours.iconBackground ?? colours.background, colours.iconForeground ?? colours.foreground)).toBeGreaterThanOrEqual(3);
    }
  });
  it('retains a neutral fallback for an unknown company', () => {
    expect(routeSignColours('unknown')).toMatchObject({ line: '#656565', verified: false });
  });
  it('preserves joint-service scoring and catalogue identity', () => {
    const leg = { operator: 'KMB', routeNumber: '171', mode: 'BUS', journeyTimeMinutes: 20, scheduledWaitMinutes: 0 };
    const original = scored([leg]), joint = scored([{ ...leg, networkOperator: 'KMB+CTB' }]);
    expect(legOperator(joint.legs[0])).toBe('KMB+CTB');
    expect(joint.legs[0].operator).toBe('KMB');
    expect(joint.finalScore).toBe(original.finalScore);
  });
});
