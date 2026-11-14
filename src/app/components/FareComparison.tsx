import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import { copy, type PlannerLocale } from './plannerUi';
import { groupFareLabel, groupPassFareLabel } from './journeyGroups';
import { getMonthlyPassInsight } from '../../domain/monthlyPass';

export function FareComparison({ routes, locale }: { routes: ScoredRoute[]; locale: PlannerLocale }) {
  const group = { id: 'fare-comparison', routes };
  const conditional = routes.some(route => getMonthlyPassInsight(route).operatorDependent);
  return <span className="fare-comparison">
    <span><span>{copy(locale, '無月票', 'Without pass')}</span><strong>{groupFareLabel(group, locale)}</strong></span>
    <span><span>{copy(locale, '使用九巴月票', 'With KMB pass')}</span><strong>{groupPassFareLabel(group, locale)}</strong></span>
    {conditional && <small>{copy(locale, '聯營班次：月票價視乎實際營辦商', 'Joint service: pass fare depends on the bus company')}</small>}
  </span>;
}
