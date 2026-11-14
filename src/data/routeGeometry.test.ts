import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodePolyline, evaluateStreetPath, followTrack, hasWalkableGeometry, sliceAlignment, transitGeometry, routeOnStreets } from './routeGeometry';
import { networkPatterns, networkRoutes, networkStopIndex, railFare } from './transportNetwork';
import { DEFAULT_PREFERENCES } from '../domain/routePreferences';
import manifest from './alignments/manifest.json';
afterEach(() => vi.unstubAllGlobals());
describe('Physical route geometry', () => {
  it('decodes geographic polylines without reversing latitude and longitude', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([[38.5,-120.2],[40.7,-120.95],[43.252,-126.453]]);
  });
  it('retains road bends while clipping ordered boarding and alighting stops', () => {
    const line: [number, number][] = [[22.3,114.1],[22.301,114.1],[22.301,114.102],[22.303,114.102]];
    const path = sliceAlignment(line, [[22.3005,114.1],[22.302,114.102]], 0, 1)!;
    expect(path).toHaveLength(4); expect(path[1]).toEqual(line[1]); expect(path[2]).toEqual(line[2]);
  });
  it('does not bridge disconnected railway tracks with a straight segment', () => {
    const graph = { points: [[22.3,114.1],[22.301,114.1],[22.32,114.1],[22.321,114.1]] as [number, number][], adjacent: [[[1,.1]],[[0,.1]],[[3,.1]],[[2,.1]]] as [number, number][][] };
    expect(followTrack(graph, [22.3,114.1], [22.321,114.1], .1)).toBeNull();
  });
  it('rejects a walking path with a long straight segment across water', () => {
    expect(hasWalkableGeometry([[22.24, 114.12], [22.24, 114.126]])).toBe(false);
    expect(hasWalkableGeometry([[22.24, 114.12], [22.2405, 114.121], [22.241, 114.122]])).toBe(true);
  });
  it('chooses a continuous walking alternative over a direct water-crossing chord', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ code: 'Ok', waypoints: [{ distance: 0 }, { distance: 0 }], routes: [
      { distance: 620, duration: 400, geometry: { coordinates: [[114.12, 22.24], [114.126, 22.24]] } },
      { distance: 900, duration: 700, geometry: { coordinates: [[114.12, 22.24], [114.121, 22.241], [114.122, 22.242], [114.123, 22.242], [114.124, 22.242], [114.125, 22.241], [114.126, 22.24]] } },
    ] }));
    vi.stubGlobal('fetch', fetcher);
    const result = await routeOnStreets([[22.24, 114.12], [22.24, 114.126]], 'foot');
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('alternatives=3');
    expect(result).toMatchObject({ source: 'OSM_FOOT', distanceMetres: 900 });
  });
  it('enforces Must and Ban road rules and gives preferred road matches a ranking bonus', () => {
    const route = [[[22.3, 114.1], [22.3, 114.101]]] as [number, number][][];
    const otherRoute = [[[22.31, 114.11], [22.31, 114.111]]] as [number, number][][];
    const geometry = new Map([['cht', route], ['ehc', otherRoute]]);
    expect(evaluateStreetPath(route, { ...DEFAULT_PREFERENCES, roads: { cht: 'must' } }, geometry).allowed).toBe(true);
    expect(evaluateStreetPath(otherRoute, { ...DEFAULT_PREFERENCES, roads: { cht: 'must' } }, geometry).allowed).toBe(false);
    expect(evaluateStreetPath(route, { ...DEFAULT_PREFERENCES, roads: { cht: 'ban' } }, geometry).allowed).toBe(false);
    expect(evaluateStreetPath(route, { ...DEFAULT_PREFERENCES, roads: { cht: 'prefer' } }, geometry).preferenceCost).toBe(-120);
    expect(evaluateStreetPath(otherRoute, { ...DEFAULT_PREFERENCES, roads: { cht: 'prefer' } }, geometry).preferenceCost).toBe(0);
  });
  it.each(['td:1671','td:609','td:285'])('uses detailed official road alignments for %s', async id => {
    const i = networkPatterns.findIndex(p => p.id === id), p = networkPatterns[i];
    const result = await transitGeometry(i, 0, p.s.length - 1);
    expect(result.source).toBe('TD_CSDI'); expect(result.paths[0].length).toBeGreaterThan(p.s.length * 3);
  });
  it('uses actual Airport Express tracks rather than joining stations with chords', async () => {
    const i = networkPatterns.findIndex(p => networkRoutes[p.r][2] === 'AEL');
    const result = await transitGeometry(i, 0, networkPatterns[i].s.length - 1);
    expect(result.source).toBe('OSM_TRACK'); expect(result.paths.flat().length).toBeGreaterThan(100);
  });
  it('returns no geometry when the street router fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await routeOnStreets([[22.337,114.15],[22.338,114.152]], true);
    expect(result).toEqual({ paths: [], source: 'UNAVAILABLE' });
  });
  it('retains real cycling duration and distance from the bike router', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ code: 'Ok', waypoints: [{ distance: 0 }, { distance: 0 }], routes: [{ distance: 180, duration: 61,
      geometry: { coordinates: [[114.17, 22.4], [114.171, 22.401]] } }] }));
    vi.stubGlobal('fetch', fetcher);
    const result = await routeOnStreets([[22.4, 114.17], [22.401, 114.171]], 'bike');
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/routed-bike/route/v1/cycling/');
    expect(result).toMatchObject({ source: 'OSM_BIKE', durationSeconds: 61, distanceMetres: 180 });
  });
  it('keeps every alignment chunk below the requested 1 MB limit', () => {
    for (const files of Object.values(manifest.files)) for (const file of files) {
      const path = resolve('src/data/alignments', file);
      expect(statSync(path).size).toBeLessThan(1_000_000); expect(Array.isArray(JSON.parse(readFileSync(path, 'utf8')))).toBe(true);
    }
  });
});
describe('Published normal adult fares', () => {
  it('includes Airport Express adult Octopus fares in both directions', () => {
    const hk = networkStopIndex('mtr:44')!, airport = networkStopIndex('mtr:47')!;
    expect(railFare(hk, airport)).toBe(120); expect(railFare(airport, hk)).toBe(120);
  });
  it('includes Light Rail adult Octopus fares', () => {
    expect(railFare(networkStopIndex('lrt:920')!, networkStopIndex('lrt:295')!)).toBeGreaterThan(0);
  });
});
