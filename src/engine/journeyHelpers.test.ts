import { describe, expect, it } from 'vitest';
import {
  dedupeByRouteNumber,
  deriveHeadway,
  directionCode,
  haversineKm,
  hasUpcomingTrip,
  isTooCloseToRide,
  pickAlightingIndex,
  pickStopsByWalkBand,
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

describe('isTooCloseToRide', () => {
  it('treats an identical origin and destination as walk-only', () => {
    expect(isTooCloseToRide(22.3193, 114.1694, 22.3193, 114.1694)).toBe(true);
  });

  it('treats a few hundred metres as walk-only', () => {
    expect(isTooCloseToRide(22.3193, 114.1694, 22.3220, 114.1694)).toBe(true);
  });

  it('allows riding once the points are a real trip apart', () => {
    expect(isTooCloseToRide(22.3193, 114.1694, 22.3280, 114.1694)).toBe(false);
  });

  it('computes distance with the haversine formula', () => {
    // Tsim Sha Tsui to Central is roughly 4.7 km in a straight line.
    const km = haversineKm(22.2978, 114.172, 22.2819, 114.1581);
    expect(km).toBeGreaterThan(2);
    expect(km).toBeLessThan(3);
  });
});

describe('pickStopsByWalkBand', () => {
  const stop = (id: string, walkMinutes: number) => ({ stop: { id }, walkMinutes });

  it('does not let one dense cluster consume the whole budget', () => {
    const dense = Array.from({ length: 30 }, (_unused, index) => stop(`near${index}`, 1));
    const further = [stop('mid', 4), stop('far', 8), stop('farther', 14)];

    const picked = pickStopsByWalkBand([...dense, ...further], 12);
    const ids = picked.map((entry) => entry.stop.id);

    expect(picked).toHaveLength(12);
    expect(ids).toContain('mid');
    expect(ids).toContain('far');
  });

  it('keeps results sorted by walking time', () => {
    const picked = pickStopsByWalkBand(
      [stop('c', 12), stop('a', 1), stop('b', 4)],
      3,
    );

    expect(picked.map((entry) => entry.stop.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns every stop when the limit exceeds the pool', () => {
    expect(pickStopsByWalkBand([stop('a', 1), stop('b', 9)], 10)).toHaveLength(2);
  });
});

describe('hasUpcomingTrip', () => {
  const past = new Date(Date.now() - 5 * 60000).toISOString();
  const soon = new Date(Date.now() + 5 * 60000).toISOString();

  it('reports a trip when the provider lists a future arrival', () => {
    expect(hasUpcomingTrip([{ route: '30X', dir: 'I', eta: soon }], '30X', 'inbound')).toBe(true);
  });

  it('reports no trip when every arrival is in the past', () => {
    expect(hasUpcomingTrip([{ route: '30X', dir: 'I', eta: past }], '30X', 'inbound')).toBe(false);
  });

  it('ignores arrivals in the opposite direction', () => {
    expect(hasUpcomingTrip([{ route: '30X', dir: 'O', eta: soon }], '30X', 'inbound')).toBe(false);
  });

  it('treats a null eta as no trip', () => {
    expect(hasUpcomingTrip([{ route: '30X', dir: 'I', eta: null }], '30X', 'inbound')).toBe(false);
  });

  it('treats the empty string KMB sends for unscheduled routes as no trip', () => {
    expect(hasUpcomingTrip([{ route: 'N260', dir: 'O', eta: '' }], 'N260', 'outbound')).toBe(false);
  });

  it('ignores unparseable timestamps instead of throwing', () => {
    expect(hasUpcomingTrip([{ route: '30X', dir: 'I', eta: 'not-a-date' }], '30X', 'inbound')).toBe(false);
  });
});

describe('pickAlightingIndex', () => {
  const sequence = [
    { stop: 'MOK1' },
    { stop: 'MOK2' },
    { stop: 'TW1' },
    { stop: 'TW2' },
  ];

  it('picks the earliest served alighting stop after boarding', () => {
    const result = pickAlightingIndex(sequence, 'TW1', new Set(['MOK1', 'MOK2']));

    expect(result).toBeNull();
  });

  it('returns the closest later stop when the direction is valid', () => {
    const result = pickAlightingIndex(sequence, 'MOK1', new Set(['TW1', 'TW2']));

    expect(result).toEqual({ stopId: 'TW1', index: 2 });
  });

  it('rejects a boarding stop that this direction never serves', () => {
    expect(pickAlightingIndex(sequence, 'ABSENT', new Set(['MOK2']))).toBeNull();
  });

  it('rejects when the destination is only reachable before boarding', () => {
    expect(pickAlightingIndex(sequence, 'TW2', new Set(['MOK1', 'MOK2']))).toBeNull();
  });
});
