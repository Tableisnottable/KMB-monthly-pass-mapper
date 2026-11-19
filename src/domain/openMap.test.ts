import { describe, it, expect } from 'vitest';
import { localMapBounds, parseOpenMap, type OpenMapElement } from './openMap';

describe('Public map extracts', () => {
  it('preserves geometry gaps, merges road pieces and keeps local transport references', () => {
    const nodes: OpenMapElement[] = [1, 2, 3, 4, 5].map((id, i) => ({ type: 'node', id, lat: 25.04 + i * .001, lon: 121.51 }));
    const elements: OpenMapElement[] = [...nodes,
      { type: 'node', id: 90, lat: 25.041, lon: 121.51, tags: { name: '台北車站', 'name:en': 'Taipei Main Station', railway: 'station' } },
      { type: 'node', id: 91, lat: 26, lon: 122, tags: { name: 'Far away', railway: 'station' } },
      { type: 'way', id: 10, nodes: [1, 2, 999, 3, 4], tags: { name: 'Test Road', highway: 'primary' } },
      { type: 'way', id: 11, nodes: [4, 5], tags: { name: 'Test Road', highway: 'primary' } },
      { type: 'way', id: 12, nodes: [1, 2], tags: { name: 'Road tunnel', highway: 'primary', tunnel: 'yes' } },
      { type: 'way', id: 13, nodes: [1, 2], tags: { name: 'Coffee machine', highway: 'footway', tunnel: 'yes', indoor: 'yes' } },
      { type: 'way', id: 14, nodes: [1, 2], tags: { name: 'Private garage', highway: 'service', tunnel: 'yes', access: 'private' } },
      { type: 'relation', id: 20, tags: { type: 'route', route: 'subway', ref: 'R', name: 'Red line' }, members: [{ type: 'way', ref: 10 }, { type: 'way', ref: 999 }] },
    ];
    const data = parseOpenMap(elements, [25.03, 121.50, 25.05, 121.52], 'https://api.openstreetmap.org/');
    expect(data.roads).toHaveLength(2); expect(data.roads[0].paths.map(p => p.length)).toEqual([2, 2, 2]);
    expect(data.roads[1].kind).toBe('tunnel');
    expect(data.roads.some(r => /Coffee|garage/.test(r.name))).toBe(false);
    expect(data.routes[0].paths.map(p => p.length)).toEqual([2, 2]);
    expect(data.stops.map(s => s.name)).toEqual(['台北車站']);
    expect(data.license).toBe('ODbL 1.0');
    expect(data).not.toHaveProperty('arrivals'); expect(data).not.toHaveProperty('fares');
  });
  it('bounds requests to a local area even at northern latitudes', () => {
    const b = localMapBounds(72, 130); expect(b[2] - b[0]).toBeCloseTo(.006); expect(b[3] - b[1]).toBeLessThan(.025);
  });
});
