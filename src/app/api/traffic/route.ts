import { NextResponse } from 'next/server';
import { getTrafficNews } from '../../../data/officialTrafficNews';

export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json(await getTrafficNews(), { headers: { 'Cache-Control': 'no-store' } });
}
