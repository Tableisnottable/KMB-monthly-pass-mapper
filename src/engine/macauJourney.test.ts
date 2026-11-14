import { describe, expect, it } from 'vitest';
import { findMacauJourneys, lrtServiceWindow } from './macauJourney';
import { macauPatterns, macauStops } from '../data/macau/network';
import { DEFAULT_LIMITS } from '../domain/journeyLimits';
import { UpgradedScoringEngine } from './UpgradedScoringEngine';
const point = (id: string) => { const s = macauStops.find(s => s[0] === id)!; return { lat: s[3], lng: s[4] }; };
const anchor = new Date('2026-11-14T14:00:00+08:00');
const from = point('LRT:BARRA'), to = point('LRT:AIRPORT');
describe('Macau routing with the existing scoring formula', () => {
  it('excludes topology-only buses by default and returns MOP LRT journeys', () => {
    const routes = findMacauJourneys(from, to, anchor, 'en'); expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(route.currency).toBe('MOP'); expect(route.unverifiedBus).toBe(false);
      expect(route.selectedFare).toBe(route.discountedFare);
      expect(route.legs.every(l => l.operator === 'MO_LRT' && l.serviceStatus === 'UNVERIFIED' && !l.realtimeEta)).toBe(true);
      expect(route.finalScore).toBe(UpgradedScoringEngine.calculateRouteScore(route, anchor).finalScore);
    }
  });
  it.each([false, true])('keeps every leg chronological and respects a 15-minute change (reverse=%s)', reverse => {
    const routes = findMacauJourneys(from, point('LRT:SEAC-PAI-VAN'), anchor, 'en', reverse, { changeMinutes: 15, limits: { ...DEFAULT_LIMITS, walk: 0 } });
    expect(routes.length).toBeGreaterThan(0); expect(routes.some(r => r.legs.length > 1)).toBe(true);
    for (const r of routes) {
      expect(Date.parse(r.arrivalTime!)).toBeGreaterThan(Date.parse(r.departureTime!));
      if (reverse) expect(Date.parse(r.arrivalTime!)).toBeLessThanOrEqual(anchor.getTime());
      else expect(Date.parse(r.departureTime!)).toBe(anchor.getTime());
      r.legs.forEach((l, i) => {
        expect(Date.parse(l.arrivalTime!) - Date.parse(l.departureTime!)).toBe(l.journeyTimeMinutes! * 60000);
        if (i) expect(Date.parse(l.departureTime!) - Date.parse(r.legs[i - 1].arrivalTime!)).toBeGreaterThanOrEqual(15 * 60000);
      });
      const accounting = r.walkTransferTimeMinutes + r.legs.reduce((n, l) => n + l.journeyTimeMinutes! + (l.scheduledWaitMinutes ?? 0), 0);
      expect((Date.parse(r.arrivalTime!) - Date.parse(r.departureTime!)) / 60000).toBeCloseTo(accounting, 5);
    }
  });
  it('combines continuous paid-area LRT fares across an interchange', () => {
    const route = findMacauJourneys(from, point('LRT:SEAC-PAI-VAN'), anchor, 'en', false, { payment: 'student', limits: { ...DEFAULT_LIMITS, walk: 0 } }).find(r => r.legs.length === 2)!;
    expect(route).toBeDefined(); expect(route.legs[1].fare).toBe(0); expect(route.selectedFare).toBe(route.discountedFare / 4);
  });
  it('requires explicit bus opt-in, respects Must/Ban and does not invent card fares', () => {
    const p = macauPatterns.find(p => p.number === '26A')!, a = p.stops[0], b = p.stops[Math.floor(p.stops.length / 2)];
    const routes = findMacauJourneys({ lat:a[3],lng:a[4] }, { lat:b[3],lng:b[4] }, anchor, 'en', false,
      { includeBusEstimates: true, operators: [p.operator], requiredOperators: [p.operator], payment: 'macau-pass', limits: { ...DEFAULT_LIMITS, transfers: 0 } });
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) { expect(r.unverifiedBus).toBe(true); expect(r.selectedFare).toBeNull(); expect(r.discountedFare).toBe(6); expect(r.legs.every(l => l.operator === p.operator)).toBe(true); }
    expect(findMacauJourneys(from, to, anchor, 'en', false, { operators: [] })).toEqual([]);
    expect(findMacauJourneys(from, to, anchor, 'en', false, { requiredOperators: ['MO_TCM'] })).toEqual([]);
  });
  it('enforces walking, ride, wait and transfer limits', () => {
    for (const key of ['ride', 'wait'] as const) expect(findMacauJourneys(from, to, anchor, 'en', false, { limits: { ...DEFAULT_LIMITS, [key]: 0 } })).toEqual([]);
    expect(findMacauJourneys(from, point('LRT:SEAC-PAI-VAN'), anchor, 'en', false, { limits: { ...DEFAULT_LIMITS, walk: 0, transfers: 0 } })).toEqual([]);
  });
  it('uses weekday/weekend service windows and handles the preceding service day', () => {
    const thu = lrtServiceWindow(new Date('2026-11-12T12:00:00+08:00')), fri = lrtServiceWindow(new Date('2026-11-13T12:00:00+08:00'));
    expect(new Date(thu.first).toISOString()).toBe('2026-11-11T22:30:00.000Z');
    expect(new Date(thu.last).toISOString()).toBe('2026-11-12T15:15:00.000Z');
    expect(new Date(fri.last).toISOString()).toBe('2026-11-13T15:59:00.000Z');
    const late = findMacauJourneys(point('LRT:MUST'), to, new Date('2026-11-15T00:05:00+08:00'), 'en');
    expect(late.length).toBeGreaterThan(0); expect(Date.parse(late[0].departureTime!)).toBe(Date.parse('2026-11-15T00:05:00+08:00'));
  });
});
