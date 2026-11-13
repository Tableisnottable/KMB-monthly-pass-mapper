import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

vi.mock('../../../lib/cloudflare', () => ({ getRateLimiter: vi.fn(async () => null) }));
vi.mock('../../../data/multimodalLive', () => ({ enrichJourneyArrivals: vi.fn(async () => undefined) }));
const lookup = (params: string) => GET(new NextRequest('http://localhost/api/network?' + params));

describe('All-network catalogue', () => {
  it('reports the actual snapshot coverage', async () => {
    const response = await lookup('resource=coverage');
    const data = await response.json();
    expect(data.counts.operators.GMB).toBe(779);
    expect(data.counts.operators.FERRY).toBe(58);
    expect(data.counts.operators.MTR).toBe(10);
  });
  it('preserves regional minibuses that share a route number', async () => {
    const { data } = await (await lookup('resource=routes&operator=GMB&q=1&limit=500')).json();
    const ones = data.filter((r: { number: string }) => r.number === '1');
    expect(ones.length).toBeGreaterThan(1);
    expect(new Set(ones.map((r: { id: string }) => r.id)).size).toBe(ones.length);
  });
  it('finds ferry piers with a mode filter', async () => {
    const { data } = await (await lookup('resource=stops&mode=FERRY&q=Mui%20Wo')).json();
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((s: { mode: string }) => s.mode === 'FERRY')).toBe(true);
  });
  it('understands station suffixes in the station search', async () => {
    const { data } = await (await lookup('resource=stops&q=Central%20Station')).json();
    expect(data.some((s: { mode: string; nameEn: string }) => s.mode === 'SUBWAY' && s.nameEn === 'Central')).toBe(true);
  });
  it('does not invent rail departures when the live feed is unavailable', async () => {
    const { data } = await (await lookup('resource=departures&stop=mtr%3A18&lang=en')).json();
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((r: { status: string; minutes: unknown }) => r.status === 'UNVERIFIED' && r.minutes === null)).toBe(true);
  });
  it('rejects unknown stops and resources', async () => {
    expect((await lookup('resource=departures&stop=unknown')).status).toBe(400);
    expect((await lookup('resource=unknown')).status).toBe(400);
  });
});
