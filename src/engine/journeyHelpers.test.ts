import { describe, expect, it } from 'vitest';
import {
  dedupeByRouteNumber,
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

describe('dedupeByRouteNumber', () => {
  it('keeps the best-scoring variant of the same route set', () => {
    const outbound = { finalScore: 38, legs: [{ routeNumber: '234X' }] };
    const inbound = { finalScore: 35, legs: [{ routeNumber: '234X' }] };
    const other = { finalScore: 40, legs: [{ routeNumber: '30' }] };

    const result = dedupeByRouteNumber([outbound, other, inbound]);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(inbound);
    expect(result.map((route) => route.finalScore)).toEqual([35, 40]);
  });

  it('treats different route combinations as distinct journeys', () => {
    const direct = { finalScore: 30, legs: [{ routeNumber: '30X' }] };
    const viaTransfer = {
      finalScore: 32,
      legs: [{ routeNumber: '243M' }, { routeNumber: '30X' }],
    };

    expect(dedupeByRouteNumber([direct, viaTransfer])).toHaveLength(2);
  });

  it('collapses mirrored route sets that differ only by order', () => {
    const a = { finalScore: 33, legs: [{ routeNumber: 'A' }, { routeNumber: 'B' }] };
    const b = { finalScore: 31, legs: [{ routeNumber: 'A' }, { routeNumber: 'B' }] };

    const result = dedupeByRouteNumber([a, b]);

    expect(result).toHaveLength(1);
    expect(result[0].finalScore).toBe(31);
  });
});
