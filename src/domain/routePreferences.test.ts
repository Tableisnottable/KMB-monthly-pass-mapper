import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, corridorChoices, corridorIds, legCorridors, preferencePenalty, parseRoutePreferences, corridorLegAllowed, roadLevel, routeRoadsAllowed, type RoutePreferences } from './routePreferences';
import intervals from '../data/corridorSegments.json';
import { networkPatterns, networkRoutes } from '../data/transportNetwork';
import { operatorAllowed, parseOperatorSelection } from './operatorSelection';
const leg = (number: string, operator?: string) => {
  const p = networkPatterns.find(p => networkRoutes[p.r][2] === number && networkRoutes[p.r][5] === 'BUS' && (!operator || networkRoutes[p.r][1] === operator))!;
  return { operator: 'KMB', networkPatternId: p.id, boardingIndex: 0, alightingIndex: p.s.length - 1 };
};
describe('Company and road preferences', () => {
  it('uses the corrected Nam Wan road label while retaining its saved corridor ID', () => {
    expect(corridorChoices.airport.find(([id]) => id === 'airporttunnel')?.slice(1)).toEqual(['南灣', 'Nam Wan']);
    expect(corridorIds).toContain('airporttunnel');
  });
  it('excludes banned companies and joint services containing a banned company', () => {
    expect(operatorAllowed('KMB', ['KMB'])).toBe(true); expect(operatorAllowed('KMB+CTB', ['KMB'])).toBe(false);
    expect(operatorAllowed('MTR', [])).toBe(false); expect(operatorAllowed('KMB+CTB', ['KMB', 'CTB'])).toBe(true);
    expect(() => parseOperatorSelection('evil')).toThrow();
  });
  it.each([['104', 'cht'], ['619', 'ehc'], ['961', 'whc'], ['A31', 'lantau'], ['A33X', 'tmclk'], ['286X', 'tsingsha'], ['170', 'lion'], ['49X', 'shingmun'], ['680', 'tate']])('detects the actual travelled alignment on %s', (number, corridor) => {
    expect(legCorridors(leg(number))).toContain(corridor);
  });
  it('does not label a partial journey as using a tunnel beyond the alighting stop', () => {
    const full = leg('104');
    expect(legCorridors({ ...full, alightingIndex: 1 })).not.toContain('cht');
  });
  it('recognises both directions and variants of 961, but not the 280X toll-plaza approach', () => {
    for (const p of networkPatterns.filter(p => ['961', '280X'].includes(networkRoutes[p.r][2]))) {
      const corridors = legCorridors({ operator: 'KMB', networkPatternId: p.id, boardingIndex: 0, alightingIndex: p.s.length - 1 });
      if (networkRoutes[p.r][2] === '961') expect(corridors).toContain('whc');
      else expect(corridors).not.toContain('whc');
    }
  });
  it('requires the selected road while retaining rail and unclassified paths', () => {
    const preference = { ...DEFAULT_PREFERENCES, roads: { whc: 'must' as const } };
    expect(routeRoadsAllowed({ id: 'a', legs: [leg('104')] }, preference)).toBe(false);
    expect(preferencePenalty({ id: 'b', legs: [leg('961')] }, preference)).toBe(0);
    expect(preferencePenalty({ id: 'c', legs: [{ operator: 'MTR', mode: 'SUBWAY' }] }, preference)).toBe(0);
    expect(() => parseRoutePreferences('{"harbour":"unknown"}')).toThrow();
  });
  it.each([['268C', 'tailam'], ['60X', 'tuenmun'], ['51', 'twisk'], ['98D', 'tko'], ['96', 'tkolam'], ['6X', 'aberdeen'], ['63', 'gap']])('recognises expanded road alternatives on %s', (number, id) => {
    const variants = networkPatterns.filter(p => networkRoutes[p.r][2] === number && networkRoutes[p.r][5] === 'BUS');
    expect(variants.some(p => legCorridors({ operator: networkRoutes[p.r][1], networkPatternId: p.id, boardingIndex: 0, alightingIndex: p.s.length - 1 }).includes(id))).toBe(true);
  });
  it('does not mistake the EHC approaches for the TKO–Lam Tin Tunnel', () => {
    expect(legCorridors(leg('619'))).not.toContain('tkolam');
    expect(legCorridors(leg('680'))).not.toContain('tkolam');
  });
  it('offers unique roads with actual travelled intervals and accepts their settings', () => {
    expect(corridorIds.length).toBeGreaterThanOrEqual(28);
    expect(new Set(corridorIds).size).toBe(corridorIds.length);
    for (const id of corridorIds) {
      const sample = intervals.find(row => row[2] === id)!;
      expect(sample, id).toBeDefined();
      const pattern = String(sample[0]), start = Number(sample[1]);
      const preferences = parseRoutePreferences(JSON.stringify({ roads: { [id]: 'ban' } }));
      expect(corridorLegAllowed(pattern, start, start + 1, preferences), id).toBe(false);
      expect(corridorLegAllowed(pattern, start + 1, start + 1, preferences), id).toBe(true);
    }
  });
  it('bans only the travelled interval, including backwards-search intervals', () => {
    const full = leg('104'), preferences: RoutePreferences = { ...DEFAULT_PREFERENCES, roads: { cht: 'ban' } };
    expect(corridorLegAllowed(full.networkPatternId, 0, full.alightingIndex, preferences)).toBe(false);
    expect(corridorLegAllowed(full.networkPatternId, 0, 1, preferences)).toBe(true);
    expect(corridorLegAllowed(leg('961').networkPatternId, 0, leg('961').alightingIndex, preferences)).toBe(true);
  });
  it('preserves saved soft preferences while explicit Must remains mandatory', () => {
    const preferences = parseRoutePreferences('{"harbour":"whc","roads":{"cht":"prefer","whc":"normal","ehc":"prefer"}}');
    expect(roadLevel(preferences, 'whc')).toBe('normal');
    expect(preferencePenalty({ id: 'a', legs: [leg('104')] }, preferences)).toBe(0);
    expect(preferencePenalty({ id: 'b', legs: [leg('619')] }, preferences)).toBe(0);
    expect(roadLevel(preferences, 'cht')).toBe('prefer');
    expect(roadLevel(preferences, 'ehc')).toBe('prefer');
    expect(roadLevel(parseRoutePreferences('{"harbour":"cht"}'), 'cht')).toBe('prefer');
    expect(routeRoadsAllowed({ id: 'c', legs: [leg('961')] }, preferences)).toBe(true);
    const must = parseRoutePreferences('{"roads":{"cht":"must"}}');
    expect(routeRoadsAllowed({ id: 'c', legs: [leg('961')] }, must)).toBe(false);
    expect(routeRoadsAllowed({ id: 'd', legs: [leg('104')] }, must)).toBe(true);
  });
  it('treats Must roads in one group as alternatives and separate groups as joint requirements', () => {
    const harbour = parseRoutePreferences('{"roads":{"cht":"must","ehc":"must"}}');
    expect(routeRoadsAllowed({ id: 'cht', legs: [leg('104')] }, harbour)).toBe(true);
    expect(routeRoadsAllowed({ id: 'ehc', legs: [leg('619')] }, harbour)).toBe(true);
    expect(routeRoadsAllowed({ id: 'whc', legs: [leg('961')] }, harbour)).toBe(false);

    const harbourAndAirport = parseRoutePreferences('{"roads":{"cht":"must","ehc":"must","lantau":"must"}}');
    expect(routeRoadsAllowed({ id: 'both', legs: [leg('104'), leg('A31')] }, harbourAndAirport)).toBe(true);
    expect(routeRoadsAllowed({ id: 'harbour-only', legs: [leg('104')] }, harbourAndAirport)).toBe(false);
  });
  it.each(['{"roads":{"unknown":"ban"}}', '{"roads":{"cht":"invalid"}}', '{"roads":[]}', '{"roads":null}', '{"__proto__":"cht"}'])('rejects unsafe road states %s', raw => {
    expect(() => parseRoutePreferences(raw)).toThrow();
  });
});
