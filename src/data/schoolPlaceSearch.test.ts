import { describe, expect, it } from 'vitest';
import { findSchoolPlaces, schoolPlacesMeta } from './schoolPlaceSearch';

describe('Education Bureau school search', () => {
  it.each(['CSWCSS', 'cswcss', 'CSW CSS', 'C.S.W.C.S.S.', 'ＣＳＷＣＳＳ', '長沙灣天主教英文中學', 'Cheung Sha Wan Catholic Secondary School'])(
    'resolves the reported school by name or initials: %s', query => {
      const result = findSchoolPlaces(query);
      expect(result.exact).toBe(true);
      expect(result.places[0]).toMatchObject({ type: 'school', lat: 22.3385701, lng: 114.1539069 });
      expect(result.places[0].name).toContain('長沙灣天主教英文中學');
      expect(result.places[0].address).toContain('533');
    },
  );
  it('searches the broader directory, reordered English words and school addresses', () => {
    expect(schoolPlacesMeta.places).toBeGreaterThan(3000);
    expect(findSchoolPlaces('catholic cheung sha wan').places[0].name).toContain('長沙灣天主教');
    expect(findSchoolPlaces('福榮街533').places[0].name).toContain('長沙灣天主教');
    expect(findSchoolPlaces('DBS').places.some(place => place.name.includes('DIOCESAN BOYS'))).toBe(true);
  });
  it('keeps ambiguous campuses selectable and never invents a match', () => {
    expect(findSchoolPlaces('ST PAUL').places.length).toBeGreaterThan(1);
    expect(findSchoolPlaces('unmatched school xyz').places).toEqual([]);
    expect(findSchoolPlaces('s').places).toEqual([]);
  });
});
