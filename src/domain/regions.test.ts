import { describe, expect, it } from 'vitest';
import { regions, regionGroups, regionHref } from './regions';
import { localMapBounds } from './openMap';

describe('Worldwide region directory', () => {
  it('includes every source country once and retains existing bookmarks', () => {
    expect(regions).toHaveLength(250);
    expect(new Set(regions.map(r => r.code)).size).toBe(250);
    expect(new Set(regions.map(r => r.id)).size).toBe(250);
    for (const r of regions) {
      expect(regionGroups.some(g => g[0] === r.group)).toBe(true);
      expect(r.cities.length).toBeGreaterThan(0);
      for (const c of r.cities) {
        expect(c.lat).toBeGreaterThanOrEqual(-90); expect(c.lat).toBeLessThanOrEqual(90);
        expect(c.lon).toBeGreaterThanOrEqual(-180); expect(c.lon).toBeLessThanOrEqual(180);
      }
    }
    expect(regions.find(r => r.code === 'HK')?.id).toBe('hong-kong');
    expect(regions.find(r => r.code === 'JP')?.cities[0].en).toBe('Tokyo');
    expect(regionHref(regions.find(r => r.code === 'GB')!, 'en')).toBe('/world/en?region=gb');
  });
  it('keeps polar and dateline extracts inside the public API limits', () => {
    for (const [lat, lon] of [[90, 180], [-90, -180], [0, 179.999], [0, -179.999]]) {
      const [s, w, n, e] = localMapBounds(lat, lon);
      expect(s).toBeGreaterThanOrEqual(-90); expect(n).toBeLessThanOrEqual(90);
      expect(w).toBeGreaterThanOrEqual(-180); expect(e).toBeLessThanOrEqual(180);
      expect(n).toBeGreaterThan(s); expect(e).toBeGreaterThan(w);
    }
  });
});
