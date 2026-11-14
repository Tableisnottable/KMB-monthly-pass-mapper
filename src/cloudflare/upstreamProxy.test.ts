import { describe, expect, it, vi } from 'vitest';
import { safeProviderUrl, providerCacheSeconds, proxyProvider } from './upstreamProxy';
describe('Free-hosting public provider proxy', () => {
  it.each([
    'https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/ABCD',
    'https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/001/104',
    'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=TWL&sta=CSW',
    'https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule?station_id=920',
    'https://data.etagmb.gov.hk/eta/route-stop/1/1/1',
    'https://resource.data.one.gov.hk/td/en/specialtrafficnews.xml',
    'https://routing.openstreetmap.de/routed-foot/route/v1/foot/114.1,22.3;114.2,22.4?overview=full',
    'https://routing.openstreetmap.de/routed-bike/route/v1/cycling/114.1,22.3;114.2,22.4?overview=full',
    'https://nominatim.openstreetmap.org/reverse?lat=22.3&lon=114.1',
  ])('allows the published data endpoint %s', value => expect(safeProviderUrl(value)).toBeDefined());
  it.each([
    'http://data.etabus.gov.hk/v1/transport/kmb/stop/', 'https://127.0.0.1/',
    'https://rt.data.gov.hk.evil.example/v1/transport/mtr/getSchedule.php',
    'https://user:secret@rt.data.gov.hk/v1/transport/mtr/getSchedule.php',
    'https://rt.data.gov.hk:444/v1/transport/mtr/getSchedule.php',
    'https://rt.data.gov.hk/admin', 'https://nominatim.openstreetmap.org/reverse',
    'https://resource.data.one.gov.hk/other.xml',
  ])('rejects unrelated or unsafe targets %s', value => expect(safeProviderUrl(value)).toBeUndefined());
  it('bounds geocoder requests to Hong Kong and six suggestions', () => {
    const url = safeProviderUrl('https://nominatim.openstreetmap.org/search?q=airport&limit=500&countrycodes=us')!;
    expect(url.searchParams.get('limit')).toBe('6'); expect(url.searchParams.has('countrycodes')).toBe(false);
    expect(url.searchParams.get('bounded')).toBe('1'); expect(url.searchParams.get('viewbox')).toBe('113.8,22.6,114.5,22.1');
    expect(providerCacheSeconds(url)).toBe(300);
  });
  it('bounds explicitly scoped Macau geocoding without widening Hong Kong searches', () => {
    const url = safeProviderUrl('https://nominatim.openstreetmap.org/search?q=airport&region=macau&viewbox=0,90,180,0')!;
    expect(url.searchParams.get('viewbox')).toBe('113.51,22.24,113.62,22.09'); expect(url.searchParams.has('region')).toBe(false);
    expect(safeProviderUrl('https://nominatim.openstreetmap.org/reverse?lat=22.17&lon=113.55&region=macau')).toBeDefined();
    expect(safeProviderUrl('https://nominatim.openstreetmap.org/reverse?lat=22.3&lon=114.1&region=macau')).toBeUndefined();
    expect(safeProviderUrl('https://nominatim.openstreetmap.org/search?q=airport&region=elsewhere')).toBeUndefined();
  });
  it('does not follow upstream redirects or forward user credentials', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('', { status: 302, headers: { Location: 'https://example.com' } }));
    const response = await proxyProvider(new Request('https://planner.example/api/upstream?url=' + encodeURIComponent('https://data.etabus.gov.hk/v1/transport/kmb/stop/'),
      { headers: { Authorization: 'private', Cookie: 'private=1' } }), fetcher);
    expect(response.status).toBe(502);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('private');
  });
  it('streams successful provider data with short freshness limits for arrivals', async () => {
    const url = 'https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/001/104';
    const fetcher = vi.fn(async () => Response.json({ data: [] }));
    const response = await proxyProvider(new Request('https://planner.example/api/upstream?url=' + encodeURIComponent(url)), fetcher);
    expect(await response.json()).toEqual({ data: [] }); expect(response.headers.get('cache-control')).toBe('public, max-age=15');
  });
  it('never serves an upstream HTML document on the planner origin', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('<html>unexpected</html>', { headers: { 'Content-Type': 'text/html' } }));
    const response = await proxyProvider(new Request('https://planner.example/api/upstream?url=' + encodeURIComponent('https://data.etabus.gov.hk/v1/transport/kmb/stop/')), fetcher);
    expect(response.status).toBe(502);
  });
});
