import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

vi.mock('../../../lib/cloudflare', () => ({ getRateLimiter: vi.fn(async () => null) }));
afterEach(() => { vi.unstubAllGlobals(); });

async function search(query: string) {
  return GET(new NextRequest('http://localhost/api/places?q=' + encodeURIComponent(query)));
}

describe('Transit place suggestions', () => {
  it('returns local stop matches immediately without waiting for geocoding', async () => {
    const fetch = vi.fn(async () => { throw new Error('Must not wait for geocoding'); }); vi.stubGlobal('fetch', fetch);
    const response = await GET(new NextRequest('http://localhost/api/places?scope=local&q=Airport'));
    expect(response.status).toBe(200); expect((await response.json()).data.length).toBeGreaterThan(0); expect(fetch).not.toHaveBeenCalled();
  });
  it('finds CSWCSS without depending on the upstream geocoder', async () => {
    const fetch = vi.fn(async () => { throw new Error('offline'); }); vi.stubGlobal('fetch', fetch);
    const response = await search('CSWCSS');
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data[0].name).toContain('長沙灣天主教英文中學');
    expect(data[0].lat).toBeCloseTo(22.33857, 5);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps partial school matches when the upstream fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
    const response = await search('catholic cheung sha wan');
    expect(response.status).toBe(200);
    expect((await response.json()).data[0].name).toContain('長沙灣天主教');
  });
  it.each(['Hong Kong International Airport', '香港國際機場', 'HKG'])(
    'offers the ground transport centre before the airport centroid for %s', async query => {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json([{
        place_id: 1, display_name: '香港國際機場 Hong Kong International Airport, Hong Kong',
        lat: '22.3125986', lon: '113.9172999', type: 'aerodrome',
      }])));
      const response = await search(query);
      expect(response.status).toBe(200);
      const { data } = await response.json();
      expect(data[0].name).toContain('地面運輸中心');
      expect(data[0].type).toBe('bus_stop');
      expect(data[0].lng).toBeGreaterThan(113.93);
      expect(data.some((place: { type: string }) => place.type === 'aerodrome')).toBe(true);
    },
  );

  it('finds official stop names when geocoding has no results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
    const response = await search('興華街');
    const { data } = await response.json();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].name).toContain('興華街');
    expect(data[0].type).toBe('bus_stop');
  });

  it('retains stop suggestions when the geocoder is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network unavailable'); }));
    const response = await search('Airport');
    expect(response.status).toBe(200);
    const { data, meta } = await response.json();
    expect(data[0].name).toContain('地面運輸中心');
    expect(meta.geocoderUnavailable).toBe(true);
  });

  it('reports upstream failure when neither source can supply a match', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
    const response = await search('Unmatched place xyz');
    expect(response.status).toBe(502);
  });

  it.each(['Mui Wo', '三聖', 'Lo Wu', '港鐵中環站'])(
    'finds ferry/rail places outside the old Citybus-only catalogue: %s', async query => {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
      const response = await search(query);
      expect(response.status).toBe(200);
      const { data } = await response.json();
      expect(data.length).toBeGreaterThan(0);
      expect(data.some((p: { id: string }) => p.id.startsWith('network:'))).toBe(true);
    },
  );
});
