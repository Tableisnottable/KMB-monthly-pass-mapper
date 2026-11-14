import { describe, expect, it } from 'vitest';
import { getMonthlyPassInsight, getPassLegFare, KMB_MONTHLY_PASS_PRICES } from './monthlyPass';
import type { ScoredRoute, TransitLeg } from '../engine/UpgradedScoringEngine';

function leg(operator: string, fare: number, routeNumber = '1A'): TransitLeg {
  return {
    id: `leg-${operator}-${fare}`,
    operator,
    mode: 'BUS',
    routeNumber,
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

  it.each(['E32', 'N30', 'S1', 'R8', 'X33'])('includes LWB %s within the available daily quota', number => {
    expect(getMonthlyPassInsight(route([leg('LWB', 30, number)])).coveredFare).toBe(30);
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

  it.each(['A31', 'NA31'])('charges 27 percent rather than zero for LWB %s', number => {
    const result = getMonthlyPassInsight(route([leg('LWB', 20.6, number)]));
    expect(result.singleTripFare).toBe(20.6); expect(result.passFareMin).toBe(5.6);
    expect(result.passFareMax).toBe(5.6); expect(result.savingMin).toBe(15);
    expect(result.isFullyCovered).toBe(false); expect(result.benefitLegCount).toBe(1);
  });

  it('applies the HK1 discount without discounting a Citybus airport service', () => {
    expect(getPassLegFare(leg('KMB', 10, 'HK1')).minimum).toBe(2.7);
    expect(getPassLegFare(leg('CTB', 34.6, 'A23')).minimum).toBe(34.6);
  });

  it.each(['P960', 'P968'])('retains the current $5 charge on %s', number => {
    expect(getPassLegFare(leg('KMB', 30, number)).maximum).toBe(5);
    expect(getPassLegFare(leg('KMB', 4, number)).maximum).toBe(4);
  });

  it.each(['K12', 'K14', 'K17', 'K18'])('leaves excluded route %s payable', number => {
    expect(getMonthlyPassInsight(route([leg('KMB', 5, number)])).savingThisTrip).toBe(0);
  });

  it('keeps KMB racecourse services included under the current terms', () => {
    expect(getPassLegFare(leg('KMB', 30, '869')).maximum).toBe(0);
  });

  it('compares the actual complete 44>A31 and 44>E32 journeys', () => {
    const airport = getMonthlyPassInsight(route([leg('KMB', 8.9, '44'), leg('LWB', 20.6, 'A31')]));
    expect(airport.singleTripFare).toBe(29.5); expect(airport.passFareMax).toBe(5.6);
    const express = getMonthlyPassInsight(route([leg('KMB', 8.9, '44'), leg('LWB', 13.9, 'E32')]));
    expect(express.singleTripFare).toBe(22.8); expect(express.passFareMax).toBe(0);
  });

  it('does not treat a normalised KMB joint timetable as proof of a covered bus', () => {
    const joint = { ...leg('KMB', 12.9, '104'), networkOperator: 'KMB+CTB', serviceStatus: 'TIMETABLE' as const };
    const result = getMonthlyPassInsight(route([joint]));
    expect(result.passFareMin).toBe(0); expect(result.passFareMax).toBe(12.9);
    expect(result.operatorDependent).toBe(true); expect(result.breakEvenTrips).toBeNull();
  });

  it.each([['CTB', 12.9], ['KMB', 0]] as const)('uses the reachable live joint departure company %s', (operator, payable) => {
    const joint: TransitLeg = { ...leg('KMB', 12.9, '104'), networkOperator: 'KMB+CTB',
      realtimeEta: { isLive: true, etaMinutes: 3, dataTime: '', source: 'DATAGOVHK' },
      liveDepartures: [{ time: '2026-11-14T10:00:00+08:00', minutes: 3, operator, scheduleMatch: 'MATCHED' }] };
    const result = getMonthlyPassInsight(route([joint]));
    expect(result.passFareMin).toBe(payable); expect(result.passFareMax).toBe(payable);
    expect(result.operatorDependent).toBe(false);
  });

  it('does not trust a stale live operator for a scheduled joint journey', () => {
    const joint: TransitLeg = { ...leg('KMB', 12.9, '104'), networkOperator: 'KMB+CTB',
      realtimeEta: { isLive: false, etaMinutes: 3, dataTime: '', source: 'SCHEDULED' },
      liveDepartures: [{ time: '2026-11-14T10:00:00+08:00', minutes: 3, operator: 'KMB', scheduleMatch: 'MATCHED' }] };
    expect(getMonthlyPassInsight(route([joint])).operatorDependent).toBe(true);
  });

  it('leaves rail fares and walking independent of KMB pass eligibility', () => {
    const rail = { ...leg('MTR', 12, 'TWL'), mode: 'SUBWAY' };
    expect(getMonthlyPassInsight(route([rail])).passFareMax).toBe(12);
    expect(getMonthlyPassInsight(route([{ ...leg('WALK', 0), mode: 'WALK' }])).isFullyCovered).toBe(false);
  });

  it('does not turn unknown fares into a free pass journey', () => {
    const unknown = { ...leg('KMB', 0), fareStatus: 'UNAVAILABLE' as const };
    const result = getMonthlyPassInsight(route([unknown]));
    expect(result.available).toBe(false); expect(result.isFullyCovered).toBe(false);
    expect(result.breakEvenTrips).toBeNull();
    expect(getPassLegFare({ operator: 'KMB', mode: 'BUS' }).available).toBe(false);
  });

  it('keeps adult totals and input legs unchanged', () => {
    const value = route([leg('KMB', 8.9, '44'), leg('LWB', 20.6, 'A31')]);
    const before = JSON.stringify(value); getMonthlyPassInsight(value);
    expect(JSON.stringify(value)).toBe(before); expect(KMB_MONTHLY_PASS_PRICES.NORMAL).toBe(834);
  });
});
