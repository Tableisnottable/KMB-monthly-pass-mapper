export type DepartureType = 'LIVE' | 'SCHEDULED' | 'ADDITIONAL' | 'CHANGED' | 'CANCELLED' | 'MISSED';
export type DepartureTimingType = 'LIVE' | 'SCHEDULED';
export interface TimetableComparison {
  timetableTime?: string;
  deviationMinutes?: number;
  comparisonBasis?: 'FIXED' | 'FREQUENCY' | 'INTERPOLATED';
}
export interface DepartureEvidence {
  departureType?: DepartureType;
  /** Prediction source is independent of an additional/changed service. */
  timingType?: DepartureTimingType;
  status?: 'LIVE' | 'TIMETABLE' | 'UNVERIFIED' | 'NO_UPCOMING';
  remark?: string;
  scheduleMatch?: 'MATCHED' | 'ADDED' | 'UNVERIFIED';
  addedReason?: 'PROVIDER' | 'NOT_IN_TIMETABLE';
  changedReason?: 'PROVIDER' | 'OBSERVED_SPACING' | 'POSSIBLE_SHIFT';
  /** Generated from the published timetable, not returned by an ETA provider. */
  timetableEstimate?: boolean;
  projectedArrival?: boolean;
}

export const providerMarksAdditional = (remark = '') => /(?:\bextra\b|\badditional\b|加班|加開|加开|特別加)/i.test(remark);
export const providerMarksScheduled = (remark = '') => /(?:\bscheduled\s+(?:bus|departure|service|trip)\b|原定班次|預定班次|预定班次|按時間表|按时间表)/i.test(remark);
export const providerMarksChanged = (remark = '') => /(?:\brescheduled\b|\brevised\s+(?:timetable|departure|service)\b|班次調整|調整班次|更改班次)/i.test(remark);
export const providerMarksCancelled = (remark = '') => /(?:\bcancell?ed\b|班次取消|取消班次|已取消|暫停服務|暂停服务)/i.test(remark);

export const providerMarksMissed = (remark = '') => /(?:脫班|脱班|\bmissed\s+(?:trip|departure|service)\b|\btrip\s+not\s+operated\b)/i.test(remark);
export const isNonOperatingDeparture = (departure: DepartureEvidence) => departure.departureType === 'CANCELLED' || departure.departureType === 'MISSED' || providerMarksCancelled(departure.remark) || providerMarksMissed(departure.remark);

export function departureTimingType(departure: DepartureEvidence): DepartureTimingType | undefined {
  if (isNonOperatingDeparture(departure)) return undefined;
  if (departure.timingType) return departure.timingType;
  if (providerMarksScheduled(departure.remark) || departure.departureType === 'SCHEDULED' || departure.status === 'TIMETABLE') return 'SCHEDULED';
  if (departure.status === 'UNVERIFIED' || departure.status === 'NO_UPCOMING') return undefined;
  return 'LIVE';
}

/** A provider's scheduled bus is not a vehicle-tracked ETA, even in an ETA feed. */
export function departureType(departure: DepartureEvidence): DepartureType | undefined {
  if (departure.departureType === 'CANCELLED' || providerMarksCancelled(departure.remark)) return 'CANCELLED';
  if (departure.departureType === 'MISSED' || providerMarksMissed(departure.remark)) return 'MISSED';
  if (departure.addedReason === 'PROVIDER' || providerMarksAdditional(departure.remark)) return 'ADDITIONAL';
  if (departure.departureType === 'CHANGED' || departure.changedReason || providerMarksChanged(departure.remark)) return 'CHANGED';
  if (departure.scheduleMatch === 'ADDED' || departure.departureType === 'ADDITIONAL') return 'ADDITIONAL';
  if (providerMarksScheduled(departure.remark) || departure.departureType === 'SCHEDULED' || departure.status === 'TIMETABLE') return 'SCHEDULED';
  if (departure.status === 'UNVERIFIED' || departure.status === 'NO_UPCOMING') return undefined;
  return departure.departureType ?? 'LIVE';
}
