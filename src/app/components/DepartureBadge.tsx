import { departureTimingType, departureType, providerMarksAdditional, type DepartureEvidence } from '../../domain/departureType';
import { copy, type PlannerLocale } from './plannerUi';

/** Timing source and exceptional service status are independent. */
export function DepartureBadge({ departure, locale, showTiming = true }: { departure?: DepartureEvidence; locale: PlannerLocale; compact?: boolean; showTiming?: boolean }) {
  if (!departure) return null;
  const type = departureType(departure), timing = departureTimingType(departure);
  const service = type === 'ADDITIONAL' || type === 'CANCELLED' || type === 'MISSED' ? type : undefined;
  const inferred = service === 'ADDITIONAL' && departure.addedReason !== 'PROVIDER' && !providerMarksAdditional(departure.remark);
  if (!service && (!showTiming || !timing)) return null;
  return <span className="departure-badges">
    {showTiming && timing && <span className={'departure-type departure-' + timing.toLowerCase()} data-departure-type={timing}
      title={timing === 'LIVE' ? copy(locale, '營辦商即時預測，並非車輛 GPS 確認。', 'Operator live prediction, not a GPS confirmation.')
        : copy(locale, '時間表估算，並非即時預測。', 'Timetable estimate, not an operator live prediction.')}>
      {timing === 'LIVE' ? copy(locale, '即時', 'Live') : copy(locale, '原定班次', 'Scheduled')}
    </span>}
    {service && <span className={'departure-type departure-' + service.toLowerCase()} data-departure-type={service}
      title={inferred ? copy(locale, '同時段預測班數多於時間表，或總站原定時間不符；可能為額外班次，未獲營辦商確認。', 'More predicted trips than timetable slots in the same window, or a terminal scheduled-time mismatch. Possible extra; not operator-confirmed.')
        : copy(locale, '營辦商明確提供的班次狀態。', 'Service status explicitly supplied by the operator.')}>
      {service === 'ADDITIONAL' ? copy(locale, '加班', 'Additional') + (inferred ? '?' : '') : service === 'MISSED' ? copy(locale, '脫班', 'Missed') : copy(locale, '取消', 'Cancelled')}
    </span>}
  </span>;
}
export function DepartureLegend({ locale }: { locale: PlannerLocale }) {
  return <div className="departure-legend" aria-label={copy(locale, '班次類型', 'Departure types')}>
    <DepartureBadge departure={{ status: 'LIVE' }} locale={locale} />
    <DepartureBadge departure={{ status: 'TIMETABLE' }} locale={locale} />
    <DepartureBadge departure={{ scheduleMatch: 'ADDED', addedReason: 'PROVIDER' }} locale={locale} showTiming={false} />
    <DepartureBadge departure={{ departureType: 'CANCELLED' }} locale={locale} showTiming={false} />
    <DepartureBadge departure={{ departureType: 'MISSED' }} locale={locale} showTiming={false} />
  </div>;
}
