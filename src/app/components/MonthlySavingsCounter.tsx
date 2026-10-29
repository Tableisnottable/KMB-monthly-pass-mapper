'use client';

import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';

interface MonthlySavingsCounterProps {
  savingPerTrip?: number;
  routes?: ScoredRoute[];
}

/**
 * Shows the number of distinct stops covered by the current journey
 * results and the per-trip saving of the KMB monthly pass for the
 * selected route. Falls back to a dash when no results are present.
 */
export default function MonthlySavingsCounter({ savingPerTrip = 0, routes = [] }: MonthlySavingsCounterProps) {
  const stops = Array.from(
    new Set(
      routes.flatMap((route) =>
        route.legs.flatMap((leg) => {
          const names: string[] = [];
          if (leg.originStop?.name) names.push(leg.originStop.name);
          if (leg.destinationStop?.name) names.push(leg.destinationStop.name);
          return names;
        }),
      ),
    ),
  );

  return (
    <div style={{ padding: '12px', backgroundColor: '#1e1e1e', color: '#fff', borderRadius: '8px' }}>
      <span>覆蓋車站數量: {stops.length > 0 ? stops.length : '—'}</span>
      {savingPerTrip > 0 ? <span style={{ marginLeft: '12px' }}>每程節省: HK$ {savingPerTrip.toFixed(2)}</span> : null}
    </div>
  );
}
