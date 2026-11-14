import { hongKongClock, networkPatterns, networkRoutes, networkStops, serviceCalendarStatus } from './transportNetwork';
import { departureType, providerMarksAdditional, providerMarksScheduled, type DepartureTimingType, type DepartureType, type TimetableComparison } from '../domain/departureType';

export type ScheduleMatch = 'MATCHED' | 'ADDED' | 'UNVERIFIED';
export type AddedReason = 'PROVIDER' | 'NOT_IN_TIMETABLE';
export interface LiveDeparture extends TimetableComparison {
  /** Rows from arrival feeds can be live, provider-scheduled, or additional. */
  departureType?: DepartureType;
  timingType?: DepartureTimingType;
  time: string;
  minutes: number;
  remark?: string;
  operator?: string;
  scheduleMatch: ScheduleMatch;
  addedReason?: AddedReason;
  changedReason?: 'PROVIDER' | 'OBSERVED_SPACING';
}
export interface CancellationNotice {
  departureType: 'CANCELLED';
  operator?: string;
  remark: string;
  time?: string;
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
  let result: { time: string; minutes: number; publishedHeadwayMinutes?: number } | undefined;
  for (const shift of [-1, 0, 1]) {
    const date = hongKongServiceDate(new Date(now.getTime() + shift * 86400000));
    for (const entry of patternTimetable(patternIndex, date, boardingIndex)) {
      let time = Date.parse(entry.start);
      if (entry.headwayMinutes > 0 && time < now.getTime()) time += Math.ceil((now.getTime() - time) / (entry.headwayMinutes * 60000)) * entry.headwayMinutes * 60000;
      if (time < now.getTime() || entry.headwayMinutes > 0 && time >= Date.parse(entry.end)) continue;
      const minutes = (time - now.getTime()) / 60000;
      if (!result || minutes < result.minutes) result = { time: new Date(time).toISOString(), minutes, publishedHeadwayMinutes: entry.headwayMinutes || undefined };
    }
  }
  return result;
}

const routePatterns = new Map<number, number[]>();
networkPatterns.forEach((pattern, index) => routePatterns.set(pattern.r, [...(routePatterns.get(pattern.r) ?? []), index]));

/** Compare with compatible variants and adjacent service days, allowing ETA drift. */
export function matchDepartureToTimetable(patternIndex: number, boarding: number, alighting: number, time: string, remark = ''):
  Pick<LiveDeparture, 'scheduleMatch' | 'addedReason'> {
  if (providerMarksAdditional(remark)) return { scheduleMatch: 'ADDED', addedReason: 'PROVIDER' };
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
            // A provider's "Scheduled Bus" at a terminal can be checked
            // against the published slots, not merely the service window.
            // Intermediate offsets are interpolated, so do not infer an extra
            // from a few minutes' deviation at a downstream stop.
            if (providerMarksScheduled(remark) && !entry.estimatedStopTime) {
              const start = Date.parse(entry.start), end = Date.parse(entry.end);
              const slot = entry.headwayMinutes > 0 ? start + Math.round((timestamp - start) / (entry.headwayMinutes * 60000)) * entry.headwayMinutes * 60000 : start;
              if (Math.abs(timestamp - slot) > 30000 || slot < start || entry.headwayMinutes > 0 && slot >= end) continue;
            }
            return { scheduleMatch: 'MATCHED' };
          }
        }
      }
    }
  }
  return covered ? { scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE' } : { scheduleMatch: 'UNVERIFIED' };
}

/** Nearest timetable reference, not a trip-ID match or confirmed delay. */
export function compareDepartureToTimetable(patternIndex: number, boarding: number, time: string): TimetableComparison {
  const timestamp = Date.parse(time);
  if (!Number.isFinite(timestamp)) return {};
  let nearest: { slot: number; difference: number; basis: TimetableComparison['comparisonBasis'] } | undefined;
  for (const shift of [-1, 0]) {
    const day = hongKongServiceDate(new Date(timestamp + shift * 86400000));
    for (const entry of patternTimetable(patternIndex, day, boarding)) {
      const start = Date.parse(entry.start), end = Date.parse(entry.end), step = entry.headwayMinutes * 60000;
      const slot = step ? start + Math.max(0, Math.min(Math.ceil((end - start) / step) - 1, Math.round((timestamp - start) / step))) * step : start;
      const difference = (timestamp - slot) / 60000;
      // Do not compare unrelated shifts across large gaps or closed periods.
      if (Math.abs(difference) > Math.max(30, entry.headwayMinutes / 2)) continue;
      const basis = entry.estimatedStopTime ? 'INTERPOLATED' : step ? 'FREQUENCY' : 'FIXED';
      if (!nearest || Math.abs(difference) < Math.abs(nearest.difference)) nearest = { slot, difference, basis };
    }
  }
  return nearest ? { timetableTime: new Date(nearest.slot).toISOString(), deviationMinutes: Math.round(nearest.difference * 10) / 10, comparisonBasis: nearest.basis } : {};
}

/** Sparse ETA feeds cannot prove cancellations: flag slower patterns as inferred. */
export function classifyDepartureTypes(patternIndex: number, boarding: number, departures: LiveDeparture[]): LiveDeparture[] {
  const classified = departures.map(row => ({ ...row, departureType: departureType(row) }));
  if (boarding !== 0) return classified;
  const operators = new Set(classified.map(row => row.operator));
  for (const operator of Array.from(operators)) {
    const rows = classified.filter(row => row.operator === operator && providerMarksScheduled(row.remark)
      && row.addedReason !== 'PROVIDER').sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    const observed = new Set(rows.map(row => Date.parse(row.time)));
    if (observed.size < 3 || !rows.some(row => row.addedReason === 'NOT_IN_TIMETABLE')) continue;
    const first = Date.parse(rows[0].time), last = Date.parse(rows.at(-1)!.time), slots = new Set<number>();
    for (const shift of [-1, 0]) {
      const date = hongKongServiceDate(new Date(first + shift * 86400000));
      for (const entry of patternTimetable(patternIndex, date, boarding)) {
        const start = Date.parse(entry.start), end = Date.parse(entry.end), step = entry.headwayMinutes * 60000;
        if (!step) { if (start >= first && start <= last) slots.add(start); continue; }
        for (let slot = start + Math.max(0, Math.ceil((first - start) / step)) * step; slot <= last && slot < end; slot += step) slots.add(slot);
      }
    }
    if (slots.size <= observed.size) continue;
    for (const row of rows) if (row.addedReason === 'NOT_IN_TIMETABLE') {
      row.departureType = 'CHANGED'; row.changedReason = 'OBSERVED_SPACING';
    }
  }
  return classified;
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
