import type { Coordinate, GeometryResult } from '../data/routeGeometry';

export type TravelMode = 'walk' | 'cycle' | 'taxi';
export interface TravelOption {
  mode: TravelMode;
  available: boolean;
  minutes?: number;
  distanceMetres?: number;
  paths: Coordinate[][];
}

export function travelOption(mode: TravelMode, geometry: GeometryResult): TravelOption {
  if (geometry.source === 'UNAVAILABLE' || geometry.durationSeconds === undefined
    || !Number.isFinite(geometry.durationSeconds) || geometry.durationSeconds < 0
    || geometry.distanceMetres === undefined || !Number.isFinite(geometry.distanceMetres) || geometry.distanceMetres < 0) {
    return { mode, available: false, paths: [] };
  }
  return { mode, available: true, minutes: Math.ceil(geometry.durationSeconds / 60),
    distanceMetres: geometry.distanceMetres, paths: geometry.paths };
}

export function travelClock(option: TravelOption, mode: 'now' | 'depart' | 'arrive', value: string, now: number) {
  const anchor = mode === 'now' ? now : Date.parse(value + ':00+08:00');
  if (!option.available || option.minutes === undefined || !Number.isFinite(anchor)) return undefined;
  const duration = option.minutes * 60000;
  return { departure: new Date(mode === 'arrive' ? anchor - duration : anchor).toISOString(),
    arrival: new Date(mode === 'arrive' ? anchor : anchor + duration).toISOString() };
}
