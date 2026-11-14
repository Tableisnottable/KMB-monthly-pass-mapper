import type { ScoredRoute, Segment } from '../engine/UpgradedScoringEngine';

export type MonthlyPassType = 'NORMAL' | 'STUDENT';

export const KMB_MONTHLY_PASS_PRICES: Record<MonthlyPassType, number> = {
  NORMAL: 834,
  // Standard purchase price; temporary student promotions are not modelled.
  STUDENT: 834,
};

export const KMB_MONTHLY_PASS_PRICE = KMB_MONTHLY_PASS_PRICES.NORMAL;

export const KMB_PASS_RULES = {
  verifiedOn: '2026-11-14',
  effectiveFrom: '2025-11-14',
  sourceUrl: 'https://m.kmb.hk/files/20251114%20KMB%20MP%20(chi)%20P960P968.pdf',
  dailyRides: 10,
  dailyB1Rides: 2,
} as const;

export interface PassLegFare {
  minimum: number;
  maximum: number;
  available: boolean;
  operatorDependent: boolean;
  benefit: boolean;
}

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
  passFareMin: number;
  passFareMax: number;
  savingMin: number;
  savingMax: number;
  available: boolean;
  operatorDependent: boolean;
  benefitLegCount: number;
}

function operatorPassFare(operator: string, number: string, fare: number): number {
  if (operator === 'KMB') {
    if (['K12', 'K14', 'K17', 'K18'].includes(number)) return fare;
    if (number === 'HK1') return Math.min(fare, roundTenth(fare * .27));
    if (number === 'P960' || number === 'P968') return Math.min(fare, 5);
    return 0;
  }
  if (operator === 'LWB') {
    if (/^(?:A|NA)\d/.test(number)) return Math.min(fare, roundTenth(fare * .27));
    if (/^[ENSRX]\d/.test(number)) return 0;
  }
  return fare;
}

/** Payable fare while holding a valid pass, with sufficient daily quota. */
export function getPassLegFare(leg: Segment): PassLegFare {
  if (leg.mode === 'WALK') return { minimum: 0, maximum: 0, available: true, operatorDependent: false, benefit: false };
  const fare = leg.fare ?? 0;
  if (leg.fareStatus === 'UNAVAILABLE' || leg.fare === undefined || !Number.isFinite(fare) || fare < 0) {
    return { minimum: 0, maximum: 0, available: false, operatorDependent: false, benefit: false };
  }
  // The graph normalises joint services to KMB/LWB for scoring. That does not
  // prove which company's bus will run a scheduled departure.
  const operators = (leg.networkOperator ?? leg.operator).toUpperCase().split('+');
  const actual = leg.realtimeEta?.isLive ? leg.liveDepartures?.[0]?.operator : undefined;
  const choices = actual && operators.includes(actual) ? [actual] : operators;
  const number = (leg.routeNumber ?? '').trim().toUpperCase();
  const values = choices.map(operator => leg.mode === 'BUS'
    ? operatorPassFare(operator, number, fare) : fare);
  const minimum = roundCurrency(Math.min(...values)), maximum = roundCurrency(Math.max(...values));
  return { minimum, maximum, available: true, operatorDependent: minimum !== maximum, benefit: minimum < fare };
}

export function getMonthlyPassInsight(
  route: ScoredRoute,
  passPrice = KMB_MONTHLY_PASS_PRICE,
  passType: MonthlyPassType = 'NORMAL',
): MonthlyPassInsight {
  if (!Number.isFinite(passPrice) || passPrice <= 0) {
    throw new Error('passPrice must be a finite positive number.');
  }

  const legs = route.legs.map(getPassLegFare);
  const available = legs.every(leg => leg.available);
  const singleTripFare = roundCurrency(route.discountedFare);
  const passFareMin = roundCurrency(Math.min(singleTripFare, legs.reduce((sum, leg) => sum + leg.minimum, 0)));
  const passFareMax = roundCurrency(Math.min(singleTripFare, legs.reduce((sum, leg) => sum + leg.maximum, 0)));
  const savingMin = available ? roundCurrency(Math.max(0, singleTripFare - passFareMax)) : 0;
  const savingMax = available ? roundCurrency(Math.max(0, singleTripFare - passFareMin)) : 0;
  const coveredLegCount = legs.filter((leg, index) => leg.available && leg.maximum === 0
    && leg.benefit && route.legs[index].mode !== 'WALK').length;
  const transitLegCount = route.legs.filter(leg => leg.mode !== 'WALK').length;

  return {
    passType,
    passPrice,
    coveredFare: savingMin,
    uncoveredFare: passFareMax,
    singleTripFare,
    savingThisTrip: savingMin,
    breakEvenTrips: savingMin > 0 ? Math.ceil(passPrice / savingMin) : null,
    coveredLegCount,
    uncoveredLegCount: transitLegCount - coveredLegCount,
    isFullyCovered: available && transitLegCount > 0 && passFareMax === 0,
    passFareMin, passFareMax, savingMin, savingMax, available,
    operatorDependent: legs.some(leg => leg.operatorDependent),
    benefitLegCount: legs.filter(leg => leg.benefit).length,
  };
}

function roundTenth(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
