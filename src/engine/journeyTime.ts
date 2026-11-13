export type JourneyTimeMode = 'now' | 'depart' | 'arrive';
export interface JourneyTimeSelection { mode: JourneyTimeMode; value: string }
export function hongKongInputValue(date = new Date()): string {
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 16);
}
export function parseJourneyTime(mode: string | null, value: string | null, now: Date) {
  if (mode && !['now', 'depart', 'arrive'].includes(mode)) throw new Error('Choose now, depart or arrive.');
  if (!mode || mode === 'now') return { mode: 'now' as const, date: now };
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('A departure or arrival time with its time zone is required.');
  }
  const date = new Date(value), day = Number(value.slice(8, 10)), month = Number(value.slice(5, 7));
  const maxDay = new Date(Date.UTC(Number(value.slice(0, 4)), month, 0)).getUTCDate();
  if (!Number.isFinite(date.getTime()) || month < 1 || month > 12 || day < 1 || day > maxDay || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59) {
    throw new Error('Enter a valid date and time.');
  }
  if (date.getTime() < now.getTime() - 86400000 || date.getTime() > now.getTime() + 90 * 86400000) {
    throw new Error('Choose a time from the past 24 hours to the next 90 days.');
  }
  return { mode: mode as 'depart' | 'arrive', date };
}
export function hongKongTimeLabel(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
