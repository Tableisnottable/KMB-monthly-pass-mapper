import { afterEach, describe, expect, it, vi } from 'vitest';
import { networkPatterns, networkRoutes, networkStop, networkStops } from './transportNetwork';
import { enrichJourneyArrivals, providerTimestamp } from './multimodalLive';
import type { Route } from '../engine/UpgradedScoringEngine';
import { getKmbStops, getKmbStopEta } from './hkTransitApi';
import { getStaticKmbRouteStops } from './kmbRouteStopsStatic';

vi.mock('./hkTransitApi', () => ({ getKmbStops: vi.fn(async () => []), getKmbStopEta: vi.fn(async () => []), getCitybusEta: vi.fn(async () => []) }));
vi.mock('./kmbRouteStopsStatic', () => ({ getStaticKmbRouteStops: vi.fn(() => undefined) }));
const now = new Date('2026-11-13T04:00:00Z');
afterEach(() => { vi.unstubAllGlobals(); });

function railRoute(): Route {
  const index = networkPatterns.findIndex(p => networkRoutes[p.r][0] === 'mtr:TWL'
    && p.s.findIndex(i => networkStops[i][5] === 'CSW') < p.s.findIndex(i => networkStops[i][5] === 'TST'));
  const p = networkPatterns[index];
  const boardingIndex = p.s.findIndex(i => networkStops[i][5] === 'CSW');
  const alightingIndex = p.s.findIndex(i => networkStops[i][5] === 'TST');
  return { id: 'rail-live', originWalkMinutes: 0, legs: [{ operator: 'MTR', mode: 'SUBWAY', routeNumber: 'TWL',
    networkPattern: index, boardingIndex, alightingIndex, originStop: networkStop(p.s[boardingIndex]),
    destinationStop: networkStop(p.s[alightingIndex]), serviceStatus: 'UNVERIFIED', realtimeEta: null }] };
}

describe('Official live arrivals', () => {
  it('interprets MTR wall-clock timestamps as Hong Kong time', () => {
    expect(providerTimestamp('2026-11-13 12:03:00')).toBe(Date.parse('2026-11-13T04:03:00Z'));
  });

  it('matches a train by reachable destination, not assumed UP/DOWN direction', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 1, curr_time: '2026-11-13 12:00:00',
      data: { 'TWL-CSW': { UP: [{ dest: 'TSW', valid: 'Y', time: '2026-11-13 12:01:00' }],
        DOWN: [{ dest: 'CEN', valid: 'Y', time: '2026-11-13 12:03:00' }] } } })));
    const route = railRoute();
    await enrichJourneyArrivals([route], now);
    expect(route.legs![0].realtimeEta?.etaMinutes).toBe(3);
    expect(route.legs![0].serviceStatus).toBe('LIVE');
  });

  it('keeps provider failures explicitly unverified', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const route = railRoute();
    // Advance beyond the short shared cache from the previous test.
    await enrichJourneyArrivals([route], new Date('2026-11-13T05:00:00Z'));
    expect(route.legs![0].realtimeEta).toBeNull();
    expect(route.legs![0].serviceStatus).toBe('UNVERIFIED');
    expect(route.legs![0].serviceEnded).not.toBe(true);
  });
  it('retains every fresh bus prediction and provider extra-trip remarks without requiring a scheduled trip', async () => {
    const index = networkPatterns.findIndex(pattern => networkRoutes[pattern.r][1] === 'KMB' && pattern.s.length > 1);
    const pattern = networkPatterns[index], routeNumber = networkRoutes[pattern.r][2];
    const origin = networkStop(pattern.s[0]), destination = networkStop(pattern.s[1]);
    vi.mocked(getKmbStops).mockResolvedValue([
      { stop: 'mock-origin', name_tc: '', name_en: '', lat: origin.lat!, long: origin.lng! },
      { stop: 'mock-destination', name_tc: '', name_en: '', lat: destination.lat!, long: destination.lng! },
    ]);
    vi.mocked(getStaticKmbRouteStops).mockImplementation((_route, bound) => bound === 'outbound'
      ? [{ stop: 'mock-origin', seq: 1 }, { stop: 'mock-destination', seq: 2 }] : undefined);
    vi.mocked(getKmbStopEta).mockResolvedValue([3, 8].map(minutes => ({ route: routeNumber, dir: 'O', seq: 1,
      dest_tc: '', dest_en: '', eta: new Date(now.getTime() + minutes * 60000).toISOString(),
      rmk_tc: minutes === 3 ? '加班車' : '', data_timestamp: now.toISOString() })));
    const route: Route = { id: 'extra-bus', legs: [{ operator: 'KMB', mode: 'BUS', routeNumber,
      networkPattern: index, boardingIndex: 0, alightingIndex: 1, originStop: origin, destinationStop: destination,
      serviceEnded: true, serviceStatus: 'TIMETABLE' }] };
    await enrichJourneyArrivals([route], now);
    expect(route.legs![0].liveDepartures?.map(departure => departure.minutes)).toEqual([3, 8]);
    expect(route.legs![0].liveDepartures?.[0]).toMatchObject({ scheduleMatch: 'ADDED', addedReason: 'PROVIDER' });
    expect(route.legs![0].serviceEnded).toBe(false);
    expect(route.legs![0].realtimeEta?.etaMinutes).toBe(3);
  });
});
