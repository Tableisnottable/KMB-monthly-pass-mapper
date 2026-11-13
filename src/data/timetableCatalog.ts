import { networkRoutes } from './transportNetwork';
import { residentsRoutes } from './residentsServices';
import { compareRouteResults } from './routeOrder';

// Preserve GTFS schedules and company metadata when a directory entry overlaps.
const scheduledNumbers = new Set(networkRoutes.map(route => route[2].toUpperCase()));
export const timetableRoutes = [
  ...networkRoutes.map(r => ({ id: r[0], operator: r[1], number: r[2], nameTc: r[3], nameEn: r[4], mode: r[5] })),
  ...residentsRoutes.filter(r => !scheduledNumbers.has(r.number)).map(r => ({
    id: r.id, operator: 'RESIDENTS', number: r.number, nameTc: r.nameTc, nameEn: r.nameEn, mode: 'BUS',
  })),
].sort(compareRouteResults);

export function isResidentsService(route: { number: string }) { return /^(NR|HR|KR)\d/i.test(route.number); }
export function searchTimetableRoutes(query = '', operator: string | null = null, mode: string | null = null) {
  const needle = query.trim().toLowerCase();
  return timetableRoutes.filter(r => (!operator || (operator === 'RESIDENTS' ? isResidentsService(r) : r.operator === operator))
    && (!mode || r.mode === mode) && (!needle || [r.number, r.nameTc, r.nameEn].join(' ').toLowerCase().includes(needle)));
}
