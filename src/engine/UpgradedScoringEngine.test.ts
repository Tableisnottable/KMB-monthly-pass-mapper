import { describe, expect, it } from 'vitest';
import {
  UpgradedScoringEngine,
  scoreRoutes,
  type Route,
  type Segment,
} from './UpgradedScoringEngine';

const STOP_A = { id: 'a', name: 'Stop A', lat: 22.3, lng: 114.17 };
const STOP_B = { id: 'b', name: 'Stop B', lat: 22.32, lng: 114.19 };

function leg(overrides: Partial<Segment> = {}): Segment {
  return {
    operator: 'KMB',
    mode: 'BUS',
    routeNumber: '1A',
    journeyTimeMinutes: 20,
    scheduledIntervalMinutes: 10,
    originStop: STOP_A,
    destinationStop: STOP_B,
    realtimeEta: null,
    fare: 6.8,
    ...overrides,
  };
}

describe('UpgradedScoringEngine', () => {
  describe('getTimeMultiplier', () => {
    it('applies a higher multiplier at night', () => {
      expect(UpgradedScoringEngine.getTimeMultiplier(new Date(2026, 9, 14, 0, 30))).toBe(1.8);
    });

    it('applies the base multiplier outside peak bands', () => {
      expect(UpgradedScoringEngine.getTimeMultiplier(new Date(2026, 9, 14, 12, 0))).toBe(1.3);
    });

    it('applies the base multiplier inside the morning peak', () => {
      expect(UpgradedScoringEngine.getTimeMultiplier(new Date(2026, 9, 14, 8, 0))).toBe(1);
    });

    it('applies the default multiplier at regular times', () => {
      expect(UpgradedScoringEngine.getTimeMultiplier(new Date(2026, 9, 14, 15, 0))).toBe(1.3);
    });
  });

  describe('getOperatorAdjustment', () => {
    it('returns the known KMB adjustment', () => {
      expect(UpgradedScoringEngine.getOperatorAdjustment('KMB')).toBe(-1);
    });

    it('returns the known MTR adjustment', () => {
      expect(UpgradedScoringEngine.getOperatorAdjustment('MTR')).toBe(0.5);
    });

    it('returns zero for unknown operators', () => {
      expect(UpgradedScoringEngine.getOperatorAdjustment('UNKNOWN')).toBe(0);
    });
  });

  describe('calculateSegmentScore', () => {
    it('uses actual timetable waiting rather than double-counting half the headway', () => {
      expect(UpgradedScoringEngine.calculateSegmentScore(leg({ scheduledWaitMinutes: 2, scheduledIntervalMinutes: 30 }), new Date(2026, 10, 13, 12))).toBe(21.6);
    });
    it('subtracts access walking from a live arrival before applying the waiting multiplier', () => {
      expect(UpgradedScoringEngine.calculateSegmentScore(leg({ accessWalkMinutes: 5, realtimeEta: { etaMinutes: 8, isLive: true, dataTime: '', source: 'DATAGOVHK' } }), new Date(2026, 10, 13, 12))).toBe(22.9);
    });
    it('prefers a live ETA over the scheduled wait', () => {
      const withLive = leg({ realtimeEta: { etaMinutes: 3, dataTime: new Date().toISOString(), isLive: true, source: 'DATAGOVHK' } });
      const withScheduled = leg({ realtimeEta: null, scheduledIntervalMinutes: 12 });
      const date = new Date(2026, 9, 14, 15, 0);
      const liveScore = UpgradedScoringEngine.calculateSegmentScore(withLive, date);
      const scheduledScore = UpgradedScoringEngine.calculateSegmentScore(withScheduled, date);
      expect(liveScore).toBeLessThan(scheduledScore);
    });

    it('uses the scheduled half-headway when no live ETA is available', () => {
      const segment = leg({ scheduledIntervalMinutes: 10 });
      const date = new Date(2026, 9, 14, 15, 0);
      // journey 20 + wait (10*0.5*1.3) + operator (-1)
      expect(UpgradedScoringEngine.calculateSegmentScore(segment, date)).toBe(20 + 6.5 - 1);
    });
  });

  describe('calculateRouteScore', () => {
    it('adds a transfer penalty for multi-leg routes', () => {
      const route: Route = {
        id: 'r1',
        transferCount: 1,
        walkTransferTimeMinutes: 4,
        legs: [leg(), leg({ operator: 'MTR', mode: 'SUBWAY', routeNumber: 'Island Line', journeyTimeMinutes: 12 })],
      };
      const result = UpgradedScoringEngine.calculateRouteScore(route, new Date(2026, 9, 14, 12, 0));
      expect(result.transferPenalty).toBe(8);
      expect(result.walkTransferTime).toBe(5.4);
      expect(result.fareCost).toBe(6.12);
      expect(result.finalScore).toBe(Number((result.legSubtotal + 5.4 + 8 + 6.12).toFixed(2)));
    });
  });

  describe('calculateFare', () => {
    it('does not invent a same-operator interchange discount', () => {
      const legs = [leg({ fare: 8.7 }), leg({ fare: 6.8 })];
      const result = UpgradedScoringEngine.calculateFare(legs);
      expect(result.bbiDiscountApplied).toBe(0);
      expect(result.discountedFare).toBe(15.5);
    });

    it('charges both published adult fares even when the second fare is low', () => {
      const legs = [leg({ operator: 'KMB', fare: 12.5 }), leg({ operator: 'KMB', fare: 3.5 })];
      const result = UpgradedScoringEngine.calculateFare(legs);
      expect(result.bbiDiscountApplied).toBe(0);
      expect(result.discountedFare).toBe(16);
    });

    it('does not discount across different operators', () => {
      const legs = [leg({ operator: 'KMB', fare: 8.7 }), leg({ operator: 'MTR', mode: 'SUBWAY', routeNumber: 'TWL', fare: 9.5 })];
      const result = UpgradedScoringEngine.calculateFare(legs);
      expect(result.bbiDiscountApplied).toBe(0);
      expect(result.discountedFare).toBe(18.2);
    });
  });

  describe('scoreRoutes', () => {
    it('weights an entirely walking journey once and does not invent vehicle waiting', () => {
      const [route] = scoreRoutes([{ id: 'walk', legs: [leg({ operator: 'WALK', mode: 'WALK', journeyTimeMinutes: 20, fare: 0 })] }]);
      expect(route.finalScore).toBe(27);
      expect(route.breakdown.walkTransferTime).toBe(27);
      expect(route.breakdown.scheduledWait).toBe(0);
      expect(route.breakdown.journeyTime).toBe(0);
    });
    it('penalizes unverified service without changing its adult fare', () => {
      const routes = scoreRoutes([{ id: 'estimated', legs: [leg({ serviceStatus: 'UNVERIFIED' })] }, { id: 'timetable', legs: [leg({ serviceStatus: 'TIMETABLE' })] }]);
      expect(routes.map(r => r.id)).toEqual(['timetable', 'estimated']);
      expect(routes[1].finalScore - routes[0].finalScore).toBeCloseTo(4, 2);
      expect(routes[1].discountedFare).toBe(routes[0].discountedFare);
    });
    it('prefers the lower normal adult fare when time and transfers match', () => {
      const routes = scoreRoutes([{ id: 'premium', legs: [leg({ fare: 120 })] }, { id: 'normal', legs: [leg({ fare: 34.6 })] }]);
      expect(routes.map(r => r.id)).toEqual(['normal', 'premium']);
      expect(routes[0].breakdown.fareCost).toBe(15.57);
    });
    it('sorts results by ascending score and attaches breakdown', () => {
      const slow: Route = { id: 'slow', legs: [leg({ journeyTimeMinutes: 40 })] };
      const fast: Route = { id: 'fast', legs: [leg({ journeyTimeMinutes: 10 })] };
      const scored = scoreRoutes([slow, fast], new Date(2026, 9, 14, 12, 0));
      expect(scored.map((route) => route.id)).toEqual(['fast', 'slow']);
      expect(scored[0].breakdown.journeyTime).toBe(10);
      expect(scored[0].finalScore).toBeLessThan(scored[1].finalScore);
    });
  });
});
