import { networkPatterns, networkRoutes, stopOffset } from './transportNetwork';
import { hongKongServiceDate, patternTimetable, publishedTimetableSlots } from './networkTimetable';
import type { ScheduledBusRun } from '../domain/busMap';

/** These are timetable simulations, never observations of physical vehicles. */
export function scheduledBusRuns(patternIndex: number, now = new Date()): ScheduledBusRun[] {
  const pattern = networkPatterns[patternIndex];
  if (!pattern || networkRoutes[pattern.r][5] !== 'BUS') return [];
  const anchor = now.getTime(), runs = new Map<string, ScheduledBusRun>();
  // A service date can include departures after midnight. Look far enough back
  // to retain any of those trips still running on the current calendar date.
  const lookback = Math.ceil(Math.max(0, ...pattern.w.map(row => Math.max(row[1], row[2]) + row[4])) / 1440);
  for (let shift = -lookback; shift <= 0; shift++) {
    const date = hongKongServiceDate(new Date(anchor + shift * 86400000));
    for (const entry of patternTimetable(patternIndex, date)) {
      const windowIndex = Number(entry.id.split(':').at(-2));
      const window = pattern.w[windowIndex];
      if (!window) continue;
      const [, , , , duration, profile] = window;
      const startOffset = stopOffset(pattern, 0, duration, profile);
      const stopOffsetsMinutes = pattern.s.map((_, index) => stopOffset(pattern, index, duration, profile) - startOffset);
      const runTime = stopOffsetsMinutes.at(-1)!;
      if (!(runTime > 0) || stopOffsetsMinutes.some((offset, index) => !Number.isFinite(offset) || (index > 0 && offset < stopOffsetsMinutes[index - 1]))) continue;
      for (const slot of publishedTimetableSlots([entry], anchor - runTime * 60000, anchor + 60000)) {
        const arrival = Date.parse(slot.time) + runTime * 60000;
        if (arrival <= anchor) continue;
        const id = `${pattern.id}:${slot.time}:${runTime}`;
        runs.set(id, { id, departureTime: slot.time, arrivalTime: new Date(arrival).toISOString(),
          stopOffsetsMinutes });
      }
    }
  }
  return Array.from(runs.values()).sort((a, b) => Date.parse(a.departureTime) - Date.parse(b.departureTime));
}
