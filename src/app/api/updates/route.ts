import { NextResponse } from 'next/server';
import { getTrafficNews } from '../../../data/officialTrafficNews';
import { trafficFeedForCategory } from '../../../data/trafficNoticeCategories';

export const dynamic = 'force-dynamic';
export async function GET() {
  const feed = await getTrafficNews();
  return NextResponse.json(trafficFeedForCategory(feed, 'BUS'),
    { headers: { 'Cache-Control': 'no-store' } });
}
