'use client';

import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import { getMonthlyPassInsight } from '../../domain/monthlyPass';
import { PlannerIcon } from './PlannerIcon';
import { hongKongTimeLabel } from '../../engine/journeyTime';
import { copy, modeIcon, modeLabel, routeColor, type PlannerLocale } from './plannerUi';

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
    [copy(locale, '成人票價成本', 'Adult fare cost'), route.breakdown.fareCost ?? 0],
    [copy(locale, '服務核實成本', 'Service uncertainty'), route.breakdown.reliabilityPenalty ?? 0],
  ] as const;
  return <div className="route-details">
    <h4>{copy(locale, '逐段行程', 'Your journey, step by step')}</h4>
    {route.departureTime && route.arrivalTime && <p className="journey-clock-summary">{hongKongTimeLabel(route.departureTime)} → {hongKongTimeLabel(route.arrivalTime)} <small>Hong Kong time · {copy(locale, '普通成人', 'Normal adult')}</small></p>}
    <ol className="directions-list">
      {!walkOnly && (route.originWalkMinutes ?? 0) > 0 && <li><span className="step-marker"><PlannerIcon name="walk" size={15} /></span><div><strong>{copy(locale, '步行至上車站', 'Walk to your stop')}</strong><small>{route.legs[0]?.originStop.name} · {route.originWalkMinutes} min</small></div></li>}
      {route.legs.map((leg, index) => <li key={leg.id}>
        <span className="step-marker" style={{ color: routeColor(leg.operator) }}><PlannerIcon name={modeIcon(leg.mode)} size={16} /></span>
        <div><strong>{leg.mode === 'WALK' ? copy(locale, '步行前往目的地', 'Walk to your destination') : leg.operator + ' · ' + (leg.routeNumber || modeLabel(leg.mode, locale))}</strong>
          <small>{leg.originStop?.name} → {leg.destinationStop?.name}</small>
          {leg.departureTime && leg.arrivalTime && <small>{hongKongTimeLabel(leg.departureTime)} → {hongKongTimeLabel(leg.arrivalTime)} HKT</small>}
          {leg.mode !== 'WALK' && leg.fareStatus !== 'UNAVAILABLE' && <small className="leg-adult-fare">{copy(locale, '成人票價 ', 'Adult fare ')}HK${(leg.fare ?? 0).toFixed(2)}{leg.fareStatus === 'FULL_FARE' ? ' · ' + copy(locale, '全程票價上限', 'full-fare upper bound') : leg.fare === 0 ? ' · ' + copy(locale, '已包括在鐵路票價內', 'included in rail fare') : ''}</small>}
          <small>{copy(locale, '約', 'About')} {leg.journeyTimeMinutes} min{leg.serviceEnded ? ' · ' + copy(locale, '暫無班次', 'No upcoming service') : leg.realtimeEta?.isLive ? ' · ' + copy(locale, '即時到站', 'Live arrival') + ' ' + leg.realtimeEta.etaMinutes + ' min' : leg.mode !== 'WALK' ? ' · ' + copy(locale, '預計等候', 'Estimated wait') + ' ' + Math.ceil(leg.scheduledWaitMinutes ?? (leg.scheduledIntervalMinutes ?? 12) / 2) + ' min' : ''}</small>
          {leg.serviceStatus === 'UNVERIFIED' && <small>{copy(locale, '此路段服務未能核實，請向營辦商確認。', 'Service on this leg is unverified. Confirm with the operator.')}</small>}
          {leg.serviceStatus === 'TIMETABLE' && <small>{copy(locale, '按官方時間表估算，並非即時到站預報。', 'Based on the published timetable, not a live arrival prediction.')}</small>}
          {leg.fareStatus === 'UNAVAILABLE' && <small>{copy(locale, '此路段票價未有資料。', 'Fare data for this leg is unavailable.')}</small>}
          {index < route.legs.length - 1 && <small className="transfer-note">{copy(locale, '在此轉乘；全程轉乘步行約', 'Change here; total transfer walking about')} {transferWalk} min</small>}
        </div>
      </li>)}
      <li><span className="step-marker"><PlannerIcon name="pin" size={16} /></span><div><strong>{copy(locale, '抵達目的地', 'Arrive at your destination')}</strong>{!walkOnly && (route.destinationWalkMinutes ?? 0) > 0 && <small>{copy(locale, '下車後步行', 'Walk after alighting')} {route.destinationWalkMinutes} min</small>}</div></li>
    </ol>
    <details className="score-explanation"><summary>{copy(locale, '為甚麼推薦這條路線？', 'Why this route?')}<span>{route.finalScore.toFixed(1)}</span></summary>
      <p>{copy(locale, '改良權重綜合時間、接駁、票價及服務可靠性。分數是比較指標，並非行程分鐘。', 'Enhanced weighting balances time, connections, fare and service confidence. Scores are a comparison measure, not journey minutes.')}</p>
      <dl>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value > 0 ? '+' : ''}{value.toFixed(2)}</dd></div>)}<div className="score-total"><dt>{copy(locale, '總評分', 'Total score')}</dt><dd>{route.finalScore.toFixed(2)}</dd></div></dl>
      <p>{copy(locale, '候車使用可趕及的即時 ETA 或時間表；步行 ×1.35、每次轉乘 +8、每 HK$1 +0.45、未核實服務每段 +4。', 'Waiting uses a reachable live ETA or timetable. Walking ×1.35; +8 per transfer; +0.45 per HK$1; +4 per unverified leg.')}</p>
    </details>
    {!walkOnly && <p className="fare-explanation">{copy(locale, '普通成人單程票價；港鐵及輕鐵採成人八達通。不自動扣除未核實轉乘優惠、月票或優惠票價。', 'Normal adult single fares; adult Octopus for MTR and Light Rail. Unverified interchange offers, passes and concessions are excluded.')}</p>}
    {!walkOnly && <details className="score-explanation"><summary>{copy(locale, '月票分析', 'Monthly pass estimate')}<PlannerIcon name="chevron" size={14} /></summary>
      <p>{insight.coveredLegCount > 0 ? copy(locale, '按現有月票模型，每程估計節省 HK$ ', 'Under the current pass model, estimated saving per trip HK$ ') + insight.savingThisTrip.toFixed(2) : copy(locale, '這條路線沒有月票涵蓋的交通段。', 'No legs on this route are covered by the current pass model.')}</p>
      {insight.breakEvenTrips && <p>{copy(locale, '月票 HK$ ', 'Pass HK$ ') + insight.passPrice + copy(locale, ' · 約 ', ' · about ') + insight.breakEvenTrips + copy(locale, ' 程回本', ' trips to break even')}</p>}
      <p>{copy(locale, '票價、轉乘優惠及月票涵蓋屬原型估算，請向營辦商核實。', 'Fares, interchange discounts and pass coverage are prototype estimates. Confirm with the operator.')}</p>
    </details>}
  </div>;
}
