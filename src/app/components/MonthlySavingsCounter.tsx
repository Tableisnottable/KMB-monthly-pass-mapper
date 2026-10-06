'use client';

import React from 'react';

interface Leg {
  originStop: string;
  destinationStop: string;
}

interface DemoRoute {
  legs: Leg[];
}

const demoRoutes: DemoRoute[] = [
  {
    legs: [
      { originStop: '荃威花園', destinationStop: '尖沙咀碼頭' }
    ]
  }
];

interface MonthlySavingsCounterProps {
  savingPerTrip?: number;
}

export default function MonthlySavingsCounter({ savingPerTrip = 0 }: MonthlySavingsCounterProps) {
  const stops = demoRoutes.flatMap((route: DemoRoute) =>
    route.legs.flatMap((leg: Leg) => [leg.originStop, leg.destinationStop])
  );

  return (
    <div style={{ padding: '12px', backgroundColor: '#1e1e1e', color: '#fff', borderRadius: '8px' }}>
      <span>覆蓋車站數量: {stops.length}</span>
      {savingPerTrip > 0 ? <span style={{ marginLeft: '12px' }}>每程節省: HK$ {savingPerTrip.toFixed(2)}</span> : null}
    </div>
  );
}
