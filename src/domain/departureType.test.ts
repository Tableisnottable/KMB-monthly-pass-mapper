import { describe, expect, it } from 'vitest';
import { departureTimingType, departureType, providerMarksScheduled } from './departureType';
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
    expect(departureType({ status: 'LIVE', remark, scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE' })).toBe('ADDITIONAL');
  });
  it('retains provider extras and inferred out-of-window live departures as additional', () => {
    expect(departureType({ remark: '加班車', scheduleMatch: 'MATCHED' })).toBe('ADDITIONAL');
    expect(departureType({ addedReason: 'PROVIDER', scheduleMatch: 'ADDED' })).toBe('ADDITIONAL');
    expect(departureType({ scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE' })).toBe('ADDITIONAL');
  });
  it('distinguishes explicit and inferred changes while preserving confirmed extras', () => {
    expect(departureType({ remark: 'Revised timetable', status: 'TIMETABLE' })).toBe('CHANGED');
    expect(departureType({ remark: '班次調整', status: 'LIVE' })).toBe('CHANGED');
    expect(departureType({ changedReason: 'OBSERVED_SPACING', scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE' })).toBe('CHANGED');
    expect(departureType({ departureType: 'CHANGED', remark: 'Scheduled Bus' })).toBe('CHANGED');
    expect(departureType({ changedReason: 'OBSERVED_SPACING', addedReason: 'PROVIDER' })).toBe('ADDITIONAL');
  });
  it('tracks live/timetable provenance independently of additional or changed service', () => {
    expect(departureTimingType({ status: 'LIVE', departureType: 'ADDITIONAL' })).toBe('LIVE');
    expect(departureTimingType({ remark: 'Scheduled Bus', departureType: 'ADDITIONAL' })).toBe('SCHEDULED');
    expect(departureTimingType({ timingType: 'LIVE', departureType: 'CHANGED' })).toBe('LIVE');
    expect(departureTimingType({ status: 'TIMETABLE', departureType: 'CHANGED' })).toBe('SCHEDULED');
    expect(departureTimingType({ status: 'UNVERIFIED' })).toBeUndefined();
  });
  it('requires explicit provider cancellation evidence and never calls it a live departure', () => {
    expect(departureType({ remark: 'Departure cancelled', status: 'LIVE' })).toBe('CANCELLED');
    expect(departureType({ remark: '班次取消', scheduleMatch: 'ADDED' })).toBe('CANCELLED');
    expect(departureTimingType({ remark: 'Cancelled Scheduled Bus' })).toBeUndefined();
    expect(departureType({ status: 'NO_UPCOMING' })).toBeUndefined();
  });
});
