import { describe, expect, it } from 'vitest';
import { governmentPlaces } from './governmentPlaceSearch';
describe('Government location search', () => {
  it('converts Harbour City grid coordinates and keeps bilingual labels', () => {
    const [place] = governmentPlaces([{ nameZH: '海港城', nameEN: 'HARBOUR CITY', districtZH: '油尖旺區', x: 835267, y: 817346 }], 'Harbour City');
    expect(place.lat).toBeGreaterThan(22.29); expect(place.lat).toBeLessThan(22.3);
    expect(place.lng).toBeGreaterThan(114.16); expect(place.lng).toBeLessThan(114.17);
    expect(place.nameEn).toBe('HARBOUR CITY'); expect(place.addressZh).toBe('油尖旺區');
  });
  it('puts the requested landmark ahead of equipment inside it', () => {
    const data = governmentPlaces([{ nameZH: '除顫器', nameEN: 'Automated External Defibrillators - Harbour City', x: 835200, y: 817300 },
      { nameZH: '海港城', nameEN: 'HARBOUR CITY', x: 835267, y: 817346 }], 'Harbour City');
    expect(data[0].name).toBe('海港城');
  });
  it('rejects malformed and out-of-area coordinates without manufacturing a place', () => {
    expect(governmentPlaces([{ nameZH: 'Bad', nameEN: 'Bad', x: 0, y: 0 }, { x: 'bad', y: 817346 }], 'Bad')).toEqual([]);
    expect(governmentPlaces({}, 'Bad')).toEqual([]);
  });
});
