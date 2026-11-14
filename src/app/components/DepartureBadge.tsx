import { departureType, providerMarksAdditional, type DepartureEvidence, type DepartureType } from '../../domain/departureType';
import { copy, type PlannerLocale } from './plannerUi';

const labels: Record<DepartureType, [string, string]> = {
  LIVE: ['即時', 'Live'], SCHEDULED: ['時間表班次', 'Scheduled · timetable'], ADDITIONAL: ['加班', 'Additional'],
};
export function DepartureBadge({ departure, locale, compact = false }: { departure?: DepartureEvidence; locale: PlannerLocale; compact?: boolean }) {
  if (!departure) return null;
  const type = departureType(departure);
  if (!type) return null;
  const title = type === 'LIVE' ? copy(locale, '營辦商提供的即時到站預測。', 'Live arrival prediction from the operator.')
    : type === 'SCHEDULED' ? copy(locale, '根據時間表的班次／時間估算，並非即時車輛追蹤。', 'Departure or estimate based on a timetable, not live vehicle tracking.')
      : departure.addedReason === 'PROVIDER' || providerMarksAdditional(departure.remark) ? copy(locale, '營辦商標示為加開班次。', 'The operator identifies this as an additional departure.')
        : copy(locale, '即時班次未列於已匯入時間表時段；可能是加班、延誤或資料更新，並非已確認加班。', 'Live departure outside imported timetable windows; it may be an extra trip, a delay or a timetable update, rather than a confirmed extra.');
  return <span className={'departure-type departure-' + type.toLowerCase()} data-departure-type={type} title={title}>{compact && type === 'SCHEDULED' && locale === 'en' ? 'Scheduled' : copy(locale, ...labels[type])}</span>;
}
export function DepartureLegend({ locale }: { locale: PlannerLocale }) {
  return <div className="departure-legend" aria-label={copy(locale, '班次類型', 'Departure types')}>
    <DepartureBadge departure={{ status: 'LIVE' }} locale={locale} />
    <DepartureBadge departure={{ status: 'TIMETABLE' }} locale={locale} />
    <DepartureBadge departure={{ scheduleMatch: 'ADDED', addedReason: 'PROVIDER' }} locale={locale} />
  </div>;
}
