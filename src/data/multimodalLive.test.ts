import { afterEach, describe, expect, it, vi } from 'vitest';
import { networkPatterns, networkRoutes, networkStop, networkStops } from './transportNetwork';
import { enrichJourneyArrivals, enrichTerminalArrivals, providerTimestamp } from './multimodalLive';
import type { Route } from '../engine/UpgradedScoringEngine';
import { getKmbStops, getKmbStopEta } from './hkTransitApi';
import { getStaticKmbRouteStops } from './kmbRouteStopsStatic';
import { retimeConnections } from '../engine/multimodalJourney';

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
  it('propagates a live ETA from the previous stop to the selected terminal', async () => {
    const index = networkPatterns.findIndex(pattern => networkRoutes[pattern.r][1] === 'KMB' && pattern.s.length > 2);
    const pattern = networkPatterns[index], routeNumber = networkRoutes[pattern.r][2], terminal = pattern.s.length - 1, previous = terminal - 1;
    const origin = networkStop(pattern.s[previous]), destination = networkStop(pattern.s[terminal]);
    vi.mocked(getKmbStops).mockResolvedValue([
      { stop: 'terminal-previous', name_tc: '', name_en: '', lat: origin.lat!, long: origin.lng! },
      { stop: 'terminal-last', name_tc: '', name_en: '', lat: destination.lat!, long: destination.lng! },
    ]);
    vi.mocked(getStaticKmbRouteStops).mockImplementation((_route, bound) => bound === 'outbound'
      ? [{ stop: 'terminal-previous', seq: 1 }, { stop: 'terminal-last', seq: 2 }] : undefined);
    vi.mocked(getKmbStopEta).mockResolvedValue([{ route: routeNumber, dir: 'O', seq: 1, dest_tc: '', dest_en: '',
      eta: new Date(now.getTime() + 5 * 60000).toISOString(), rmk_tc: '', data_timestamp: now.toISOString() }]);
    const route: Route = { id: 'terminal-live', legs: [{ operator: 'KMB', mode: 'BUS', routeNumber,
      networkPattern: index, boardingIndex: terminal, alightingIndex: terminal, originStop: destination,
      destinationStop: destination, serviceStatus: 'TIMETABLE' }] };
    await enrichTerminalArrivals([route], now);
    const departure = route.legs![0].liveDepartures?.[0];
    expect(departure).toBeDefined();
    expect(departure!.minutes).toBeGreaterThan(5);
    expect(route.legs![0].boardingIndex).toBe(terminal);
    expect(route.legs![0].realtimeEta?.etaMinutes).toBe(departure!.minutes);
  });
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
  it('retains simultaneous buses and provider extra-trip remarks without requiring a scheduled trip', async () => {
    const index = networkPatterns.findIndex(pattern => networkRoutes[pattern.r][1] === 'KMB' && pattern.s.length > 1);
    const pattern = networkPatterns[index], routeNumber = networkRoutes[pattern.r][2];
    const origin = networkStop(pattern.s[0]), destination = networkStop(pattern.s[1]);
    vi.mocked(getKmbStops).mockResolvedValue([
      { stop: 'mock-origin', name_tc: '', name_en: '', lat: origin.lat!, long: origin.lng! },
      { stop: 'mock-destination', name_tc: '', name_en: '', lat: destination.lat!, long: destination.lng! },
    ]);
    vi.mocked(getStaticKmbRouteStops).mockImplementation((_route, bound) => bound === 'outbound'
      ? [{ stop: 'mock-origin', seq: 1 }, { stop: 'mock-destination', seq: 2 }] : undefined);
    vi.mocked(getKmbStopEta).mockResolvedValue([3, 8, 8].map(minutes => ({ route: routeNumber, dir: 'O', seq: 1,
      dest_tc: '', dest_en: '', eta: new Date(now.getTime() + minutes * 60000).toISOString(),
      rmk_tc: minutes === 3 ? '加班車' : '', data_timestamp: now.toISOString() })));
    const route: Route = { id: 'extra-bus', legs: [{ operator: 'KMB', mode: 'BUS', routeNumber,
      networkPattern: index, boardingIndex: 0, alightingIndex: 1, originStop: origin, destinationStop: destination,
      serviceEnded: true, serviceStatus: 'TIMETABLE' }] };
    await enrichJourneyArrivals([route], now);
    expect(route.legs![0].liveDepartures?.map(departure => departure.minutes)).toEqual([3, 8, 8]);
    expect(route.legs![0].liveDepartures?.[0]).toMatchObject({ scheduleMatch: 'ADDED', addedReason: 'PROVIDER' });
    expect(route.legs![0].serviceEnded).toBe(false);
    expect(route.legs![0].realtimeEta?.etaMinutes).toBe(3);
  });
  it.each(['原定班次 · Scheduled Bus', '加班車 · Scheduled Bus'])('preserves provider scheduled timing without claiming live tracking: %s', async remark => {
    const now = new Date('2026-11-13T09:37:00Z');
    const index = networkPatterns.findIndex(pattern => networkRoutes[pattern.r][2] === 'B10' && networkStops[pattern.s[0]][0] === '13393');
    const pattern = networkPatterns[index], routeNumber = networkRoutes[pattern.r][2];
    const origin = networkStop(pattern.s[0]), destination = networkStop(pattern.s[1]);
    vi.mocked(getKmbStops).mockResolvedValue([
      { stop: 'scheduled-origin', name_tc: '', name_en: '', lat: origin.lat!, long: origin.lng! },
      { stop: 'scheduled-destination', name_tc: '', name_en: '', lat: destination.lat!, long: destination.lng! },
    ]);
    vi.mocked(getStaticKmbRouteStops).mockImplementation((_route, bound) => bound === 'outbound'
      ? [{ stop: 'scheduled-origin', seq: 1 }, { stop: 'scheduled-destination', seq: 2 }] : undefined);
    vi.mocked(getKmbStopEta).mockResolvedValue([{ route: routeNumber, dir: 'O', seq: 1, dest_tc: '', dest_en: '',
      eta: new Date(now.getTime() + 8 * 60000).toISOString(), rmk_tc: '', rmk_en: remark, data_timestamp: now.toISOString() }]);
    const route: Route = { id: 'scheduled-bus', originWalkMinutes: 2, destinationWalkMinutes: 0,
      legs: [{ operator: 'KMB', mode: 'BUS', routeNumber, networkPattern: index, boardingIndex: 0,
        alightingIndex: 1, originStop: origin, destinationStop: destination, journeyTimeMinutes: 5 }] };
    await enrichJourneyArrivals([route], now);
    const leg = route.legs![0];
    expect(leg.liveDepartures?.[0].departureType).toBe(remark.includes('加班') ? 'ADDITIONAL' : 'SCHEDULED');
    expect(leg.realtimeEta).toMatchObject({ etaMinutes: 8, isLive: false, source: 'SCHEDULED' });
    expect(leg.serviceStatus).toBe('TIMETABLE');
    retimeConnections([route], now);
    expect(leg.scheduledWaitMinutes).toBe(6);
    expect(leg.departureTime).toBe('2026-11-13T09:45:00.000Z');
    expect(leg.serviceEnded).toBe(false);
  });
  it('retains explicit cancellations without an ETA as notices and excludes them from boardable predictions', async () => {
    const index = networkPatterns.findIndex(pattern => networkRoutes[pattern.r][2] === 'B10' && networkStops[pattern.s[0]][0] === '13393');
    const pattern = networkPatterns[index], origin = networkStop(pattern.s[0]), destination = networkStop(pattern.s[1]);
    vi.mocked(getKmbStops).mockResolvedValue([
      { stop: 'cancel-origin', name_tc: '', name_en: '', lat: origin.lat!, long: origin.lng! },
      { stop: 'cancel-destination', name_tc: '', name_en: '', lat: destination.lat!, long: destination.lng! },
    ]);
    vi.mocked(getStaticKmbRouteStops).mockImplementation((_route, bound) => bound === 'outbound' ? [{ stop: 'cancel-origin', seq: 1 }, { stop: 'cancel-destination', seq: 2 }] : undefined);
    vi.mocked(getKmbStopEta).mockResolvedValue([
      { route: 'B10', dir: 'O', seq: 1, dest_tc: '', dest_en: '', eta: null, rmk_tc: '班次取消', data_timestamp: now.toISOString() },
      { route: 'B10', dir: 'O', seq: 1, dest_tc: '', dest_en: '', eta: new Date(now.getTime() + 10 * 60000).toISOString(), rmk_tc: '', data_timestamp: now.toISOString() },
      { route: 'B10', dir: 'O', seq: 9, dest_tc: '', dest_en: '', eta: new Date(now.getTime() + 3 * 60000).toISOString(), rmk_tc: '', data_timestamp: now.toISOString() },
    ]);
    const route: Route = { id: 'cancel', legs: [{ operator: 'KMB', mode: 'BUS', routeNumber: 'B10', networkPattern: index, boardingIndex: 0, alightingIndex: 1, originStop: origin, destinationStop: destination }] };
    await enrichJourneyArrivals([route], now);
    expect(route.legs![0].departureNotices).toEqual([{ departureType: 'CANCELLED', operator: 'KMB', remark: '班次取消', time: undefined }]);
    expect(route.legs![0].liveDepartures).toHaveLength(1);
    expect(route.legs![0].realtimeEta?.etaMinutes).toBe(10);
    expect(route.legs![0].liveDepartures![0].timetableTime).toBeDefined();
  });
});
