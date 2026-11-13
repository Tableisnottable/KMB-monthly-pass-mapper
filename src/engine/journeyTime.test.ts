import { describe, expect, it } from 'vitest';
import { hongKongInputValue, hongKongTimeLabel, parseJourneyTime } from './journeyTime';
const now = new Date('2026-11-13T04:00:00Z');
describe('Hong Kong journey times', () => {
  it('keeps the wall clock in Hong Kong across UTC midnight', () => {
    expect(hongKongInputValue(new Date('2026-11-13T16:05:00Z'))).toBe('2026-11-14T00:05');
    expect(hongKongTimeLabel('2026-11-13T16:05:00Z')).toBe('00:05');
  });
  it('accepts explicit departure and arrival instants', () => {
    expect(parseJourneyTime('depart', '2026-11-13T15:30:00+08:00', now).date.toISOString()).toBe('2026-11-13T07:30:00.000Z');
    expect(parseJourneyTime('arrive', '2026-11-14T00:30:00+08:00', now).mode).toBe('arrive');
  });
  it.each([['depart', null], ['arrive', '2026-11-13T12:00'], ['bad', null], ['depart', '2026-11-31T12:00:00+08:00'], ['depart', '2026-12-13T24:00:00+08:00']])('rejects invalid time selection %s %s', (mode, value) => {
    expect(() => parseJourneyTime(mode, value, now)).toThrow();
  });
});
