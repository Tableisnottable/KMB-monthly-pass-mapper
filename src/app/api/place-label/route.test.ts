import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
vi.mock('../../../lib/cloudflare', () => ({ getRateLimiter: vi.fn(async () => null) }));
afterEach(() => vi.unstubAllGlobals());
const request = (query = 'lat=22.33882&lon=114.15387&lang=en') => new NextRequest('http://localhost/api/place-label?' + query);

describe('Readable map-point labels', () => {
  it('uses the returned street name and full address', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ name: 'Cheung Sha Wan Road', display_name: 'Cheung Sha Wan Road, Kowloon, Hong Kong' }))));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 'Cheung Sha Wan Road', address: 'Cheung Sha Wan Road, Kowloon, Hong Kong' });
  });
  it('falls back to a readable nearby stop when reverse lookup is offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ name: expect.stringMatching(/^Near .+/), address: expect.stringContaining('approximate') });
  });
  it('rejects missing, malformed and out-of-Hong-Kong points before requesting an upstream', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    for (const query of ['', 'lat=nope&lon=114.15', 'lat=0&lon=114.15', 'lat=22.3&lon=180']) {
      expect((await GET(request(query))).status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
