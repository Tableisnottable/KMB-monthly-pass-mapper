interface DepartureIdentity {
  id: string;
  operator: string;
  networkOperator?: string;
  mode: string;
  routeId: string;
  patternId: string;
  stopId: string;
  destination: string;
}

/** Group only the same joint route, boarding stop and directional service. */
export function groupStationDepartures<T extends DepartureIdentity>(departures: T[]) {
  const groups: { id: string; first: T; rows: T[]; jointOperator?: string }[] = [];
  const byService = new Map<string, typeof groups[number]>();
  for (const row of departures) {
    const operator = row.networkOperator ?? row.operator;
    const joint = row.mode === 'BUS' && operator.includes('+');
    const key = joint ? JSON.stringify([operator, row.routeId, row.patternId, row.stopId, row.destination]) : row.id;
    const existing = joint ? byService.get(key) : undefined;
    if (existing) existing.rows.push(row);
    else {
      const group = { id: key, first: row, rows: [row], jointOperator: joint ? operator : undefined };
      groups.push(group);
      if (joint) byService.set(key, group);
    }
  }
  return groups;
}
