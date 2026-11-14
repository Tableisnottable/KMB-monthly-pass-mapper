import { describe, expect, it } from 'vitest';
import { scoreRoutes, type Route } from '../../engine/UpgradedScoringEngine';
import { fareLabel, hasEndedService, journeyMinutes, legOperator, modeIcon, routeBadgeStyle, routeColor, routeIconColor, routeSignColours } from './plannerUi';
import catalogue from '../../data/transport/routes-0.json';
import { routeLineColours, routeLineStyles } from './routeColours';

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
  it('keeps company colours across other local, airport and premium routes', () => {
    for (const number of ['2A', 'A23', 'E21', 'P960']) {
      expect(routeBadgeStyle('KMB', number)).toMatchObject({ backgroundColor: '#e62232', color: '#ffffff' });
      expect(routeBadgeStyle('CTB', number)).toMatchObject({ backgroundColor: '#f7b500', color: '#17212b' });
      expect(routeColor('LWB', number)).toBe('#ef8528');
    }
  });
  it('keeps company backgrounds and adds red 1xx/3xx/6xx and green 9xx to the mix', () => {
    for (const [number, colour] of [['104', '#d71920'], ['301', '#d71920'], ['600X', '#d71920'], ['936', '#007d40'], ['X970', '#007d40'], [' 914x ', '#007d40']]) {
      for (const [operator, company, foreground] of [['KMB', '#e62232', '#ffffff'], ['CTB', '#f7b500', '#17212b']]) {
        expect(routeBadgeStyle(operator, number)).toMatchObject({ backgroundColor: company, color: foreground,
          '--route-icon-background': company, '--route-icon-colour': foreground, '--route-icon-accent': colour });
        expect(routeBadgeStyle(operator, number).backgroundImage).toContain(company);
        expect(routeBadgeStyle(operator, number).backgroundImage).toContain(colour);
        expect(routeLineColours(operator, number)).toEqual([company, colour]);
        expect(routeColor(operator, number)).toBe(company);
      }
    }
  });
  it('applies family accents to other numbered bus routes while retaining company colours', () => {
    for (const number of ['314', '382', '628', '629', '634']) {
      expect(routeBadgeStyle('CTB', number)).toMatchObject({ backgroundColor: '#f7b500' });
      expect(routeLineColours('CTB', number)).toEqual(['#f7b500', '#d71920']);
    }
    expect(routeColor('GMB', '104')).toBe(routeColor('GMB'));
    expect(routeColor('RESIDENTS', 'NR104')).toBe('#656565');
    expect(routeColor('LWB', '936')).toBe('#ef8528');
  });
  it('adds black to N/NA night buses without losing either joint company colour', () => {
    for (const operator of ['KMB', 'CTB', 'LWB', 'NLB', 'KMB+CTB', 'LWB+CTB']) {
      for (const number of ['N122', 'N241', 'N8P', 'NA11', ' n21 ']) {
        expect(routeBadgeStyle(operator, number).backgroundColor).toBe(routeColor(operator));
        expect(routeLineColours(operator, number)).toEqual([...routeLineColours(operator), '#000000']);
        expect(routeBadgeStyle(operator, number).backgroundImage).toContain('#000000');
      }
    }
    const nightBuses = catalogue.filter(route => route[5] === 'BUS' && /^NA?\d/i.test(route[2]));
    expect(nightBuses.length).toBeGreaterThan(0);
    for (const route of nightBuses) expect(routeLineColours(route[1], route[2])).toContain('#000000');
  });
  it('does not treat NR residents routes or non-bus route numbers as night buses', () => {
    expect(routeSignColours('RESIDENTS', 'NR10')).toMatchObject({ line: '#656565', verified: false });
    expect(routeColor('NLB', '1')).toBe('#317dc1');
    for (const operator of ['MTR', 'LRT', 'GMB', 'FERRY', 'TRAM', 'PTRAM', 'WALK']) {
      expect(routeSignColours(operator, 'N1')).toEqual(routeSignColours(operator));
    }
  });
  it('retains both company colours alongside the route-family colour for joint services', () => {
    expect(routeBadgeStyle('KMB+CTB', '914')).toMatchObject({ backgroundColor: '#e62232', color: '#ffffff',
      '--route-icon-background': '#f7b500', '--route-icon-colour': '#17212b', '--route-icon-accent': '#007d40' });
    expect(routeBadgeStyle('KMB+CTB', '104')).toMatchObject({ backgroundColor: '#e62232',
      '--route-icon-background': '#f7b500', '--route-icon-accent': '#d71920' });
    expect(routeIconColor('KMB+CTB', '104')).toBe('#17212b');
    expect(routeColor('KMB+CTB', '914')).toBe('#e62232');
    expect(routeLineColours('KMB+CTB', '914')).toEqual(['#e62232', '#f7b500', '#007d40']);
    expect(routeBadgeStyle('LWB+CTB', 'S1')).toMatchObject({ backgroundColor: '#ef8528', '--route-icon-background': '#f7b500' });
  });
  it('uses purple for DB and keeps company colours consistent on other routes', () => {
    for (const number of ['DB01R', 'DB02R', 'DB03R', 'N1']) expect(routeColor('DB', number)).toBe('#71509c');
    expect(routeColor('LRT')).toBe(routeColor('MTR'));
    expect(routeLineColours('KMB+CTB', 'N122')).toEqual(['#e62232', '#f7b500', '#000000']);
    const layers = routeLineStyles('KMB+CTB', '914');
    expect(layers).toHaveLength(3); expect(layers[0].dashArray).toBeUndefined();
    expect(layers.slice(1).map(layer => [layer.color, layer.dashArray, layer.dashOffset])).toEqual([
      ['#f7b500', '12 24', '-12'], ['#007d40', '12 24', '-24'],
    ]);
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
      expect(colours.background).toBe(routeSignColours(route[1]).background);
      for (const member of route[1].split('+')) {
        if (routeSignColours(member).verified) expect(routeLineColours(route[1], route[2])).toContain(routeColor(member));
      }
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
