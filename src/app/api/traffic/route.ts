import { NextResponse } from 'next/server';
import { getTrafficNews } from '../../../data/officialTrafficNews';
import { trafficFeedForCategory } from '../../../data/trafficNoticeCategories';

export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json(trafficFeedForCategory(await getTrafficNews(), 'ROAD'), { headers: { 'Cache-Control': 'no-store' } });
}
