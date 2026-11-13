import { NextResponse } from 'next/server';
import { getTrafficNews } from '../../../data/officialTrafficNews';

export const dynamic = 'force-dynamic';
export async function GET() {
  const feed = await getTrafficNews();
  return NextResponse.json({ ...feed, data: feed.data.filter(item => item.publicTransport) },
    { headers: { 'Cache-Control': 'no-store' } });
}
