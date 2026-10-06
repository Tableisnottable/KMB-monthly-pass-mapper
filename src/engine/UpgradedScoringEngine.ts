export type Operator = 'KMB' | 'LWB' | 'MTR' | 'CTB' | string;
export type RouteMode = 'BUS' | 'SUBWAY' | 'WALK' | 'FERRY' | string;

export interface Stop {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
}

export interface RealtimeEta {
  etaMinutes: number;
  dataTime: string;
  isLive: boolean;
  source: 'DATAGOVHK' | 'SCHEDULED';
}

export interface Segment {
  id?: string;
  operator: Operator;
  mode?: RouteMode;
  routeName?: string;
  routeNumber?: string;
  rideTimeMinutes?: number;
  journeyTimeMinutes?: number;
  scheduledIntervalMinutes?: number;
  realtimeEtaMinutes?: number;
  realtimeEta?: RealtimeEta | null;
  isEtaFresh?: boolean;
  originStop?: Stop;
  destinationStop?: Stop;
  fare?: number;
}

export interface TransitLeg extends Segment {
  id: string;
  mode: RouteMode;
  routeNumber: string;
  originStop: Stop;
  destinationStop: Stop;
  journeyTimeMinutes: number;
  scheduledIntervalMinutes: number;
  realtimeEta: RealtimeEta | null;
  fare: number;
}

export interface Route {
  id: string;
  segments?: Segment[];
  legs?: Segment[];
  walkTransferTimeMinutes?: number;
  transferCount?: number;
  longDistanceTransferSurcharge?: number;
}

export type RouteOption = Route & {
  legs: TransitLeg[];
  walkTransferTimeMinutes: number;
  transferCount: number;
};

export interface ScoreBreakdown {
  legSubtotal: number;
  journeyTime: number;
  scheduledWait: number;
  operatorAdjustment: number;
  walkTransferTime: number;
  transferPenalty: number;
  longDistanceSurcharge: number;
}

export interface ScoreResult {
  finalScore: number;
  legSubtotal: number;
  transferPenalty: number;
  walkTransferTime: number;
  longDistanceSurcharge: number;
}

export type ScoredRoute = RouteOption & {
  finalScore: number;
  discountedFare: number;
  bbiDiscountApplied: number;
  breakdown: ScoreBreakdown;
  score: ScoreResult;
};

const operatorAdjustments: Record<string, number> = {
  KMB: -1,
  LWB: -0.46,
  MTR: 0.5,
  CTB: 1,
};

function round(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeLegs(route: Route): Segment[] {
  return route.legs ?? route.segments ?? [];
}

function journeyTime(leg: Segment): number {
  return leg.journeyTimeMinutes ?? leg.rideTimeMinutes ?? 0;
}

function fare(leg: Segment): number {
  return leg.fare ?? 0;
}

export class UpgradedScoringEngine {
  public static getOperatorAdjustment(operator: string): number {
    return operatorAdjustments[operator] ?? 0;
  }

  public static getTimeMultiplier(date: Date = new Date()): number {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const timeInMin = hours * 60 + minutes;

    if (timeInMin >= 1380 || timeInMin < 350) return 1.8;
    if ((timeInMin >= 420 && timeInMin <= 570) || (timeInMin >= 1020 && timeInMin <= 1170)) {
      return 1;
    }
    return 1.3;
  }

  public static calculateSegmentScore(segment: Segment, date: Date = new Date()): number {
    const multiplier = this.getTimeMultiplier(date);
    const liveEta = segment.realtimeEta?.isLive
      ? segment.realtimeEta.etaMinutes
      : segment.realtimeEtaMinutes !== undefined && segment.isEtaFresh
        ? segment.realtimeEtaMinutes
        : undefined;
    const wait = liveEta ?? (segment.scheduledIntervalMinutes ?? 12) * 0.5 * multiplier;
    return journeyTime(segment) + wait + this.getOperatorAdjustment(segment.operator);
  }

  public static calculateRouteScore(route: Route, date: Date = new Date()): ScoreResult {
    const legs = normalizeLegs(route);
    const legSubtotal = legs.reduce((total, leg) => total + this.calculateSegmentScore(leg, date), 0);
    const transferPenalty = (route.transferCount ?? Math.max(0, legs.length - 1)) * 8;
    const walkTransferTime = route.walkTransferTimeMinutes ?? 0;
    const longDistanceSurcharge = route.longDistanceTransferSurcharge ?? 0;

    return {
      finalScore: round(legSubtotal + walkTransferTime + longDistanceSurcharge + transferPenalty),
      legSubtotal: round(legSubtotal),
      transferPenalty,
      walkTransferTime,
      longDistanceSurcharge,
    };
  }

  public static calculateFare(legs: Segment[]): { discountedFare: number; bbiDiscountApplied: number } {
    const rawFare = legs.reduce((total, leg) => total + fare(leg), 0);
    let discount = 0;

    for (let index = 1; index < legs.length; index += 1) {
      if (legs[index - 1].operator === legs[index].operator) {
        discount += Math.min(4.2, fare(legs[index]));
      }
    }

    return {
      discountedFare: round(Math.max(0, rawFare - discount)),
      bbiDiscountApplied: round(discount),
    };
  }
}

export function scoreRoutes(routes: Route[], date: Date = new Date()): ScoredRoute[] {
  return routes
    .map((route) => {
      const legs = normalizeLegs(route);
      const score = UpgradedScoringEngine.calculateRouteScore({ ...route, legs }, date);
      const fareResult = UpgradedScoringEngine.calculateFare(legs);
      const breakdown: ScoreBreakdown = {
        legSubtotal: score.legSubtotal,
        journeyTime: round(legs.reduce((total, leg) => total + journeyTime(leg), 0)),
        scheduledWait: round(score.legSubtotal - legs.reduce((total, leg) => total + journeyTime(leg) + UpgradedScoringEngine.getOperatorAdjustment(leg.operator), 0)),
        operatorAdjustment: round(legs.reduce((total, leg) => total + UpgradedScoringEngine.getOperatorAdjustment(leg.operator), 0)),
        walkTransferTime: score.walkTransferTime,
        transferPenalty: score.transferPenalty,
        longDistanceSurcharge: score.longDistanceSurcharge,
      };

      return {
        ...route,
        legs: legs as TransitLeg[],
        walkTransferTimeMinutes: route.walkTransferTimeMinutes ?? 0,
        transferCount: route.transferCount ?? Math.max(0, legs.length - 1),
        finalScore: score.finalScore,
        discountedFare: fareResult.discountedFare,
        bbiDiscountApplied: fareResult.bbiDiscountApplied,
        breakdown,
        score,
      };
    })
    .sort((a, b) => a.finalScore - b.finalScore);
}
