import { describe, expect, it } from 'vitest';
import { boardingReadyTime, selectJourneyDeparture } from './departureSelection';
import type { RouteOption, TransitLeg } from '../engine/UpgradedScoringEngine';
import type { LiveDeparture } from '../data/networkTimetable';

const now = Date.parse('2026-11-18T02:00:00Z');
const at = (minutes: number) => new Date(now + minutes * 60000).toISOString();
const departure = (minutes: number, extra = {}): LiveDeparture => ({ time: at(minutes), minutes, operator: 'KMB', scheduleMatch: 'MATCHED', timingType: 'LIVE', ...extra });
const leg = (i: number): TransitLeg => ({ id: String(i), operator: 'KMB', mode: 'BUS', routeNumber: '44',
  originStop: { id: 'a' + i, name: 'A' }, destinationStop: { id: 'b' + i, name: 'B' }, fare: 6,
  scheduledIntervalMinutes: 10, journeyTimeMinutes: 10, realtimeEta: null,
  accessWalkMinutes: i ? 3 : 2, departureTime: at(i ? 20 : 5), arrivalTime: at(i ? 30 : 15) });
const route = (): RouteOption => ({ id: 'test', legs: [leg(0), leg(1)], departureTime: at(0), arrivalTime: at(32),
  originWalkMinutes: 2, destinationWalkMinutes: 2, transferCount: 1, walkTransferTimeMinutes: 7, timeMode: 'now' });

describe('Selectable departures', () => {
  it('catches the next onward service instead of shifting its previous time blindly', () => {
    const original = route();
    const result = selectJourneyDeparture(original, 0, departure(15), 'choice', (_, ready) => {
      expect(ready.toISOString()).toBe(at(28));
      return { departure: departure(35, { timingType: 'SCHEDULED' }) };
    }, 3, now);
    expect(result.legs[0].arrivalTime).toBe(at(25));
    expect(result.legs[1].departureTime).toBe(at(35));
    expect(result.arrivalTime).toBe(at(47));
    expect(result.legs[1].realtimeEta?.isLive).toBe(false);
    expect(original.legs[0].departureTime).toBe(at(5));
  });
  it('preserves the prefix and waypoint walking when selecting a later leg', () => {
    const original = route(); original.legs[1].accessWalkMinutes = 9;
    original.viaStops = [{ stop: { id: 'via', name: 'Via' }, legIndex: 1 }];
    expect(boardingReadyTime(original, 1, 3, now)).toBe(Date.parse(at(24)));
    const result = selectJourneyDeparture(original, 1, departure(30), 'later', () => undefined, 3, now);
    expect(result.legs[0]).toEqual(original.legs[0]);
    expect(result.viaStops).toEqual(original.viaStops);
    expect(result.arrivalTime).toBe(at(42));
  });
  it('rejects early, cancelled, missed and unreachable onward departures', () => {
    expect(() => selectJourneyDeparture(route(), 0, departure(1), '', () => undefined, 3, now)).toThrow('cannot be reached');
    for (const departureType of ['CANCELLED', 'MISSED'] as const) expect(() => selectJourneyDeparture(route(), 0, departure(5, { departureType }), '', () => undefined, 3, now)).toThrow('Invalid');
    expect(() => selectJourneyDeparture(route(), 0, departure(15), '', () => undefined, 3, now)).toThrow('No reachable');
  });
  it('retains the selected company on a joint service for fare recalculation', () => {
    const original = route(); original.legs[0].networkOperator = 'KMB+CTB';
    const result = selectJourneyDeparture(original, 0, departure(5, { operator: 'CTB' }), 'ctb', () => ({ departure: departure(20) }), 3, now);
    expect(result.legs[0].operator).toBe('CTB');
    expect(result.legs[0].selectedDepartureKey).toBe('ctb');
  });
  it('starts a walking suffix immediately after arrival without a bus transfer buffer', () => {
    const original = route(); original.legs[1] = { ...leg(1), mode: 'WALK', accessWalkMinutes: 0, journeyTimeMinutes: 4 };
    const result = selectJourneyDeparture(original, 0, departure(15), 'walk', () => undefined, 15, now);
    expect(result.legs[1].departureTime).toBe(at(25));
    expect(result.arrivalTime).toBe(at(31));
  });
});
