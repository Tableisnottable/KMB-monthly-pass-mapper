'use client';

import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';

interface TrafficHeatmapProps {
  routes?: ScoredRoute[];
}

/**
 * Counts the distinct stops covered by the current journey results.
 * Used as the foundation for a future per-stop heat layer.
 */
export default function TrafficHeatmap({ routes = [] }: TrafficHeatmapProps) {
  const stops = Array.from(
    new Map(
      routes
        .flatMap((route: ScoredRoute) =>
          route.legs.flatMap((leg) => {
            const list = [];
            if (leg.originStop) list.push(leg.originStop);
            if (leg.destinationStop) list.push(leg.destinationStop);
            return list;
          }),
        )
        .map((stop) => [stop.id, stop])
    ).values()
  );

  return (
    <div style={{ padding: '12px', backgroundColor: '#1e1e1e', color: '#fff', borderRadius: '8px' }}>
      <span>熱力圖車站數: {stops.length}</span>
    </div>
  );
}
