export type DepartureType = 'LIVE' | 'SCHEDULED' | 'ADDITIONAL';
export interface DepartureEvidence {
  departureType?: DepartureType;
  status?: 'LIVE' | 'TIMETABLE' | 'UNVERIFIED' | 'NO_UPCOMING';
  remark?: string;
  scheduleMatch?: 'MATCHED' | 'ADDED' | 'UNVERIFIED';
  addedReason?: 'PROVIDER' | 'NOT_IN_TIMETABLE';
}

export const providerMarksAdditional = (remark = '') => /(?:\bextra\b|\badditional\b|加班|加開|加开|特別加)/i.test(remark);
export const providerMarksScheduled = (remark = '') => /(?:\bscheduled\s+(?:bus|departure|service|trip)\b|原定班次|預定班次|预定班次|按時間表|按时间表)/i.test(remark);

/** A provider's scheduled bus is not a vehicle-tracked ETA, even in an ETA feed. */
export function departureType(departure: DepartureEvidence): DepartureType | undefined {
  if (departure.addedReason === 'PROVIDER' || providerMarksAdditional(departure.remark)) return 'ADDITIONAL';
  if (providerMarksScheduled(departure.remark) || departure.departureType === 'SCHEDULED' || departure.status === 'TIMETABLE') return 'SCHEDULED';
  if (departure.scheduleMatch === 'ADDED' || departure.departureType === 'ADDITIONAL') return 'ADDITIONAL';
  if (departure.status === 'UNVERIFIED' || departure.status === 'NO_UPCOMING') return undefined;
  return departure.departureType ?? 'LIVE';
}
