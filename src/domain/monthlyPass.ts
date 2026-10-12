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
  breakEvenTrips: number | null;
  coveredLegCount: number;
  uncoveredLegCount: number;
  isFullyCovered: boolean;
}

function isKmbCovered(operator: string): boolean {
  return operator === 'KMB' || operator === 'LWB';
}

function prorateBbiDiscount(route: ScoredRoute): number {
  const coveredFare = route.legs
    .filter((leg) => isKmbCovered(leg.operator))
    .reduce((total, leg) => total + (leg.fare ?? 0), 0);
  const rawFare = route.legs.reduce((total, leg) => total + (leg.fare ?? 0), 0);
  if (rawFare <= 0) {
    return 0;
  }
  return (route.bbiDiscountApplied * coveredFare) / rawFare;
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
    .filter((leg) => isKmbCovered(leg.operator))
    .reduce((total, leg) => total + (leg.fare ?? 0), 0);
  const coveredFareAfterBbi = coveredFare - prorateBbiDiscount(route);
  const uncoveredFare = Math.max(0, route.discountedFare - coveredFareAfterBbi);
  const singleTripFare = route.discountedFare;

  return {
    passType,
    passPrice,
    coveredFare: roundCurrency(coveredFareAfterBbi),
    uncoveredFare: roundCurrency(uncoveredFare),
    singleTripFare: roundCurrency(singleTripFare),
    savingThisTrip: roundCurrency(coveredFareAfterBbi),
    breakEvenTrips:
      coveredFareAfterBbi > 0
        ? Math.ceil(passPrice / coveredFareAfterBbi)
        : null,
    coveredLegCount: route.legs.filter((leg) => isKmbCovered(leg.operator)).length,
    uncoveredLegCount: route.legs.filter((leg) => !isKmbCovered(leg.operator)).length,
    isFullyCovered: route.legs.every((leg) => isKmbCovered(leg.operator)),
  };
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
