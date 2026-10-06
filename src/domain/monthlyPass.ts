import type { ScoredRoute } from '../engine/UpgradedScoringEngine';

export type MonthlyPassType = 'NORMAL' | 'STUDENT';

export const KMB_MONTHLY_PASS_PRICES: Record<MonthlyPassType, number> = {
  NORMAL: 780,
  STUDENT: 390,
};

export const KMB_MONTHLY_PASS_PRICE = KMB_MONTHLY_PASS_PRICES.NORMAL;

export interface MonthlyPassInsight {
  passType: MonthlyPassType;
  passPrice: number;
  coveredFare: number;
  uncoveredFare: number;
  singleTripFare: number;
  savingThisTrip: number;
  breakEvenTrips: number;
  coveredLegCount: number;
  uncoveredLegCount: number;
  isFullyCovered: boolean;
}

export function getMonthlyPassInsight(
  route: ScoredRoute,
  passPrice = KMB_MONTHLY_PASS_PRICE,
  passType: MonthlyPassType = 'NORMAL',
): MonthlyPassInsight {
  if (!Number.isFinite(passPrice) || passPrice <= 0) {
    throw new Error('passPrice must be a finite positive number.');
  }

  const coveredFare = route.legs
    .filter((leg) => leg.operator === 'KMB' || leg.operator === 'LWB')
    .reduce((total, leg) => total + (leg.fare ?? 0), 0);
  const uncoveredFare = Math.max(0, route.discountedFare - coveredFare);
  const singleTripFare = route.discountedFare;

  return {
    passType,
    passPrice,
    coveredFare: roundCurrency(coveredFare),
    uncoveredFare: roundCurrency(uncoveredFare),
    singleTripFare: roundCurrency(singleTripFare),
    savingThisTrip: roundCurrency(coveredFare),
    breakEvenTrips: Math.ceil(passPrice / Math.max(coveredFare, 0.01)),
    coveredLegCount: route.legs.filter(
      (leg) => leg.operator === 'KMB' || leg.operator === 'LWB',
    ).length,
    uncoveredLegCount: route.legs.filter(
      (leg) => leg.operator !== 'KMB' && leg.operator !== 'LWB',
    ).length,
    isFullyCovered: route.legs.every(
      (leg) => leg.operator === 'KMB' || leg.operator === 'LWB',
    ),
  };
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
