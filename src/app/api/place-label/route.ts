import { NextRequest, NextResponse } from 'next/server';
import { nearbyNetworkStops } from '../../../engine/multimodalJourney';
import { networkStops } from '../../../data/transportNetwork';
import { getRateLimiter } from '../../../lib/cloudflare';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams, lat = Number(p.get('lat')), lng = Number(p.get('lon')), english = p.get('lang') === 'en';
  if (!p.get('lat') || !p.get('lon') || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 22.1 || lat > 22.6 || lng < 113.8 || lng > 114.5) {
    return NextResponse.json({ error: 'Valid Hong Kong coordinates are required.' }, { status: 400 });
  }
  const limiter = await getRateLimiter();
  if (limiter && !(await limiter.limit({ key: 'place-label:' + (request.headers.get('cf-connecting-ip') ?? 'unknown') })).success) return NextResponse.json({ error: 'Please try again shortly.' }, { status: 429 });
  const nearby = nearbyNetworkStops({ lat, lng }, .6)[0];
  const stop = nearby ? networkStops[nearby.index] : undefined;
  let name = stop ? (english ? 'Near ' : '近') + (stop[english ? 2 : 1] || stop[2]) : english ? 'Selected map location' : '地圖所選位置';
  let address = stop ? (english ? 'Near a public transport stop; approximate address.' : '鄰近公共交通站點；地址為概略位置。') : '';
  try {
    const query = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2', zoom: '18', 'accept-language': english ? 'en' : 'zh-Hant,en' });
    const response = await fetch('https://nominatim.openstreetmap.org/reverse?' + query, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'TransitCompassHK/1.0', Accept: 'application/json' } });
    if (response.ok) {
      const data = await response.json() as { name?: string; display_name?: string; address?: Record<string, string> };
      const a = data.address ?? {};
      name = data.name || [a.house_number, a.road || a.pedestrian].filter(Boolean).join(' ') || a.neighbourhood || a.suburb || a.quarter || name;
      address = data.display_name || address;
    }
  } catch { /* A nearby stop name remains useful when reverse lookup is offline. */ }
  return NextResponse.json({ name, address }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
