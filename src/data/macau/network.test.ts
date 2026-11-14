import { describe, expect, it } from 'vitest';
import { statSync } from 'node:fs';
import { macauCoverage, macauPatterns, macauStops, lrtFare, macauOffsets } from './network';
import { macauGeometry } from './geometry';
import { findMacauPlaces } from './placeSearch';
import { inMacau } from '../../domain/macau';
describe('Separate Macau dataset', () => {
  it('contains the official bus directory and all three LRT lines with platform identities', () => {
    const buses = macauPatterns.filter(p => p.mode === 'BUS'), rail = macauPatterns.filter(p => p.mode === 'LIGHT_RAIL');
    expect(new Set(buses.map(p => p.number)).size).toBe(macauCoverage.routes);
    expect(buses.length).toBe(111); expect(rail.length).toBe(6);
    expect(new Set(rail.map(p => p.number)).size).toBe(3);
    expect(macauStops.some(s => s[0].includes('/'))).toBe(true);
    expect(new Set(macauPatterns.map(p => p.id)).size).toBe(macauPatterns.length);
    for (const p of macauPatterns) {
      expect(['MO_TRANSMAC', 'MO_TCM', 'MO_LRT']).toContain(p.operator);
      expect(p.paths.length).toBeGreaterThan(0);
      expect(macauOffsets.get(p.id)!.length).toBe(p.stops.length);
      for (const s of p.stops) { expect(inMacau(s[3], s[4])).toBe(true); expect(s[1].length).toBeGreaterThan(0); expect(s[2].length).toBeGreaterThan(0); }
    }
  });
  it('keeps source data under one megabyte per file and raw extracts out of Git', () => {
    for (const name of ['buses-0.json', 'buses-1.json', 'rail.json', 'places.json']) expect(statSync('src/data/macau/' + name).size).toBeLessThan(1_000_000);
  });
  it.each([['機場', 'zh'], ['Airport', 'en'], ['大三巴', 'zh'], ['Ruins of St', 'en'], ['氹仔碼頭', 'zh'], ['Hengqin', 'en']] as const)('finds local stops or landmarks for %s', (q, locale) => {
    const places = findMacauPlaces(q, locale); expect(places.length).toBeGreaterThan(0);
    expect(places.every(p => inMacau(p.lat, p.lng))).toBe(true);
  });
  it('uses adult, general-card and eligible-student LRT bands without Hong Kong currency', () => {
    const p = macauPatterns.find(p => p.number === 'TAIPA' && p.direction === '0')!.stops.map(s => s[0]);
    expect(lrtFare(p, 'cash')).toBe(12); expect(lrtFare(p, 'macau-pass')).toBe(6); expect(lrtFare(p, 'student')).toBe(3);
    // Three ordinary sections plus the additional sea-crossing fare section.
    expect(lrtFare(p.slice(0, 4), 'cash')).toBe(8);
    expect(lrtFare(p.slice(1, 4), 'cash')).toBe(6);
    // Union Hospital does not count when passing through on the Taipa line.
    expect(lrtFare(['LRT:COTAI-WEST','LRT:LOTUS','LRT:UNION-HOSPITAL','LRT:EAST-ASIAN-GAMES','LRT:COTAI-EAST'], 'cash')).toBe(6);
    expect(lrtFare(['LRT:SEAC-PAI-VAN','LRT:UNION-HOSPITAL','LRT:EAST-ASIAN-GAMES','LRT:COTAI-EAST','LRT:MUST'], 'cash')).toBe(8);
  });
  it('returns real paths for a partial bus journey and all six rail patterns', () => {
    const bus = macauPatterns.find(p => p.number === '26A' && p.direction === '0')!;
    const paths = macauGeometry(bus, 2, 8); expect(paths.flat().length).toBeGreaterThan(10);
    for (const rail of macauPatterns.filter(p => p.mode === 'LIGHT_RAIL')) expect(macauGeometry(rail, 0, rail.stops.length - 1).length).toBe(rail.stops.length - 1);
  });
  it('never connects disconnected source pieces or falls back to a straight chord', () => {
    const p = { ...macauPatterns[0], stops: [['a','A','A',22.16,113.55,false],['b','B','B',22.162,113.552,false]],
      paths: [[[22.16,113.55],[22.161,113.55]],[[22.161,113.552],[22.162,113.552]]] } as typeof macauPatterns[number];
    const paths = macauGeometry(p, 0, 1); expect(paths).toHaveLength(2);
    expect(paths[0].at(-1)).not.toEqual(paths[1][0]);
    expect(macauGeometry({ ...p, paths: [] }, 0, 1)).toEqual([]);
    expect(macauGeometry(p, -1, 1)).toEqual([]);
  });
});
