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

describe('Real stop-plate colour conventions', () => {
  it('uses burgundy / white for Cityflyer A routes and navy / yellow for Long Win A routes', () => {
    for (const number of ['A20', 'A21', 'A23', 'A28']) {
      expect(routeBadgeStyle('CTB', number)).toMatchObject({ backgroundColor: '#7b2335', color: '#ffffff' });
    }
    expect(routeBadgeStyle('LWB', 'A31')).toMatchObject({ backgroundColor: '#002b5c', color: '#ffdf00' });
  });

  it('distinguishes airport E services by route, not just the bus company', () => {
    expect(routeColor('CTB', 'E21')).toBe('#d71920');
    expect(routeColor('CTB', 'E11A')).toBe('#007d40');
    expect(routeColor('CTB', 'E18')).toBe('#007d40');
    expect(routeColor('LWB', 'E32')).toBe('#f58220');
    expect(routeIconColor('LWB', 'E32')).toBe('#ffffff');
  });

  it('uses tunnel colours for joint services and retains the route-number exceptions', () => {
    expect(routeColor('KMB+CTB', '171')).toBe('#d71920');
    expect(routeColor('KMB+CTB', '970')).toBe('#007d40');
    expect(routeColor('KMB', '600X')).toBe('#d71920');
    expect(routeColor('KMB', '603')).toBe('#d71920');
    expect(routeSignColours('CTB', '382').verified).toBe(false);
    expect(routeColor('CTB', '629')).toBe('#005da6');
    expect(routeColor('CTB', '314')).toBe('#005da6');
    expect(routeColor('CTB', 'B4')).toBe('#005da6');
    expect(routeColor('CTB', 'B5')).toBe('#d71920');
  });

  it('keeps ordinary KMB and MTR Bus numbers black on white instead of using the body livery', () => {
    for (const [operator, number] of [['KMB', '2A'], ['LRTFeeder', 'K51']]) {
      expect(routeBadgeStyle(operator, number)).toMatchObject({ backgroundColor: '#ffffff', color: '#111111' });
      expect(routeColor(operator, number)).toBe('#111111');
    }
  });

  it('uses white or yellow numbers on black for the corresponding overnight services', () => {
    expect(routeBadgeStyle('CTB', 'NA21')).toMatchObject({ backgroundColor: '#111111', color: '#ffdf00' });
    expect(routeBadgeStyle('CTB', '796S')).toMatchObject({ backgroundColor: '#005da6', color: '#ffffff' });
    expect(routeBadgeStyle('CTB', '701S')).toMatchObject({ backgroundColor: '#005da6', color: '#ffffff' });
    expect(routeBadgeStyle('KMB', '270S')).toMatchObject({ backgroundColor: '#ffffff', color: '#111111' });
    expect(routeBadgeStyle('KMB', 'N241')).toMatchObject({ backgroundColor: '#111111', color: '#ffffff' });
    expect(routeBadgeStyle('LWB', 'NA31')).toMatchObject({ backgroundColor: '#111111', color: '#ffffff' });
    expect(routeSignColours('CTB', 'NR61').verified).toBe(false);
  });

  it('keeps New Lantao, shuttle, sightseeing and premium plate conventions separate', () => {
    expect(routeBadgeStyle('NLB', 'A35')).toMatchObject({ backgroundColor: '#d71920', color: '#ffdf00' });
    expect(routeBadgeStyle('NLB', '3M')).toMatchObject({ backgroundColor: '#005da6', color: '#ffffff' });
    expect(routeBadgeStyle('NLB', 'B2')).toMatchObject({ backgroundColor: '#ffffff', color: '#111111' });
    expect(routeBadgeStyle('LWB+CTB', 'S1')).toMatchObject({ backgroundColor: '#f58220', color: '#002b5c' });
    expect(routeColor('KMB', 'P960')).toBe('#a25466');
    expect(routeSignColours('KMB', 'HK1').verified).toBe(false);
  });

  it('uses an explicit neutral fallback when the actual sign design is not verified', () => {
    for (const operator of ['DB', 'PI', 'XB', 'unknown']) {
      expect(routeSignColours(operator, 'example')).toMatchObject({ background: '#ffffff', foreground: '#111111', line: '#656565', verified: false });
    }
  });

  it('produces valid, visible styles for every imported route without drawing white map lines', () => {
    for (const route of catalogue) {
      const colours = routeSignColours(route[1], route[2]);
      for (const colour of [colours.background, colours.foreground, colours.line]) expect(colour).toMatch(/^#[\da-f]{6}$/i);
      expect(colours.line).not.toBe('#ffffff');
      expect(colours.foreground).not.toBe(colours.background);
    }
  });

  it('retains joint-service identity without changing the weighting operator or score', () => {
    const leg = { operator: 'KMB', routeNumber: '171', mode: 'BUS', journeyTimeMinutes: 20, scheduledWaitMinutes: 0 };
    const original = scored([leg]), joint = scored([{ ...leg, networkOperator: 'KMB+CTB' }]);
    expect(legOperator(joint.legs[0])).toBe('KMB+CTB');
    expect(joint.legs[0].operator).toBe('KMB');
    expect(joint.finalScore).toBe(original.finalScore);
    expect(routeColor(legOperator(joint.legs[0]), '171')).toBe(routeColor('KMB', '171'));
  });
});
