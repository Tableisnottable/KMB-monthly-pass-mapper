import { proxyProvider } from '../../../cloudflare/upstreamProxy';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return proxyProvider(request); }
