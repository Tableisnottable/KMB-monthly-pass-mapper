'use client';

import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import { getMonthlyPassInsight } from '../../domain/monthlyPass';
import { PlannerIcon } from './PlannerIcon';
import { copy, routeColor, type PlannerLocale } from './plannerUi';

export function RouteDetails({ route, locale }: { route: ScoredRoute; locale: PlannerLocale }) {
  const insight = getMonthlyPassInsight(route);
  const walkOnly = route.legs.every(leg => leg.mode === 'WALK');
  const transferWalk = Math.max(0, route.walkTransferTimeMinutes - (route.originWalkMinutes ?? 0) - (route.destinationWalkMinutes ?? 0));
  const items = [
    [copy(locale, '乘車／步行段時間', 'Leg travel time'), route.breakdown.journeyTime],
    [copy(locale, '候車成本', 'Waiting cost'), route.breakdown.scheduledWait],
    [copy(locale, '營辦商調整', 'Operator adjustment'), route.breakdown.operatorAdjustment],
    [copy(locale, '接駁及轉乘步行', 'Access and transfer walking'), route.breakdown.walkTransferTime],
    [copy(locale, '轉乘調整', 'Transfer adjustment'), route.breakdown.transferPenalty],
    [copy(locale, '長距離轉乘調整', 'Long transfer adjustment'), route.breakdown.longDistanceSurcharge],
  ] as const;
  return <div className="route-details">
    <h4>{copy(locale, '逐段行程', 'Your journey, step by step')}</h4>
    <ol className="directions-list">
      {!walkOnly && (route.originWalkMinutes ?? 0) > 0 && <li><span className="step-marker"><PlannerIcon name="walk" size={15} /></span><div><strong>{copy(locale, '步行至上車站', 'Walk to your stop')}</strong><small>{route.legs[0]?.originStop.name} · {route.originWalkMinutes} min</small></div></li>}
      {route.legs.map((leg, index) => <li key={leg.id}>
        <span className="step-marker" style={{ color: routeColor(leg.operator) }}><PlannerIcon name={leg.mode === 'WALK' ? 'walk' : 'bus'} size={16} /></span>
        <div><strong>{leg.mode === 'WALK' ? copy(locale, '步行前往目的地', 'Walk to your destination') : leg.operator + ' · ' + leg.routeNumber}</strong>
          <small>{leg.originStop?.name} → {leg.destinationStop?.name}</small>
          <small>{copy(locale, '約', 'About')} {leg.journeyTimeMinutes} min{leg.serviceEnded ? ' · ' + copy(locale, '暫無班次', 'No upcoming service') : leg.realtimeEta?.isLive ? ' · ' + copy(locale, '即時到站', 'Live arrival') + ' ' + leg.realtimeEta.etaMinutes + ' min' : leg.mode !== 'WALK' ? ' · ' + copy(locale, '班距估算', 'Estimated headway') + ' ' + leg.scheduledIntervalMinutes + ' min' : ''}</small>
          {index < route.legs.length - 1 && <small className="transfer-note">{copy(locale, '在此轉乘；全程轉乘步行約', 'Change here; total transfer walking about')} {transferWalk} min</small>}
        </div>
      </li>)}
      <li><span className="step-marker"><PlannerIcon name="pin" size={16} /></span><div><strong>{copy(locale, '抵達目的地', 'Arrive at your destination')}</strong>{!walkOnly && (route.destinationWalkMinutes ?? 0) > 0 && <small>{copy(locale, '下車後步行', 'Walk after alighting')} {route.destinationWalkMinutes} min</small>}</div></li>
    </ol>
    <details className="score-explanation"><summary>{copy(locale, '為甚麼推薦這條路線？', 'Why this route?')}<span>{route.finalScore.toFixed(1)}</span></summary>
      <p>{copy(locale, '使用現有權重公式，分數越低越優先。分數是比較指標，並非行程分鐘。', 'Your existing weighted formula ranks lower scores first. Scores are a comparison measure, not journey minutes.')}</p>
      <dl>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value > 0 ? '+' : ''}{value.toFixed(2)}</dd></div>)}<div className="score-total"><dt>{copy(locale, '總評分', 'Total score')}</dt><dd>{route.finalScore.toFixed(2)}</dd></div></dl>
      <p>{copy(locale, '候車：即時 ETA，否則以班距 × 0.5 × 時段倍率估算。每次轉乘 +8。', 'Waiting uses live ETA, otherwise headway × 0.5 × time multiplier. Each transfer adds 8.')}</p>
    </details>
    {!walkOnly && <details className="score-explanation"><summary>{copy(locale, '月票分析', 'Monthly pass estimate')}<PlannerIcon name="chevron" size={14} /></summary>
      <p>{insight.coveredLegCount > 0 ? copy(locale, '按現有月票模型，每程估計節省 HK$ ', 'Under the current pass model, estimated saving per trip HK$ ') + insight.savingThisTrip.toFixed(2) : copy(locale, '這條路線沒有月票涵蓋的交通段。', 'No legs on this route are covered by the current pass model.')}</p>
      {insight.breakEvenTrips && <p>{copy(locale, '月票 HK$ ', 'Pass HK$ ') + insight.passPrice + copy(locale, ' · 約 ', ' · about ') + insight.breakEvenTrips + copy(locale, ' 程回本', ' trips to break even')}</p>}
      <p>{copy(locale, '票價、轉乘優惠及月票涵蓋屬原型估算，請向營辦商核實。', 'Fares, interchange discounts and pass coverage are prototype estimates. Confirm with the operator.')}</p>
    </details>}
  </div>;
}
