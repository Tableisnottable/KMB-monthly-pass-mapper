import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, legCorridors, preferencePenalty, parseRoutePreferences } from './routePreferences';
import { networkPatterns, networkRoutes } from '../data/transportNetwork';
import { operatorAllowed, parseOperatorSelection } from './operatorSelection';
const leg = (number: string) => {
  const p = networkPatterns.find(p => networkRoutes[p.r][2] === number && networkRoutes[p.r][5] === 'BUS')!;
  return { operator: 'KMB', networkPatternId: p.id, boardingIndex: 0, alightingIndex: p.s.length - 1 };
};
describe('Company and road preferences', () => {
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
  it('penalises other identified roads while retaining rail and unclassified paths', () => {
    const preference = { ...DEFAULT_PREFERENCES, harbour: 'whc' };
    expect(preferencePenalty({ id: 'a', legs: [leg('104')] }, preference)).toBe(15);
    expect(preferencePenalty({ id: 'b', legs: [leg('961')] }, preference)).toBe(0);
    expect(preferencePenalty({ id: 'c', legs: [{ operator: 'MTR', mode: 'SUBWAY' }] }, preference)).toBe(0);
    expect(() => parseRoutePreferences('{"harbour":"unknown"}')).toThrow();
  });
});
