import { describe, expect, it } from 'vitest';
import { getMonthlyPassInsight, KMB_MONTHLY_PASS_PRICES } from './monthlyPass';
import type { ScoredRoute, TransitLeg } from '../engine/UpgradedScoringEngine';

function leg(operator: string, fare: number): TransitLeg {
  return {
    id: `leg-${operator}-${fare}`,
    operator,
    mode: 'BUS',
    routeNumber: 'TEST',
    originStop: { id: 'a', name: 'A', lat: 0, lng: 0 },
    destinationStop: { id: 'b', name: 'B', lat: 0, lng: 0 },
    journeyTimeMinutes: 20,
    scheduledIntervalMinutes: 10,
    realtimeEta: null,
    fare,
  };
}

function route(legs: TransitLeg[], discountedFare?: number): ScoredRoute {
  const rawFare = legs.reduce((total, item) => total + (item.fare ?? 0), 0);
  return {
    id: 'route-1',
    legs,
    walkTransferTimeMinutes: 0,
    transferCount: Math.max(0, legs.length - 1),
    finalScore: 1,
    discountedFare: discountedFare ?? rawFare,
    bbiDiscountApplied: 0,
    breakdown: {
      legSubtotal: 0,
      journeyTime: 0,
      scheduledWait: 0,
      finalScore: 1,
      transferPenalty: 0,
      walkTransferTime: 0,
      longDistanceSurcharge: 0,
    },
    score: {
      finalScore: 1,
      legSubtotal: 0,
      transferPenalty: 0,
      walkTransferTime: 0,
      longDistanceSurcharge: 0,
    },
  } as unknown as ScoredRoute;
}

describe('getMonthlyPassInsight', () => {
  it('reports the full KMB fare as savings on a covered route', () => {
    const insight = getMonthlyPassInsight(route([leg('KMB', 20)]));

    expect(insight.coveredFare).toBe(20);
    expect(insight.uncoveredFare).toBe(0);
    expect(insight.savingThisTrip).toBe(20);
    expect(insight.isFullyCovered).toBe(true);
    expect(insight.coveredLegCount).toBe(1);
  });

  it('treats LWB as covered by the KMB pass', () => {
    expect(getMonthlyPassInsight(route([leg('LWB', 30)])).coveredFare).toBe(30);
  });

  it('leaves Citybus legs payable and split out', () => {
    const insight = getMonthlyPassInsight(route([leg('KMB', 10), leg('CTB', 15)]));

    expect(insight.coveredFare).toBe(10);
    expect(insight.uncoveredFare).toBe(15);
    expect(insight.isFullyCovered).toBe(false);
    expect(insight.uncoveredLegCount).toBe(1);
  });

  it('computes break-even trips from the covered fare', () => {
    const insight = getMonthlyPassInsight(route([leg('KMB', 20)]));

    expect(insight.breakEvenTrips).toBe(
      Math.ceil(KMB_MONTHLY_PASS_PRICES.NORMAL / 20),
    );
  });

  it('has no break-even figure when the pass covers nothing', () => {
    const insight = getMonthlyPassInsight(route([leg('CTB', 12)]));

    expect(insight.coveredFare).toBe(0);
    expect(insight.breakEvenTrips).toBeNull();
    expect(insight.savingThisTrip).toBe(0);
  });

  it('honours a student pass price', () => {
    const insight = getMonthlyPassInsight(
      route([leg('KMB', 20)]),
      KMB_MONTHLY_PASS_PRICES.STUDENT,
      'STUDENT',
    );

    expect(insight.passType).toBe('STUDENT');
    expect(insight.breakEvenTrips).toBe(
      Math.ceil(KMB_MONTHLY_PASS_PRICES.STUDENT / 20),
    );
  });

  it('rejects an invalid pass price', () => {
    expect(() => getMonthlyPassInsight(route([leg('KMB', 20)]), 0)).toThrow();
  });
});
