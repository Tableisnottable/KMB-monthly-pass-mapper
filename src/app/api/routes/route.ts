import { NextResponse } from 'next/server';
import { Route } from '../../../engine/UpgradedScoringEngine';

const mockApiRoutes: Route[] = [
  {
    id: 'api-kmb-1',
    segments: [{ operator: 'KMB', routeName: '234X', rideTimeMinutes: 35 }]
  }
];

function getMonthlyPassInsight(route: Route) {
  const hasKmb = (route.segments ?? route.legs ?? []).some(s => s.operator === 'KMB');
  return hasKmb ? '100% 適用九巴月票' : '按程收費';
}

export async function GET() {
  return NextResponse.json({
    data: mockApiRoutes.map((route: Route) => ({
      ...route,
      monthlyPass: getMonthlyPassInsight(route),
    }))
  });
}
