import { describe, expect, it } from 'vitest';
import {
  deriveHeadway,
  directionCode,
  routeEtaMinutes,
  type EtaRecordLike,
} from './journeyHelpers';

function eta(route: string, dir: string, minutesFromNow: number | null): EtaRecordLike {
  return {
    route,
    dir,
    eta: minutesFromNow === null ? null : new Date(Date.now() + minutesFromNow * 60000).toISOString(),
  };
}

describe('directionCode', () => {
  it('maps outbound to O', () => {
    expect(directionCode('outbound')).toBe('O');
  });

  it('maps inbound to I', () => {
    expect(directionCode('inbound')).toBe('I');
  });
});

describe('routeEtaMinutes', () => {
  it('keeps only ETAs for the requested route and direction', () => {
    const etas = [
      eta('1A', 'O', 5),
      eta('1A', 'I', 3),
      eta('2', 'O', 1),
      eta('1A', 'O', 8),
    ];
    const result = routeEtaMinutes(etas, '1A', 'outbound');
    expect(result).toEqual([5, 8]);
  });

  it('returns ascending minutes for multiple arrivals', () => {
    const etas = [eta('1A', 'O', 12), eta('1A', 'O', 4), eta('1A', 'O', 20)];
    expect(routeEtaMinutes(etas, '1A', 'outbound')).toEqual([4, 12, 20]);
  });

  it('ignores null ETAs', () => {
    const etas = [eta('1A', 'O', null), eta('1A', 'O', 6)];
    expect(routeEtaMinutes(etas, '1A', 'outbound')).toEqual([6]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(routeEtaMinutes([eta('9', 'O', 2)], '1A', 'outbound')).toEqual([]);
    expect(routeEtaMinutes([eta('1A', 'O', 2)], '1A', 'inbound')).toEqual([]);
  });
});

describe('deriveHeadway', () => {
  it('uses the average gap of consecutive ETAs', () => {
    expect(deriveHeadway([5, 15, 25])).toBe(10);
  });

  it('rounds fractional gaps', () => {
    expect(deriveHeadway([2, 9, 16])).toBe(7);
  });

  it('falls back when fewer than two ETAs are known', () => {
    expect(deriveHeadway([])).toBe(10);
    expect(deriveHeadway([5])).toBe(10);
    expect(deriveHeadway([5], 15)).toBe(15);
  });

  it('falls back when the gap is implausible', () => {
    expect(deriveHeadway([1, 90])).toBe(10);
    expect(deriveHeadway([0, 0])).toBe(10);
  });
});
