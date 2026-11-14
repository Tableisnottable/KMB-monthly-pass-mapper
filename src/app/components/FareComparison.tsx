import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import { copy, type PlannerLocale } from './plannerUi';
import { groupFareLabel, groupPassFareLabel, groupStudentFareLabel } from './journeyGroups';
import { getMonthlyPassInsight } from '../../domain/monthlyPass';
import { journeyFare, type FareProfile } from '../../domain/journeyFares';

export function FareComparison({ routes, locale, profile = 'adult' }: { routes: ScoredRoute[]; locale: PlannerLocale; profile?: FareProfile }) {
  const group = { id: 'fare-comparison', routes };
  const conditional = routes.some(route => getMonthlyPassInsight(route).operatorDependent);
  const studentFallback = routes.some(route => journeyFare(route, 'student').adultFallback);
  return <span className="fare-comparison">
    <span className={profile === 'adult' ? 'fare-selected' : ''}><span>{copy(locale, '普通成人（無月票）', 'Normal adult (without pass)')}</span><strong>{groupFareLabel(group, locale)}</strong></span>
    <span className={profile === 'pass' ? 'fare-selected' : ''}><span>{copy(locale, '使用九巴月票', 'With KMB pass')}</span><strong>{groupPassFareLabel(group, locale)}</strong></span>
    <span className={profile === 'student' ? 'fare-selected' : ''}><span>{copy(locale, '學生', 'Student')}{studentFallback ? '*' : ''}</span><strong>{groupStudentFareLabel(group, locale)}</strong></span>
    {studentFallback && <small>{copy(locale, '*未核實學生優惠的路段採成人價', '*Adult fare used on legs without a verified student discount')}</small>}
    {conditional && <small>{copy(locale, '聯營班次：月票價視乎實際營辦商', 'Joint service: pass fare depends on the bus company')}</small>}
  </span>;
}
