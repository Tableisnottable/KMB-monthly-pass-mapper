import type { DepartureEvidence, TimetableComparison } from '../../domain/departureType';
import { hongKongTimeLabel } from '../../engine/journeyTime';
import { copy, type PlannerLocale } from './plannerUi';

/** Comparisons are references, never a claim that two feed rows are one trip. */
export function TimetableDifference({ departure, locale, compact = false }: { departure: TimetableComparison & Pick<DepartureEvidence, 'changedReason'> & { time?: string }; locale: PlannerLocale; compact?: boolean }) {
  const delta = departure.deviationMinutes;
  if (compact && (!departure.timetableTime || delta === undefined || !Number.isFinite(delta) || Math.abs(delta) < .5)) return null;
  if (!departure.timetableTime || delta === undefined || !Number.isFinite(delta)) return <small className="timetable-difference comparison-unknown">{copy(locale, '時間表差異：未能核實', 'Schedule difference unavailable')}</small>;
  const direction = Math.abs(delta) < .5 ? 'same' : delta > 0 ? 'late' : 'early';
  const label = direction === 'same' ? copy(locale, '與參考時間相同', 'Matches reference time')
    : copy(locale, delta > 0 ? '較時間表遲約 ' : '較時間表早約 ', delta > 0 ? 'About ' : 'About ') + Math.abs(Math.round(delta)) + copy(locale, ' 分鐘', delta > 0 ? ' min later' : ' min earlier');
  return <small className={'timetable-difference comparison-' + direction} title={copy(locale, '與最近的時間表參考時間比較，並非同一班車的確認延誤／提早。頻率班次按班距推算；中途站時間經插值。加班車未必有原定開車時間。', 'Compared with the nearest timetable reference, not a confirmed delay/early departure of an identified trip. Frequency times are derived from headways; intermediate times are interpolated. Extras may have no original scheduled departure.')}>
    {compact ? <>{hongKongTimeLabel(departure.timetableTime)} {departure.changedReason && departure.time ? <>→ {hongKongTimeLabel(departure.time)}</> : copy(locale, '參考', 'ref.')} · {delta > 0 ? '+' : '−'}{Math.abs(Math.round(delta))}{copy(locale, '分', ' min')}{departure.changedReason === 'POSSIBLE_SHIFT' ? ' ?' : ''}</> : <>{label} · {hongKongTimeLabel(departure.timetableTime)} {copy(locale, '參考（估算）', 'reference (estimated)')}</>}
  </small>;
}
