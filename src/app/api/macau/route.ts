import { NextRequest, NextResponse } from 'next/server';
import { getRateLimiter } from '../../../lib/cloudflare';
import { inMacau, macauOperators, type MacauPayment } from '../../../domain/macau';
import { macauCoverage, macauPatterns, macauPatternById } from '../../../data/macau/network';
import { findMacauPlaces } from '../../../data/macau/placeSearch';
import { macauGeometry } from '../../../data/macau/geometry';
import { routeOnStreets } from '../../../data/streetRouting';
import { findMacauJourneys } from '../../../engine/macauJourney';
import { parseJourneyLimits } from '../../../domain/journeyLimits';
import { parseRouteWeights } from '../../../engine/routeWeights';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams, resource = p.get('resource') ?? 'routes', locale = p.get('lang') === 'en' ? 'en' : 'zh';
  const limiter = await getRateLimiter();
  if (limiter && !(await limiter.limit({ key: 'macau:' + (request.headers.get('cf-connecting-ip') ?? 'unknown') })).success)
    return NextResponse.json({ error: 'Please try again shortly.' }, { status: 429 });
  try {
    if (Array.from(p.keys()).some(key => p.getAll(key).length > 1)) throw new Error('Duplicate query parameter.');
    if (resource === 'routes') {
      const q = (p.get('q') ?? '').trim().toLowerCase();
      if (q.length > 120) throw new Error('Search too long.');
      return NextResponse.json({ data: macauPatterns.filter(row => !q || [row.number, row.nameTc, row.nameEn, row.stops[0][1], row.stops.at(-1)![1]].join(' ').toLowerCase().includes(q))
        .map(({ paths, stops, ...row }) => ({ ...row, stops: [stops[0], stops.at(-1)], stopCount: stops.length })), coverage: macauCoverage });
    }
    if (resource === 'route') {
      const row = macauPatternById.get(p.get('id') ?? '');
      if (!row) throw new Error('Unknown Macau route.');
      return NextResponse.json({ data: row });
    }
    if (resource === 'places') {
      const q = (p.get('q') ?? '').trim();
      if (q.length < 2 || q.length > 120) return NextResponse.json({ data: [] });
      const local = findMacauPlaces(q, locale);
      if (p.get('scope') === 'local') return NextResponse.json({ data: local });
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.search = new URLSearchParams({ q: q + ', Macao', format: 'jsonv2', viewbox: '113.51,22.24,113.62,22.09', bounded: '1', limit: '6', 'accept-language': locale === 'en' ? 'en' : 'zh-TW', region: 'macau' }).toString();
      try {
        const response = await fetch(url, { headers: { 'User-Agent': 'TransitCompass/2.0 (Macao place search)', Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw new Error('Geocoder unavailable');
        const rows = await response.json() as { place_id: number; display_name: string; lat: string; lon: string; type: string }[];
        const online = rows.filter(r => inMacau(Number(r.lat), Number(r.lon))).map(r => ({ id: 'OSM:' + r.place_id, name: r.display_name.split(',')[0], address: r.display_name,
          lat: Number(r.lat), lng: Number(r.lon), type: r.type, googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}` }));
        return NextResponse.json({ data: [...local.slice(0, 5), ...online].slice(0, 8) });
      } catch { return NextResponse.json({ data: local, meta: { geocoderUnavailable: true } }); }
    }
    if (resource === 'geometry') {
      const legs: unknown = JSON.parse(p.get('legs') ?? '[]');
      if (!Array.isArray(legs) || !legs.length || legs.length > 4) throw new Error('One to four legs required.');
      const data = legs.map(leg => {
        if (!leg || typeof leg !== 'object') throw new Error('Invalid geometry leg.');
        const pattern = macauPatternById.get(leg.id);
        if (!pattern || !Number.isInteger(leg.board) || !Number.isInteger(leg.alight) || leg.board < 0 || leg.alight >= pattern.stops.length || leg.board >= leg.alight) throw new Error('Invalid route interval.');
        return { id: pattern.id, operator: pattern.operator, number: pattern.number, paths: macauGeometry(pattern, leg.board, leg.alight) };
      });
      return NextResponse.json({ data, missing: data.filter(row => !row.paths.length).length });
    }
    if (!['journey', 'street'].includes(resource)) throw new Error('Unknown Macau resource.');
    const raw = ['fromLat', 'fromLon', 'toLat', 'toLon'].map(k => p.get(k));
    const v = raw.map(Number);
    if (raw.some(n => !n?.trim()) || !inMacau(v[0], v[1]) || !inMacau(v[2], v[3])) throw new Error('Choose two points within Macau. Hong Kong–Macau cross-border routing is not available.');
    const from = { lat: v[0], lng: v[1] }, to = { lat: v[2], lng: v[3] };
    if (resource === 'street') {
      const mode = p.get('mode') ?? 'walk';
      if (!['walk', 'cycle', 'drive', 'taxi'].includes(mode)) throw new Error('Invalid street mode.');
      const geometry = await routeOnStreets([[from.lat, from.lng], [to.lat, to.lng]], mode === 'walk' ? 'foot' : mode === 'cycle' ? 'bike' : 'car');
      return NextResponse.json({ data: { ...geometry, mode, minutes: geometry.durationSeconds === undefined ? null : Math.ceil(geometry.durationSeconds / 60),
        // Hong Kong taxi tariffs must never leak into Macau results.
        fare: mode === 'walk' || mode === 'cycle' ? 0 : null, currency: 'MOP' } });
    }
    const time = p.get('time') ? new Date(p.get('time')!) : new Date();
    if (!Number.isFinite(time.getTime())) throw new Error('Invalid journey date.');
    const timeMode = p.get('timeMode') ?? 'depart';
    if (!['depart', 'arrive'].includes(timeMode)) throw new Error('Invalid time mode.');
    const list = (key: string) => {
      if (!p.has(key)) return undefined;
      const ids = p.get(key)!.split(',').filter(Boolean);
      if (ids.some(id => !macauOperators.some(op => op.id === id))) throw new Error('Invalid Macau company.');
      return Array.from(new Set(ids));
    };
    const payment = p.get('payment') ?? 'cash';
    if (!['cash', 'macau-pass', 'student'].includes(payment)) throw new Error('Invalid payment type.');
    if (p.has('busEstimates') && !['true', 'false'].includes(p.get('busEstimates')!)) throw new Error('Invalid estimate option.');
    const change = p.has('changeMinutes') ? Number(p.get('changeMinutes')) : 5;
    if (!Number.isInteger(change) || change < 0 || change > 60) throw new Error('Change time must be 0–60 minutes.');
    const operators = list('operators'), requiredOperators = list('requiredOperators');
    if (requiredOperators?.some(id => operators && !operators.includes(id))) throw new Error('A company cannot be both required and banned.');
    const data = findMacauJourneys(from, to, time, locale, timeMode === 'arrive', { includeBusEstimates: p.get('busEstimates') === 'true',
      operators, requiredOperators, payment: payment as MacauPayment, changeMinutes: change, weights: parseRouteWeights(p.get('weights')), limits: parseJourneyLimits(p.get('limits')) });
    return NextResponse.json({ data, meta: { city: 'macau', currency: 'MOP', live: false, busEstimates: p.get('busEstimates') === 'true', coverage: macauCoverage } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Macau query.' }, { status: 400 }); }
}
