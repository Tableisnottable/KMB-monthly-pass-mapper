'use client';

import React from 'react';

interface Stop {
  id: string;
  name: string;
}

interface Leg {
  originStop: Stop;
  destinationStop: Stop;
}

interface Route {
  legs: Leg[];
}

const demoRoutes: Route[] = [];

export default function TrafficHeatmap() {
  const stops = Array.from(
    new Map(
      demoRoutes
        .flatMap((route: Route) => route.legs.flatMap((leg: Leg) => [leg.originStop, leg.destinationStop]))
        .map((stop: Stop) => [stop.id, stop])
    ).values()
  );

  return (
    <div style={{ padding: '12px', backgroundColor: '#1e1e1e', color: '#fff', borderRadius: '8px' }}>
      <span>熱力圖車站數: {stops.length}</span>
    </div>
  );
}
