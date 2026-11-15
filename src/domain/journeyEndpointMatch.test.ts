import { describe, expect, it } from 'vitest';
import { journeyMatchesEndpoints } from './journeyEndpointMatch';
import type { Route } from '../engine/UpgradedScoringEngine';

const origin = { lat: 22.33882, lng: 114.15387 };
const destination = { lat: 22.31367, lng: 113.93763 };
const route: Route = { id: 'n35', legs: [{ mode: 'BUS', operator: 'LWB',
  originStop: { id: 'airport', name: 'Airport', lat: 22.31367, lng: 113.93763 },
  destinationStop: { id: 'mui-wo', name: 'Mui Wo', lat: 22.264, lng: 113.996 },
}] };

describe('journey endpoint matching', () => {
  it('accepts routes that start and end near the selected places', () => {
    expect(journeyMatchesEndpoints(route, destination, { lat: 22.264, lng: 113.996 })).toBe(true);
  });

  it('rejects a route that starts on Lantau for a Shenzhen origin', () => {
    expect(journeyMatchesEndpoints(route, { lat: 22.53, lng: 114.07 }, destination)).toBe(false);
  });

  it('keeps legitimate border-stop access walks in both directions', () => {
    const futian = { lat: 22.534, lng: 114.057 };
    const huanggang = { id: '12743', name: 'Huanggang', lat: 22.5229, lng: 114.06709 };
    const airportStop = { id: 'airport', name: 'Airport', ...destination };
    const outbound: Route = { id: 'border-out', legs: [{ mode: 'BUS', operator: 'XB',
      originStop: huanggang, destinationStop: airportStop }] };
    const inbound: Route = { id: 'border-in', legs: [{ mode: 'BUS', operator: 'XB',
      originStop: airportStop, destinationStop: huanggang }] };
    expect(journeyMatchesEndpoints(outbound, futian, destination)).toBe(true);
    expect(journeyMatchesEndpoints(inbound, destination, futian)).toBe(true);
    expect(journeyMatchesEndpoints(outbound, { lat: 22.57, lng: 114.057 }, destination)).toBe(false);
    expect(journeyMatchesEndpoints(inbound, destination, { lat: 22.57, lng: 114.057 })).toBe(false);
  });

  it('keeps walking-only routes bound to the chosen places', () => {
    const walk: Route = { id: 'walk', legs: [{ mode: 'WALK', operator: 'WALK',
      originStop: { id: 'origin', name: 'Start', ...origin },
      destinationStop: { id: 'destination', name: 'End', ...destination },
    }] };
    expect(journeyMatchesEndpoints(walk, origin, destination)).toBe(true);
    expect(journeyMatchesEndpoints(walk, destination, origin)).toBe(false);
  });

  it('rejects transit routes without endpoint coordinates', () => {
    expect(journeyMatchesEndpoints({ id: 'missing-stops', legs: [{ mode: 'BUS', operator: 'KMB' }] }, origin, destination)).toBe(false);
  });
});
