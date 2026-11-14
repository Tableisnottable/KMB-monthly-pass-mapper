import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import { copy, type PlannerLocale } from './plannerUi';
import { groupFareLabel, groupPassFareLabel, groupStudentFareLabel } from './journeyGroups';
import { getMonthlyPassInsight } from '../../domain/monthlyPass';
import { journeyFare, type FareProfile } from '../../domain/journeyFares';

export function FareComparison({ routes, locale, profile = 'adult', selectedLabel }: { routes: ScoredRoute[]; locale: PlannerLocale; profile?: FareProfile; selectedLabel?: string }) {
  const group = { id: 'fare-comparison', routes };
  const conditional = profile === 'pass' && routes.some(route => getMonthlyPassInsight(route).operatorDependent);
  const studentFallback = profile === 'student' && routes.some(route => journeyFare(route, 'student').adultFallback);
  const selectedFare = profile === 'adult' ? groupFareLabel(group, locale) : profile === 'pass' ? groupPassFareLabel(group, locale) : profile === 'student' ? groupStudentFareLabel(group, locale) : copy(locale, '票價未核實', 'Fare unverified');
  return <span className="fare-comparison">
    <span><span>{copy(locale, '普通成人（無月票）', 'Normal adult (without pass)')}</span><strong>{groupFareLabel(group, locale)}</strong></span>
    <span className="fare-selected"><span>{copy(locale, '所選：', 'Selected: ')}{selectedLabel ?? (profile === 'pass' ? copy(locale, '九巴月票', 'KMB pass') : profile === 'student' ? copy(locale, '學生', 'Student') : profile === 'adult' ? copy(locale, '成人八達通', 'Adult Octopus') : copy(locale, '其他付款', 'Other payment'))}{studentFallback ? '*' : ''}</span><strong>{selectedFare}</strong></span>
    {studentFallback && <small>{copy(locale, '*未核實學生優惠的路段採成人價', '*Adult fare used on legs without a verified student discount')}</small>}
    {conditional && <small>{copy(locale, '聯營班次：月票價視乎實際營辦商', 'Joint service: pass fare depends on the bus company')}</small>}
  </span>;
}
