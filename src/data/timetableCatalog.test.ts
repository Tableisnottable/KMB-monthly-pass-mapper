import { describe, expect, it } from 'vitest';
import { compareRouteNumbers } from './routeOrder';
import { residentsRoutes } from './residentsServices';
import { searchTimetableRoutes, timetableRoutes } from './timetableCatalog';

describe('Timetable route ordering and residents’ coverage', () => {
  it('sorts numbers and suffixes naturally instead of putting 10 and 102 before 2', () => {
    const numbers = ['112', '11', '109', '108', '106', '103', '102P', '10', '1', '2', '2A', '9', 'A23', 'A2', 'A10', 'NR331S', 'NR331', 'NR10', 'NR4'];
    expect(numbers.sort(compareRouteNumbers)).toEqual(['1', '2', '2A', '9', '10', '11', '102P', '103', '106', '108', '109', '112', 'A2', 'A10', 'A23', 'NR4', 'NR10', 'NR331', 'NR331S']);
    expect(['', 'A10', '1', ''].sort(compareRouteNumbers)).toEqual(['1', 'A10', '', '']);
  });
  it('orders the entire result set before pagination and keeps page boundaries stable', () => {
    const routes = searchTimetableRoutes('', 'KMB');
    expect(routes.findIndex(r => r.number === '2')).toBeLessThan(routes.findIndex(r => r.number === '10'));
    const pages = [routes.slice(0, 100), routes.slice(100, 200)].flat();
    for (let i = 1; i < pages.length; i++) expect(compareRouteNumbers(pages[i - 1].number, pages[i].number)).toBeLessThanOrEqual(0);
    expect(new Set(pages.map(r => r.id)).size).toBe(pages.length);
  });
  it('covers every approved residents’ directory entry with bilingual official documents', () => {
    expect(residentsRoutes.filter(r => r.number.startsWith('NR'))).toHaveLength(189);
    expect(residentsRoutes.filter(r => r.number.startsWith('HR'))).toHaveLength(45);
    expect(residentsRoutes.filter(r => r.number.startsWith('KR'))).toHaveLength(14);
    for (const route of residentsRoutes) {
      expect(searchTimetableRoutes(route.number).some(r => r.number === route.number)).toBe(true);
      for (const url of [route.documentUrlEn, route.documentUrlTc]) {
        expect(new URL(url).hostname).toBe('www.td.gov.hk');
        expect(new URL(url).pathname.toLowerCase()).toMatch(/\.pdf$/);
      }
      expect(route.nameEn).toBeTruthy(); expect(route.nameTc).toBeTruthy();
    }
  });
  it('keeps existing NR GTFS schedules without duplicate directory cards', () => {
    const exact = searchTimetableRoutes('NR331').filter(r => r.number === 'NR331');
    expect(exact).toHaveLength(1);
    expect(exact[0]).toMatchObject({ id: '1985', operator: 'PI' });
    expect(searchTimetableRoutes('NR331', 'RESIDENTS').map(r => r.number)).toEqual(['NR331', 'NR331S']);
    expect(searchTimetableRoutes('NR10', 'RESIDENTS').some(r => r.id === 'residents:NR10')).toBe(true);
    expect(new Set(timetableRoutes.map(r => r.id)).size).toBe(timetableRoutes.length);
  });
});
