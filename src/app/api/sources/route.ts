import { NextResponse } from 'next/server';
import { getTrafficSourceCatalog } from '../../../data/hkTrafficSources';
import coverage from '../../../data/transport/manifest.json';
import alignments from '../../../data/alignments/manifest.json';
import { residentsDirectoryMeta, residentsRoutes } from '../../../data/residentsServices';
import { schoolPlacesMeta } from '../../../data/schoolPlaceSearch';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json(
    {
      sources: getTrafficSourceCatalog(),
      asia: { source: 'OpenStreetMap contributors', license: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright', access: 'Public map extracts; no account, API key or paid feed. Local mapped roads, route segments and stops only; no nationwide journey planning, live arrivals or fares.' },
      coverage,
      alignments,
      schoolPlaces: schoolPlacesMeta,
      residentsDirectory: { ...residentsDirectoryMeta, routeCount: residentsRoutes.length, coverage: 'Official documents; directory-only services excluded from automatic routing.' },
      disclaimer:
        'Source availability and schemas are controlled by the respective providers. Verify official terms before production use.',
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    },
  );
}
