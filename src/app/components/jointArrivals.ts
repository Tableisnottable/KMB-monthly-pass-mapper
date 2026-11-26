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

/** Group departures only for the same route, boarding stop and directional service. */
export function groupStationDepartures<T extends DepartureIdentity>(departures: T[]) {
  const groups: { id: string; first: T; rows: T[]; jointOperator?: string }[] = [];
  const byService = new Map<string, typeof groups[number]>();
  for (const row of departures) {
    const operator = row.networkOperator ?? row.operator;
    const joint = row.mode === 'BUS' && operator.includes('+');
    const key = JSON.stringify([operator, row.mode, row.routeId, row.patternId, row.stopId, row.destination]);
    const existing = byService.get(key);
    if (existing) existing.rows.push(row);
    else {
      const group = { id: key, first: row, rows: [row], jointOperator: joint ? operator : undefined };
      groups.push(group);
      byService.set(key, group);
    }
  }
  return groups;
}

/** Status badges already convey these stock provider remarks. Keep useful notices. */
export function arrivalRemark(remark = ''): string {
  return remark.split(/[·;|]/).map(part => part.trim()).filter(part => part
    && !/^(?:scheduled (?:bus|departure|service|trip)|原定班次|預定班次|预定班次|additional (?:bus|departure)|extra (?:bus|departure)|加班車|加班车|加班|班次調整|特別班次|特别班次|特別車|特别车|special (?:bus|trip|departure|service))$/i.test(part)).join(' · ');
}
