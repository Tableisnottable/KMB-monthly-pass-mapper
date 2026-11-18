import { NextRequest, NextResponse } from 'next/server';
import { getRateLimiter } from '../../../lib/cloudflare';
import { getStaticCitybusStops } from '../../../data/citybusStopsStatic';
import { findTransitPlaces, isAirportQuery } from '../../../data/transitPlaceSearch';
import { findNetworkPlaces } from '../../../data/networkPlaceSearch';
import { findGovernmentPlaces } from '../../../data/governmentPlaceSearch';
import { findSchoolPlaces } from '../../../data/schoolPlaceSearch';

export const dynamic = 'force-dynamic';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
}

export async function GET(request: NextRequest) {
  const rateLimiter = await getRateLimiter();
  const ipAddress = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (rateLimiter) {
    const result = await rateLimiter.limit({ key: `places:${ipAddress}` });
    if (!result.success) {
      return NextResponse.json({ error: 'Too many place searches.' }, { status: 429 });
    }
  }
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (query.length < 2 || query.length > 120) {
    return NextResponse.json({ data: [] });
  }

  const schools = findSchoolPlaces(query);
  const transitPlaces = [...findTransitPlaces(query, getStaticCitybusStops()), ...findNetworkPlaces(query)];
  const localPlaces = [...schools.places, ...transitPlaces];
  const cacheHeaders = { 'Cache-Control': 'public, max-age=300, s-maxage=300' };
  // Exact official names/initials do not depend on a geocoder recognising an acronym.
  if (schools.exact) return NextResponse.json({ data: schools.places, meta: { provider: 'Education Bureau school directory', region: 'HK' } }, { headers: cacheHeaders });
  function transitFallback() {
    return localPlaces.length > 0
      ? NextResponse.json({ data: localPlaces.slice(0, 6), meta: { provider: 'HK public transport / Education Bureau catalogue', geocoderUnavailable: true } }, { headers: cacheHeaders })
      : NextResponse.json({ error: 'Place search temporarily unavailable.' }, { status: 502 });
  }
  if (request.nextUrl.searchParams.get('scope') === 'local') {
    return NextResponse.json({ data: localPlaces.filter((place, index, all) => all.findIndex(other => other.id === place.id) === index).slice(0, 6),
      meta: { provider: 'HK public transport / Education Bureau catalogue', localOnly: true } }, { headers: cacheHeaders });
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', `${query}, Hong Kong`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '6');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', request.nextUrl.searchParams.get('lang') === 'en' ? 'en,zh-Hant' : 'zh-Hant,en');

  try {
    // Government building/address coverage is broader than the transport catalogue.
    // A failure falls back to OSM and local records; one provider never erases another.
    const official = await findGovernmentPlaces(query).catch(() => []);
    if (official.length && !isAirportQuery(query)) {
      const candidates = [...official.slice(0, 5), ...localPlaces, ...official.slice(5)];
      return NextResponse.json({ data: candidates.filter((place, index, all) => all.findIndex(other => other.id === place.id) === index).slice(0, 8),
        meta: { provider: 'Lands Department Location Search', region: 'HK' } }, { headers: cacheHeaders });
    }
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'TransitCompassHK/1.0 (place search)',
      },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return transitFallback();
    }

    const results = (await response.json()) as NominatimResult[];
    const geocodedPlaces = results.filter(result => Number.isFinite(Number(result.lat)) && Number.isFinite(Number(result.lon))
      && Number(result.lat) >= 22.1 && Number(result.lat) <= 22.6 && Number(result.lon) >= 113.8 && Number(result.lon) <= 114.5).map((result) => ({
        id: String(result.place_id),
        name: result.display_name.split(',')[0],
        address: result.display_name,
        lat: Number(result.lat),
        lng: Number(result.lon),
        type: result.type,
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${result.lat},${result.lon}`,
        )}`,
      }));
    // Keep the original landmark available, but put a usable terminal ahead
    // of the airport polygon's airfield centre for airport searches.
    const suggestions = isAirportQuery(query)
      ? [...transitPlaces, ...geocodedPlaces]
      : [...schools.places.slice(0, 2), ...transitPlaces.filter(p => p.type === 'station').slice(0, 2), ...geocodedPlaces.slice(0, 3), ...localPlaces, ...geocodedPlaces.slice(3)];
    const unique = suggestions.filter((p, i, all) => all.findIndex(other => other.id === p.id) === i);
    return NextResponse.json({
      data: unique.slice(0, 6),
      meta: { provider: 'OpenStreetMap Nominatim', region: 'HK', transitProvider: 'HK public transport catalogue' },
    }, { headers: cacheHeaders });
  } catch {
    return transitFallback();
  }
}
