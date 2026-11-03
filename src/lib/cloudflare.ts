import { getCloudflareContext } from '@opennextjs/cloudflare';

export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

declare global {
  interface CloudflareEnv {
    RATE_LIMITER?: RateLimiterBinding;
  }
}

// The OpenNext worker installs this context on the global scope at startup.
// Checking for it first avoids the async path, which under `next start`
// boots wrangler/miniflare and adds ~8s to the first request.
const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for('__cloudflare-context__');

function isCloudflareRuntime(): boolean {
  return CLOUDFLARE_CONTEXT_SYMBOL in globalThis;
}

export async function getRateLimiter(): Promise<RateLimiterBinding | undefined> {
  if (!isCloudflareRuntime()) {
    return undefined;
  }
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env?.RATE_LIMITER;
  } catch {
    // Local Next.js and preview runtimes do not provide Cloudflare bindings.
    return undefined;
  }
}
