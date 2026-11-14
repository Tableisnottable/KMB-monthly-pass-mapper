import { describe, expect, it } from 'vitest';
import { departureType, providerMarksScheduled } from './departureType';
describe('Departure type classification', () => {
  it('keeps timetable matching separate from whether a prediction is live', () => {
    expect(departureType({ status: 'LIVE', scheduleMatch: 'MATCHED' })).toBe('LIVE');
    expect(departureType({ status: 'LIVE', scheduleMatch: 'UNVERIFIED' })).toBe('LIVE');
    expect(departureType({ status: 'TIMETABLE' })).toBe('SCHEDULED');
    expect(departureType({ status: 'UNVERIFIED' })).toBeUndefined();
    expect(departureType({ status: 'NO_UPCOMING' })).toBeUndefined();
  });
  it.each(['Scheduled Bus', '原定班次', '預定班次', '原定班次 · Scheduled Bus'])('recognises %s from an arrival feed as scheduled', remark => {
    expect(providerMarksScheduled(remark)).toBe(true);
    expect(departureType({ status: 'LIVE', remark, scheduleMatch: 'MATCHED' })).toBe('SCHEDULED');
    expect(departureType({ status: 'LIVE', remark, scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE' })).toBe('SCHEDULED');
  });
  it('retains provider extras and inferred out-of-window live departures as additional', () => {
    expect(departureType({ remark: '加班車', scheduleMatch: 'MATCHED' })).toBe('ADDITIONAL');
    expect(departureType({ addedReason: 'PROVIDER', scheduleMatch: 'ADDED' })).toBe('ADDITIONAL');
    expect(departureType({ scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE' })).toBe('ADDITIONAL');
  });
});
