import { describe, expect, it } from 'vitest';
import { validRecentPlaces } from './recentPlaces';
describe('Recent place selection', () => {
  it('accepts named Hong Kong places and excludes GPS entries and malformed storage', () => {
    const p = { id: 'test', name: 'Cheung Sha Wan', address: 'Hong Kong', lat: 22.338, lng: 114.153, type: 'station', googleMapsUrl: '' };
    expect(validRecentPlaces([p, { ...p, type: 'location' }, { ...p, lat: 0 }, { id: 'invalid' }])).toEqual([p]);
    expect(validRecentPlaces({})).toEqual([]);
  });
});
