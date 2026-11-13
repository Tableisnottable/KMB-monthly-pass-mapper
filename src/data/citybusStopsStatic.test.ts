import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getStaticCitybusRouteStops,
  getStaticCitybusStops,
  STATIC_CITYBUS_ROUTES,
} from './citybusStopsStatic';

describe('Citybus catalog integrity', () => {
  it('includes airport services as well as cross-harbour services', () => {
    expect(STATIC_CITYBUS_ROUTES).toContain('A21');
    expect(STATIC_CITYBUS_ROUTES).toContain('E21');
    expect(STATIC_CITYBUS_ROUTES).toContain('970');
    expect(STATIC_CITYBUS_ROUTES).toContain('973');
  });

  it('resolves every route stop to finite coordinates', () => {
    const stops = new Map(getStaticCitybusStops().map(stop => [stop.stop, stop]));
    expect(Array.from(stops.values()).every(stop =>
      Number.isFinite(stop.lat) && Number.isFinite(stop.long),
    )).toBe(true);
    const missing = new Set<string>();
    for (const route of STATIC_CITYBUS_ROUTES) {
      for (const bound of ['outbound', 'inbound'] as const) {
        const rows = getStaticCitybusRouteStops(route, bound);
        expect(rows).toBeDefined();
        for (const row of rows ?? []) if (!stops.has(row.stop)) missing.add(row.stop);
      }
    }
    expect(Array.from(missing)).toEqual([]);
  });

  it('keeps each generated data file below the requested size limit', () => {
    for (const filename of ['citybusRouteStops.json', 'citybusStops.json']) {
      const bytes = readFileSync(new URL(filename, import.meta.url));
      expect(bytes.length).toBeLessThanOrEqual(1_000_000);
    }
  });
});
