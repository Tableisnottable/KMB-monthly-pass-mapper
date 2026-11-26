import { describe, expect, it } from 'vitest';
import { macauPatternById } from '../data/macau/network';
import { parseMacauLive } from './macauLive';

describe('Macao live bus data', () => {
  it('estimates downstream arrivals from bounded live positions and route geometry', () => {
    const pattern = macauPatternById.get('MO:BUS:1A:0')!;
    const feed = pattern.stops.map((_, index) => ({
      bus: index === 1 ? [{ ref: '#HE147', lat: '22.207115', lng: '113.543920', speed: 4, status: '0' }] : [],
    }));
    const result = parseMacauLive({ ...feed }, pattern, '2026-11-26T04:00:00.000Z');
    expect(result.vehicleCount).toBe(1);
    expect(result.updatedAt).toBe('2026-11-26T04:00:00.000Z');
    expect(result.etaByStop[pattern.stops.length - 1]).toMatchObject({ vehicles: 1 });
    expect(result.etaByStop[pattern.stops.length - 1].minutes).toBeGreaterThan(0);
    expect(result.etaByStop[0]).toBeUndefined();
    expect(parseMacauLive({ 1: feed[1] }, pattern).etaByStop).toEqual({});
  });

  it('ignores malformed bus rows and non-Macao coordinates', () => {
    const result = parseMacauLive({ 0: { bus: [{ ref: '#BAD', lat: '22.2', lng: '113.6', speed: 'unknown' }] } }, macauPatternById.get('MO:BUS:1A:0')!);
    expect(result.vehicleCount).toBe(0);
    expect(result.etaByStop).toEqual({});
  });
});
