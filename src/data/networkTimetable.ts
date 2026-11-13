import { hongKongClock, networkPatterns, networkRoutes, networkStops, serviceCalendarStatus } from './transportNetwork';

export type ScheduleMatch = 'MATCHED' | 'ADDED' | 'UNVERIFIED';
export type AddedReason = 'PROVIDER' | 'NOT_IN_TIMETABLE';
export interface LiveDeparture {
  time: string;
  minutes: number;
  remark?: string;
  operator?: string;
  scheduleMatch: ScheduleMatch;
  addedReason?: AddedReason;
}
export interface TimetableEntry {
  id: string;
  serviceId: number;
  serviceDate: string;
  start: string;
  end: string;
  startMinute: number;
  endMinute: number;
  headwayMinutes: number;
  kind: 'DEPARTURE' | 'FREQUENCY';
  estimatedStopTime: boolean;
  calendarAdded: boolean;
}

export function parseServiceDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use a service date in YYYY-MM-DD format.');
  const date = new Date(value + 'T00:00:00+08:00');
  if (!Number.isFinite(date.getTime()) || hongKongClock(date).day !== value.replace(/-/g, '')) throw new Error('Invalid service date.');
  return date;
}
export function hongKongServiceDate(date = new Date()): string {
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

/** Publish original headway windows; they are not exact departure slots. */
export function patternTimetable(patternIndex: number, serviceDate: string, boardingIndex = 0): TimetableEntry[] {
  const day = parseServiceDate(serviceDate), pattern = networkPatterns[patternIndex];
  if (!pattern || !Number.isInteger(boardingIndex) || boardingIndex < 0 || boardingIndex >= pattern.s.length - 1 || pattern.p[boardingIndex] !== 0) return [];
  const total = pattern.t[pattern.t.length - 1];
  return pattern.w.flatMap(([service, start, end, headway, duration], index) => {
    const calendar = serviceCalendarStatus(service, day);
    if (!calendar.active) return [];
    const offset = pattern.t[boardingIndex] * (total ? duration / total : 1);
    const startMinute = start + offset, endMinute = (headway > 0 ? end : start) + offset;
    return [{ id: `${pattern.id}:${serviceDate}:${index}:${boardingIndex}`, serviceId: service, serviceDate,
      start: new Date(day.getTime() + startMinute * 60000).toISOString(),
      end: new Date(day.getTime() + endMinute * 60000).toISOString(), startMinute, endMinute,
      headwayMinutes: headway, kind: headway > 0 ? 'FREQUENCY' as const : 'DEPARTURE' as const,
      estimatedStopTime: boardingIndex > 0, calendarAdded: calendar.added }];
  }).sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
}

/** No 90-minute cutoff: a station can link to its next published shift. */
export function nextPublishedDeparture(patternIndex: number, boardingIndex: number, now: Date) {
  let result: { time: string; minutes: number } | undefined;
  for (const shift of [-1, 0, 1]) {
    const date = hongKongServiceDate(new Date(now.getTime() + shift * 86400000));
    for (const entry of patternTimetable(patternIndex, date, boardingIndex)) {
      let time = Date.parse(entry.start);
      if (entry.headwayMinutes > 0 && time < now.getTime()) time += Math.ceil((now.getTime() - time) / (entry.headwayMinutes * 60000)) * entry.headwayMinutes * 60000;
      if (time < now.getTime() || entry.headwayMinutes > 0 && time >= Date.parse(entry.end)) continue;
      const minutes = (time - now.getTime()) / 60000;
      if (!result || minutes < result.minutes) result = { time: new Date(time).toISOString(), minutes };
    }
  }
  return result;
}

const routePatterns = new Map<number, number[]>();
networkPatterns.forEach((pattern, index) => routePatterns.set(pattern.r, [...(routePatterns.get(pattern.r) ?? []), index]));

/** Compare with compatible variants and adjacent service days, allowing ETA drift. */
export function matchDepartureToTimetable(patternIndex: number, boarding: number, alighting: number, time: string, remark = ''):
  Pick<LiveDeparture, 'scheduleMatch' | 'addedReason'> {
  if (/(?:\bextra\b|\badditional\b|加班|加開|加开|特別加)/i.test(remark)) return { scheduleMatch: 'ADDED', addedReason: 'PROVIDER' };
  const pattern = networkPatterns[patternIndex], timestamp = Date.parse(time);
  if (!pattern || !Number.isFinite(timestamp)) return { scheduleMatch: 'UNVERIFIED' };
  const day = parseServiceDate(hongKongServiceDate(new Date(timestamp)));
  let covered = false;
  for (const index of routePatterns.get(pattern.r) ?? []) {
    const candidate = networkPatterns[index];
    for (let position = 0; position < candidate.s.length - 1; position++) {
      if (candidate.s[position] !== pattern.s[boarding] || candidate.p[position] !== 0
        || !candidate.s.slice(position + 1).includes(pattern.s[alighting])) continue;
      for (const shift of [-1, 0]) {
        const serviceDay = new Date(day.getTime() + shift * 86400000);
        if (shift === 0 && candidate.w.some(w => serviceCalendarStatus(w[0], serviceDay).covered)) covered = true;
        for (const entry of patternTimetable(index, hongKongServiceDate(serviceDay), position)) {
          const tolerance = (entry.estimatedStopTime ? 20 : 15) * 60000;
          if (timestamp >= Date.parse(entry.start) - tolerance && timestamp <= Date.parse(entry.end) + tolerance) {
            return { scheduleMatch: 'MATCHED' };
          }
        }
      }
    }
  }
  return covered ? { scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE' } : { scheduleMatch: 'UNVERIFIED' };
}

export function routeTimetable(routeId: string, serviceDate: string, patternId?: string, stopId?: string) {
  parseServiceDate(serviceDate);
  const routeIndex = networkRoutes.findIndex(route => route[0] === routeId);
  if (routeIndex < 0) throw new Error('Unknown route.');
  const variants = (routePatterns.get(routeIndex) ?? []).map(index => {
    const pattern = networkPatterns[index];
    return { id: pattern.id, direction: pattern.d, origin: networkStops[pattern.s[0]],
      destination: networkStops[pattern.s[pattern.s.length - 1]],
      stops: pattern.s.map((stop, position) => ({ id: networkStops[stop][0], nameTc: networkStops[stop][1], nameEn: networkStops[stop][2], position,
        canBoard: pattern.p[position] === 0 && position < pattern.s.length - 1 })) };
  });
  const selected = patternId ? variants.find(variant => variant.id === patternId) : variants[0];
  if (!selected) throw new Error('Unknown route direction or variant.');
  const index = networkPatterns.findIndex(pattern => pattern.id === selected.id), pattern = networkPatterns[index];
  const boarding = stopId ? pattern.s.findIndex(stop => networkStops[stop][0] === stopId) : 0;
  if (boarding < 0 || boarding >= pattern.s.length - 1 || pattern.p[boarding] !== 0) throw new Error('Choose a boarding stop on this variant.');
  return { route: networkRoutes[routeIndex], serviceDate, variants, selectedPattern: selected.id, boardingIndex: boarding,
    calendarCovered: pattern.w.some(window => serviceCalendarStatus(window[0], parseServiceDate(serviceDate)).covered),
    timetablePublished: pattern.w.length > 0, entries: patternTimetable(index, serviceDate, boarding) };
}
