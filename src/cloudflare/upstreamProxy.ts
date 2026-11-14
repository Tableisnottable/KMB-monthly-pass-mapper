const paths: Record<string, RegExp> = {
  'data.etabus.gov.hk': /^\/v1\/transport\/kmb\/(?:route|stop|route-stop|eta|stop-eta)(?:\/|$)/,
  'rt.data.gov.hk': /^\/(?:v2\/transport\/citybus\/(?:route|stop|route-stop|eta|stop-eta)(?:\/|$)|v1\/transport\/mtr\/(?:getSchedule\.php|lrt\/getSchedule)$)/,
  'data.etagmb.gov.hk': /^\/(?:route-stop|eta\/route-stop)\//,
  'resource.data.one.gov.hk': /^\/td\/en\/specialtrafficnews\.xml$/,
  'nominatim.openstreetmap.org': /^\/(?:search|reverse)$/,
  'routing.openstreetmap.de': /^\/(?:routed-foot\/route\/v1\/foot|routed-car\/route\/v1\/driving|routed-bike\/route\/v1\/cycling)\//,
};
export function safeProviderUrl(value: string | null): URL | undefined {
  if (!value || value.length > 4096) return;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
      || !paths[url.hostname]?.test(url.pathname)) return;
    if (url.hostname === 'nominatim.openstreetmap.org') {
      const macau = url.searchParams.get('region') === 'macau';
      if (url.searchParams.has('region') && !macau) return;
      url.searchParams.delete('region');
      if (url.pathname === '/reverse') {
        const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
        if (!url.searchParams.get('lat') || !url.searchParams.get('lon') || !Number.isFinite(lat) || !Number.isFinite(lon)
          || (macau ? lat < 22.09 || lat > 22.24 || lon < 113.51 || lon > 113.62 : lat < 22.1 || lat > 22.6 || lon < 113.8 || lon > 114.5)) return;
        url.searchParams.set('format', 'jsonv2'); url.searchParams.set('zoom', '18');
        return url;
      }
      if (!url.searchParams.get('q') || url.searchParams.get('q')!.length > 180) return;
      // Bound by coordinates: some HK records are indexed under China's code,
      // so forcing countrycodes=hk would silently remove valid local places.
      url.searchParams.delete('countrycodes'); url.searchParams.set('viewbox', macau ? '113.51,22.24,113.62,22.09' : '113.8,22.6,114.5,22.1');
      url.searchParams.set('bounded', '1'); url.searchParams.set('limit', '6');
      url.searchParams.set('format', 'jsonv2');
    }
    return url;
  } catch { return; }
}
export function providerCacheSeconds(url: URL): number {
  if (url.hostname === 'nominatim.openstreetmap.org') return 300;
  if (url.hostname === 'routing.openstreetmap.de') return 86400;
  if (url.hostname === 'resource.data.one.gov.hk') return 60;
  if (/\/(?:stop|route|route-stop)\//.test(url.pathname) && !url.pathname.includes('/eta/')) return 3600;
  return 15;
}
export async function proxyProvider(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET') return Response.json({ error: 'GET required.' }, { status: 405 });
  const url = safeProviderUrl(new URL(request.url).searchParams.get('url'));
  if (!url) return Response.json({ error: 'Unsupported public transport provider URL.' }, { status: 400 });
  try {
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'application/json, application/xml, text/xml', 'User-Agent': 'TransitCompassHK/1.0 (Hong Kong public transport planner)' } });
    if (!response.ok) return Response.json({ error: 'Transport provider unavailable.' }, { status: 502 });
    const contentType = response.headers.get('Content-Type') ?? '';
    if (!/^(?:application\/(?:[\w.+-]*json|xml)|text\/xml)(?:;|$)/i.test(contentType)) {
      return Response.json({ error: 'Unsupported provider response format.' }, { status: 502 });
    }
    return new Response(response.body, { headers: { 'Content-Type': contentType,
      'Cache-Control': `public, max-age=${providerCacheSeconds(url)}`, 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return Response.json({ error: 'Transport provider timed out or could not be reached.' }, { status: 504,
      headers: { 'Cache-Control': 'no-store' } });
  }
}
