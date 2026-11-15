import type { CancellationNotice, LiveDeparture } from '../data/networkTimetable';
import { DEFAULT_WEIGHTS, type RouteWeights } from './routeWeights';

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
  /** Original catalogue identity for display, including joint services. */
  networkOperator?: string;
  networkRouteId?: string;
  networkPatternId?: string;
  mode?: RouteMode;
  routeName?: string;
  routeNumber?: string;
  rideTimeMinutes?: number;
  journeyTimeMinutes?: number;
  scheduledIntervalMinutes?: number;
  realtimeEtaMinutes?: number;
  realtimeEta?: RealtimeEta | null;
  /** All upcoming provider predictions at this boarding stop. */
  liveDepartures?: LiveDeparture[];
  /** Provider-confirmed cancellations are notices, never boardable journeys. */
  departureNotices?: CancellationNotice[];
  isEtaFresh?: boolean;
  /**
   * The provider serves this route but has no upcoming trip for it, e.g. an
   * overnight-only route during the day or a route that has finished for the
   * night. Such a leg must not be scored as if a vehicle were imminent.
   */
  serviceEnded?: boolean;
  originStop?: Stop;
  destinationStop?: Stop;
  fare?: number;
  /** Normal adult fares, with Octopus used where the source distinguishes it. */
  fareStatus?: 'PUBLISHED' | 'FULL_FARE' | 'UNAVAILABLE';
  fareBasis?: string;
  serviceStatus?: 'LIVE' | 'TIMETABLE' | 'UNVERIFIED';
  scheduledDepartureMinutes?: number;
  scheduledWaitMinutes?: number;
  publishedHeadwayMinutes?: number;
  accessWalkMinutes?: number;
  networkPattern?: number;
  boardingIndex?: number;
  alightingIndex?: number;
  path?: [number, number][];
  departureTime?: string;
  arrivalTime?: string;
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
  /** Exact intermediate place and the first leg after visiting it. */
  via?: Stop;
  viaLegIndex?: number;
  segments?: Segment[];
  legs?: Segment[];
  walkTransferTimeMinutes?: number;
  /** Walking from the search origin to the first boarding stop. */
  originWalkMinutes?: number;
  /** Walking from the last alighting stop to the searched destination. */
  destinationWalkMinutes?: number;
  transferCount?: number;
  longDistanceTransferSurcharge?: number;
  departureTime?: string;
  arrivalTime?: string;
  timeMode?: 'now' | 'depart' | 'arrive';
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
  fareCost: number;
  reliabilityPenalty: number;
}

export interface ScoreResult {
  finalScore: number;
  legSubtotal: number;
  transferPenalty: number;
  walkTransferTime: number;
  longDistanceSurcharge: number;
  fareCost: number;
  reliabilityPenalty: number;
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

// Penalty applied when a leg has no upcoming trip at all. Large enough that
// an alternative with a real bus always wins, but finite so the journey still
// appears (lower in the list) instead of vanishing from the board.
const SERVICE_ENDED_WAIT_PENALTY = 90;
export const FARE_MINUTES_PER_DOLLAR = 0.45;
export const WALK_MULTIPLIER = 1.35;

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
  public static getOperatorAdjustment(operator: string, weights: RouteWeights = DEFAULT_WEIGHTS): number {
    const key = ({ KMB: 'kmb', LWB: 'lwb', MTR: 'mtr', CTB: 'ctb' } as const)[operator as 'KMB' | 'LWB' | 'MTR' | 'CTB'];
    return key ? weights[key] : operatorAdjustments[operator] ?? 0;
  }

  public static getTimeMultiplier(date: Date = new Date(), weights: RouteWeights = DEFAULT_WEIGHTS): number {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const timeInMin = hours * 60 + minutes;

    if (timeInMin >= 1380 || timeInMin < 350) return weights.waitNight * weights.wait;
    if ((timeInMin >= 420 && timeInMin <= 570) || (timeInMin >= 1020 && timeInMin <= 1170)) {
      return weights.waitPeak * weights.wait;
    }
    return weights.waitOffPeak * weights.wait;
  }

  public static calculateSegmentScore(segment: Segment, date: Date = new Date(), weights: RouteWeights = DEFAULT_WEIGHTS): number {
    // All walking is charged once in the route-level walking component.
    if (segment.mode === 'WALK') return 0;
    const multiplier = this.getTimeMultiplier(date, weights);
    // No upcoming trip: the wait is unbounded, so push the leg far down the
    // ranking rather than assuming an average half-headway wait.
    if (segment.serviceEnded) {
      return journeyTime(segment) * weights.ride + SERVICE_ENDED_WAIT_PENALTY * multiplier + this.getOperatorAdjustment(segment.operator, weights);
    }
    const liveEta = segment.realtimeEta?.isLive
      ? segment.realtimeEta.etaMinutes
      : segment.realtimeEtaMinutes !== undefined && segment.isEtaFresh
        ? segment.realtimeEtaMinutes
        : undefined;
    const waitMinutes = liveEta !== undefined
      ? Math.max(0, liveEta - (segment.accessWalkMinutes ?? 0))
      : segment.scheduledWaitMinutes ?? (segment.scheduledIntervalMinutes ?? 12) * 0.5;
    const wait = segment.mode === 'WALK' ? 0 : waitMinutes * multiplier;
    return journeyTime(segment) * weights.ride + wait + this.getOperatorAdjustment(segment.operator, weights);
  }

  public static calculateRouteScore(route: Route, date: Date = new Date(), weights: RouteWeights = DEFAULT_WEIGHTS): ScoreResult {
    const legs = normalizeLegs(route);
    const legSubtotal = legs.reduce((total, leg) => total + this.calculateSegmentScore(leg, date, weights), 0);
    const transferPenalty = (route.transferCount ?? Math.max(0, legs.length - 1)) * weights.transfer;
    const walkTransferTime = round(((route.walkTransferTimeMinutes ?? 0)
      + legs.filter(leg => leg.mode === 'WALK').reduce((sum, leg) => sum + journeyTime(leg), 0)) * weights.walk);
    const longDistanceSurcharge = route.longDistanceTransferSurcharge ?? 0;
    const fareCost = round(this.calculateFare(legs).discountedFare * weights.fare);
    const reliabilityPenalty = legs.reduce((sum, leg) => sum + (leg.serviceStatus === 'UNVERIFIED' ? weights.unverified : 0), 0);

    return {
      finalScore: round(legSubtotal + walkTransferTime + longDistanceSurcharge + transferPenalty + fareCost + reliabilityPenalty),
      legSubtotal: round(legSubtotal),
      transferPenalty,
      walkTransferTime,
      longDistanceSurcharge,
      fareCost,
      reliabilityPenalty,
    };
  }

  public static calculateFare(legs: Segment[]): { discountedFare: number; bbiDiscountApplied: number } {
    const rawFare = legs.reduce((total, leg) => total + fare(leg), 0);
    // Same operator does not establish eligibility for an interchange offer.
    // Contiguous paid-area rail fares are combined in the journey builder.
    return {
      discountedFare: round(Math.max(0, rawFare)),
      bbiDiscountApplied: 0,
    };
  }
}

export function scoreRoutes(routes: Route[], date: Date = new Date(), weights: RouteWeights = DEFAULT_WEIGHTS): ScoredRoute[] {
  return routes
    .map((route) => {
      const legs = normalizeLegs(route);
      const score = UpgradedScoringEngine.calculateRouteScore({ ...route, legs }, date, weights);
      const fareResult = UpgradedScoringEngine.calculateFare(legs);
      const breakdown: ScoreBreakdown = {
        legSubtotal: score.legSubtotal,
        journeyTime: round(legs.reduce((total, leg) => total + (leg.mode === 'WALK' ? 0 : journeyTime(leg) * weights.ride), 0)),
        scheduledWait: round(score.legSubtotal - legs.reduce((total, leg) => total + (leg.mode === 'WALK' ? 0 : journeyTime(leg) * weights.ride + UpgradedScoringEngine.getOperatorAdjustment(leg.operator, weights)), 0)),
        operatorAdjustment: round(legs.reduce((total, leg) => total + UpgradedScoringEngine.getOperatorAdjustment(leg.operator, weights), 0)),
        walkTransferTime: score.walkTransferTime,
        transferPenalty: score.transferPenalty,
        longDistanceSurcharge: score.longDistanceSurcharge,
        fareCost: score.fareCost,
        reliabilityPenalty: score.reliabilityPenalty,
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
