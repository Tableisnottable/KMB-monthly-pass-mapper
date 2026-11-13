import { NextResponse } from 'next/server';
import { getTrafficSourceCatalog } from '../../../data/hkTrafficSources';
import coverage from '../../../data/transport/manifest.json';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json(
    {
      sources: getTrafficSourceCatalog(),
      coverage,
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
