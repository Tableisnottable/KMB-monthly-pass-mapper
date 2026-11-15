import { departureTimingType, departureType, providerMarksAdditional, type DepartureEvidence, type DepartureType } from '../../domain/departureType';
import { copy, type PlannerLocale } from './plannerUi';

const labels: Record<DepartureType, [string, string]> = {
  LIVE: ['即時', 'Live'], SCHEDULED: ['時間表班次', 'Scheduled · timetable'], ADDITIONAL: ['加班', 'Additional'],
  CHANGED: ['班次調整', 'Changed'],
  CANCELLED: ['取消', 'Cancelled'],
};
export function DepartureBadge({ departure, locale, compact = false, showTiming = true }: { departure?: DepartureEvidence; locale: PlannerLocale; compact?: boolean; showTiming?: boolean }) {
  if (!departure) return null;
  const type = departureType(departure);
  if (!type) return null;
  const title = type === 'LIVE' ? copy(locale, '營辦商提供的即時到站預測；不等於已確認此車開出或正在行駛。', 'Live arrival prediction from the operator; it does not by itself confirm that the vehicle has departed or is moving.')
    : type === 'SCHEDULED' ? copy(locale, '根據時間表的班次／時間估算，並非即時車輛追蹤。', 'Departure or estimate based on a timetable, not live vehicle tracking.')
      : type === 'CANCELLED' ? copy(locale, '營辦商明確標示取消；不會因未出現在到站資料就推斷取消。', 'Explicit cancellation from the provider; never inferred merely because a departure is absent from the feed.')
      : type === 'CHANGED' ? departure.changedReason === 'OBSERVED_SPACING'
        ? copy(locale, '根據至少三個營辦商班次，觀察班距較時間表疏落；屬推斷的班次調整，未獲官方確認，亦可能是資料不完整。', 'At least three provider departures suggest a less frequent pattern than the timetable. This is an inferred change, not an officially confirmed revision; the feed may be incomplete.')
        : departure.changedReason === 'POSSIBLE_SHIFT'
          ? copy(locale, '附近的時間表班次可能改早或改遲，亦可能是加班。沒有班次識別碼，未能確認對應；多個時間可同為候選，並非已確認同一班車。', 'A nearby timetable departure may have moved earlier or later, or this may be an extra. No trip ID confirms the match; multiple times may be candidates, not confirmed replacements of the same trip.')
        : copy(locale, '營辦商資料標示班次已調整。', 'The provider indicates a revised departure or service.')
      : departure.addedReason === 'PROVIDER' || providerMarksAdditional(departure.remark) ? copy(locale, '營辦商標示為加開班次。', 'The operator identifies this as an additional departure.')
        : copy(locale, '營辦商班次未符合已匯入時間表班次或時段；可能是加班、延誤或資料更新，並非已確認加班。', 'Provider departure outside imported timetable slots or windows; it may be an extra trip, a delay or a timetable update, rather than a confirmed extra.');
  const timing = departureTimingType(departure);
  const label = departure.timetableEstimate ? copy(locale, '時間表估算', 'Timetable estimate')
    : type === 'CHANGED' && departure.changedReason === 'POSSIBLE_SHIFT' ? copy(locale, '班次調整?', 'Changed?')
      : compact && type === 'SCHEDULED' ? departure.scheduleMatch === 'MATCHED' ? copy(locale, '時間表內', 'Timetabled') : copy(locale, '預定', 'Scheduled')
        : compact && type === 'ADDITIONAL' && departure.addedReason !== 'PROVIDER' && !providerMarksAdditional(departure.remark) ? copy(locale, '加班?', 'Additional?')
          : copy(locale, ...labels[type]);
  return <span className="departure-badges">{showTiming && timing && !(compact && timing === 'SCHEDULED') && (type === 'ADDITIONAL' || type === 'CHANGED') && <DepartureBadge departure={{ departureType: timing, timingType: timing }} locale={locale} compact={compact} />}
    <span className={'departure-type departure-' + type.toLowerCase()} data-departure-type={type} title={departure.timetableEstimate ? copy(locale, '按已匯入時間表估算；不是營辦商提供的即時預測，班距推算不保證準確開車時間。', 'Estimated from the imported timetable, not an operator live prediction. Headway-derived times are not guaranteed departures.') : title}>{label}{type === 'CHANGED' && departure.changedReason === 'OBSERVED_SPACING' ? copy(locale, ' · 推斷', ' · inferred') : ''}</span>
    {departure.scheduleMatch === 'MATCHED' && !(compact && type === 'SCHEDULED') && type !== 'CANCELLED' && type !== 'CHANGED' && type !== 'ADDITIONAL' && <span className="departure-type departure-timetabled" data-service-type="TIMETABLED" title={copy(locale, '班次符合已匯入時間表的班次或服務時段；不表示準時。', 'Compatible with imported timetable slots or service windows; this does not mean on time.')}>{copy(locale, '時間表內', 'Timetabled')}</span>}</span>;
}
export function DepartureLegend({ locale }: { locale: PlannerLocale }) {
  return <div className="departure-legend" aria-label={copy(locale, '班次類型', 'Departure types')}>
    <DepartureBadge departure={{ status: 'LIVE' }} locale={locale} />
    <DepartureBadge departure={{ status: 'TIMETABLE' }} locale={locale} />
    <DepartureBadge departure={{ scheduleMatch: 'ADDED', addedReason: 'PROVIDER' }} locale={locale} showTiming={false} />
    <DepartureBadge departure={{ departureType: 'CHANGED' }} locale={locale} showTiming={false} />
    <DepartureBadge departure={{ departureType: 'CANCELLED' }} locale={locale} showTiming={false} />
  </div>;
}
