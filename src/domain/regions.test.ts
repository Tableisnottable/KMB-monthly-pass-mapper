import { describe, expect, it } from 'vitest';
import { regions, regionGroups, regionHref, matchingRegions, matchingRegionCity, browseLocation } from './regions';
import { localMapBounds } from './openMap';

describe('Worldwide region directory', () => {
  it('accepts common abbreviations, simplified names and unaccented names', () => {
    for (const [query, code] of [['UK', 'GB'], ['USA', 'US'], ['台湾', 'TW'], ['macau', 'MO'], ['Turkiye', 'TR']]) {
      expect(matchingRegions(query).some(r => r.code === code)).toBe(true);
    }
    expect(matchingRegions('UK').map(r => r.code)).toEqual(['GB']);
  });
  it('opens a searched city and preserves it when switching language', () => {
    const japan = matchingRegions('Osaka')[0], city = matchingRegionCity(japan, 'Osaka');
    expect(regionHref(japan, 'en', city)).toBe('/japan/en?city=Osaka');
    expect(browseLocation(new URLSearchParams('city=Osaka'), 'japan').city.en).toBe('Osaka');
    expect(browseLocation(new URLSearchParams('region=gb&city=invalid'), 'japan').region.code).toBe('GB');
    expect(browseLocation(new URLSearchParams('region=invalid&city=invalid'), 'japan').city.en).toBe('Tokyo');
  });
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
