import { proxyProvider, safeProviderUrl } from './upstreamProxy';
interface Environment {
  ASSETS: { fetch(request: Request): Promise<Response> };
  RATE_LIMITER?: { limit(value: { key: string }): Promise<{ success: boolean }> };
}
interface Execution { waitUntil(task: Promise<unknown>): void }
type WorkerCache = { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> };
export default {
  async fetch(request: Request, env: Environment, ctx: Execution): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/upstream') {
      if (request.method !== 'GET' || !safeProviderUrl(url.searchParams.get('url'))) return proxyProvider(request);
      if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: 'provider:' + (request.headers.get('cf-connecting-ip') ?? 'unknown') })).success) {
        return Response.json({ error: 'Too many provider requests. Please try again shortly.' },
          { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
      }
      const cache = (caches as unknown as { default: WorkerCache }).default;
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await proxyProvider(request);
      if (response.ok) ctx.waitUntil(cache.put(request, response.clone()).catch(() => undefined));
      return response;
    }
    if (url.pathname === '/api/sources') {
      url.pathname = '/api/sources.json'; return env.ASSETS.fetch(new Request(url, request));
    }
    if (url.pathname.startsWith('/api/')) return Response.json({ error: 'Transport calculations run in the browser background worker. Open the planner to search.',
      code: 'BROWSER_COMPUTATION', planner: '/' }, { status: 409 });
    return env.ASSETS.fetch(request);
  },
};
