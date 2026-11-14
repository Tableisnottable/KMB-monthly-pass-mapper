'use client';

import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import { getMonthlyPassInsight, getPassLegFare, KMB_PASS_RULES } from '../../domain/monthlyPass';
import { PlannerIcon } from './PlannerIcon';
import { hongKongTimeLabel } from '../../engine/journeyTime';
import { copy, legOperator, modeIcon, modeLabel, routeBadgeStyle, type PlannerLocale } from './plannerUi';
import { operatorName } from '../../data/transportOperators';
import { DepartureBadge } from './DepartureBadge';
import { departureType } from '../../domain/departureType';
import { JointArrivalBoard } from './JointArrivalBoard';
import { studentLegFares } from '../../domain/journeyFares';
import { DEFAULT_WEIGHTS, customWeights, type RouteWeights } from '../../engine/routeWeights';

export function RouteDetails({ route, locale, weights = DEFAULT_WEIGHTS }: { route: ScoredRoute; locale: PlannerLocale; weights?: RouteWeights }) {
  const insight = getMonthlyPassInsight(route);
  const studentFares = studentLegFares(route);
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
    {route.departureTime && route.arrivalTime && <p className="journey-clock-summary">{hongKongTimeLabel(route.departureTime)} → {hongKongTimeLabel(route.arrivalTime)} <small>Hong Kong time</small></p>}
    <ol className="directions-list">
      {!walkOnly && (route.originWalkMinutes ?? 0) > 0 && <li><span className="step-marker"><PlannerIcon name="walk" size={15} /></span><div><strong>{copy(locale, '步行至上車站', 'Walk to your stop')}</strong><small>{route.legs[0]?.originStop.name} · {route.originWalkMinutes} min</small></div></li>}
      {route.legs.map((leg, index) => {
        const pass = getPassLegFare(leg);
        const passLabel = !pass.available ? copy(locale, '票價待查', 'Fare unavailable')
          : '$' + pass.minimum.toFixed(2) + (pass.maximum !== pass.minimum ? '–$' + pass.maximum.toFixed(2) : '');
        return <li key={leg.id}>
        <span className="step-marker step-operator-marker" style={routeBadgeStyle(legOperator(leg), leg.routeNumber)}><PlannerIcon name={modeIcon(leg.mode)} size={16} /></span>
        <div><strong>{leg.mode === 'WALK' ? copy(locale, '步行前往目的地', 'Walk to your destination') : operatorName(legOperator(leg), locale) + ' · ' + (leg.routeNumber || modeLabel(leg.mode, locale))} {leg.mode !== 'WALK' && <DepartureBadge departure={leg.liveDepartures?.[0] ?? { status: leg.serviceStatus ?? 'UNVERIFIED' }} locale={locale} />}</strong>
          <small>{leg.originStop?.name} → {leg.destinationStop?.name}</small>
          {leg.departureTime && leg.arrivalTime && <small>{hongKongTimeLabel(leg.departureTime)} → {hongKongTimeLabel(leg.arrivalTime)} HKT</small>}
          {leg.mode !== 'WALK' && leg.fareStatus !== 'UNAVAILABLE' && <small className="leg-adult-fare">{copy(locale, '無月票 ', 'Without pass ')}HK${(leg.fare ?? 0).toFixed(2)}{leg.fareStatus === 'FULL_FARE' ? ' · ' + copy(locale, '全程票價上限', 'full-fare upper bound') : leg.fare === 0 ? ' · ' + copy(locale, '已包括在鐵路票價內', 'included in rail fare') : ''}</small>}
          {leg.mode !== 'WALK' && <small className="leg-pass-fare">{copy(locale, '使用九巴月票 ', 'With KMB pass ')}{passLabel}{leg.fareStatus === 'FULL_FARE' && pass.maximum > 0 ? ' · ' + copy(locale, '票價上限', 'upper bound') : ''}{pass.operatorDependent ? ' · ' + copy(locale, '視乎實際營辦商', 'depends on the operating company') : ''}</small>}
          {leg.mode !== 'WALK' && <small>{copy(locale, '學生 ', 'Student ')}{studentFares[index].available ? (studentFares[index].upperBound ? copy(locale, '最多 ', 'Up to ') : '') + '$' + studentFares[index].maximum.toFixed(2) : copy(locale, '票價待查', 'Fare unavailable')}{studentFares[index].adultFallback ? ' · ' + copy(locale, '未核實學生優惠，採成人價', 'adult fare used; student offers unverified') : ''}</small>}
          <small>{copy(locale, '約', 'About')} {leg.journeyTimeMinutes} min{leg.serviceEnded ? ' · ' + copy(locale, '暫無班次', 'No upcoming service') : leg.realtimeEta?.isLive ? ' · ' + (leg.liveDepartures?.[0] && departureType(leg.liveDepartures[0]) === 'ADDITIONAL' ? copy(locale, '加班到站', 'Additional arrival') : copy(locale, '即時到站', 'Live arrival')) + ' ' + leg.realtimeEta.etaMinutes + ' min' : leg.mode !== 'WALK' ? ' · ' + copy(locale, '預計等候', 'Estimated wait') + ' ' + Math.ceil(leg.scheduledWaitMinutes ?? (leg.scheduledIntervalMinutes ?? 12) / 2) + ' min' : ''}</small>
          {leg.mode !== 'WALK' && <JointArrivalBoard departures={leg.liveDepartures ?? []}
            operator={legOperator(leg)} routeNumber={leg.routeNumber} stopName={leg.originStop?.name} locale={locale}
            scheduledTime={leg.departureTime} scheduledHeadway={leg.publishedHeadwayMinutes}
            timetableOnly={route.timeMode !== 'now' || index > 0} />}
          {leg.serviceStatus === 'UNVERIFIED' && <small>{copy(locale, '此路段服務未能核實，請向營辦商確認。', 'Service on this leg is unverified. Confirm with the operator.')}</small>}
          {leg.serviceStatus === 'TIMETABLE' && <small>{copy(locale, '按官方時間表估算，並非即時到站預報。', 'Based on the published timetable, not a live arrival prediction.')}</small>}
          {leg.networkRouteId && <small><a className="departure-timetable-link" href={'/timetables?' + new URLSearchParams({ lang: locale, route: leg.networkRouteId, ...(leg.networkPatternId && leg.originStop ? { pattern: leg.networkPatternId, stop: leg.originStop.id } : {}) })}>{copy(locale, '完整班次時間表', 'Full timetable')}</a></small>}
          {leg.fareStatus === 'UNAVAILABLE' && <small>{copy(locale, '此路段票價未有資料。', 'Fare data for this leg is unavailable.')}</small>}
          {index < route.legs.length - 1 && <small className="transfer-note">{copy(locale, '在此轉乘；全程轉乘步行約', 'Change here; total transfer walking about')} {transferWalk} min</small>}
        </div>
      </li>; })}
      <li><span className="step-marker"><PlannerIcon name="pin" size={16} /></span><div><strong>{copy(locale, '抵達目的地', 'Arrive at your destination')}</strong>{!walkOnly && (route.destinationWalkMinutes ?? 0) > 0 && <small>{copy(locale, '下車後步行', 'Walk after alighting')} {route.destinationWalkMinutes} min</small>}</div></li>
    </ol>
    <details className="score-explanation"><summary>{copy(locale, '為甚麼推薦這條路線？', 'Why this route?')}<span>{route.finalScore.toFixed(1)}</span></summary>
      <p>{copy(locale, '改良權重綜合時間、接駁、票價及服務可靠性。分數是比較指標，並非行程分鐘。', 'Enhanced weighting balances time, connections, fare and service confidence. Scores are a comparison measure, not journey minutes.')}</p>
      <dl>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value > 0 ? '+' : ''}{value.toFixed(2)}</dd></div>)}<div className="score-total"><dt>{copy(locale, '總評分', 'Total score')}</dt><dd>{route.finalScore.toFixed(2)}</dd></div></dl>
      <p>{copy(locale, '目前重要性：', 'Applied importance: ')}{copy(locale, '乘車', 'ride')} ×{weights.ride} · {copy(locale, '步行', 'walk')} ×{weights.walk} · {copy(locale, '轉乘', 'transfer')} +{weights.transfer} · HK$1 +{weights.fare} · {copy(locale, '未核實服務', 'unverified')} +{weights.unverified} · {copy(locale, '候車', 'waiting')} ×{weights.wait}</p>
      {customWeights(weights) && <p className="weight-warning">{copy(locale, '本行程使用自訂重要性，推薦可能較慢、較貴或步行更多。', 'Custom importance is active; recommendations can be slower, more expensive or involve more walking.')}</p>}
    </details>
    {!walkOnly && <p className="fare-explanation">{copy(locale, '無月票價為普通成人車費；港鐵及輕鐵採成人八達通。月票價假設已有有效九巴月票及足夠每日乘車額，不包括購買月票費用。不扣除未核實轉乘優惠。', 'Without-pass fares are normal adult fares, using adult Octopus for rail. Pass fares assume a valid KMB Monthly Pass and sufficient daily rides; the purchase price is separate. Unverified interchange offers are excluded.')}</p>}
    {!walkOnly && <details className="score-explanation"><summary>{copy(locale, '月票分析', 'Monthly pass estimate')}<PlannerIcon name="chevron" size={14} /></summary>
      <p>{!insight.available ? copy(locale, '票價資料不足，暫不能計算月票節省。', 'Fare data is incomplete; pass savings cannot be calculated.')
        : insight.benefitLegCount > 0 ? copy(locale, '每程估計節省 HK$ ', 'Estimated saving per trip HK$ ') + insight.savingMin.toFixed(2) + (insight.savingMax !== insight.savingMin ? '–' + insight.savingMax.toFixed(2) : '')
          : copy(locale, '此行程的月票價與無月票價相同。', 'The with-pass and without-pass fares are the same for this journey.')}</p>
      {insight.breakEvenTrips && <p>{copy(locale, '月票 HK$ ', 'Pass HK$ ') + insight.passPrice + copy(locale, ' · 約 ', ' · about ') + insight.breakEvenTrips + copy(locale, ' 程回本', ' trips to break even')}</p>}
      <p>{copy(locale, '假設每日最多 10 程額仍足夠；B1 另設每日 2 程額。聯營班次視乎實際營辦商。票價經四捨五入估算，以營辦商收費為準。', 'Assumes enough of the daily 10-ride quota remains; B1 has a separate two-ride quota. Joint services depend on the bus company. Rounded fare estimates are subject to the operator’s final charge.')}</p>
      <p><a href={KMB_PASS_RULES.sourceUrl} target="_blank" rel="noreferrer">{copy(locale, '九巴月票官方條款', 'Official KMB Monthly Pass terms')}</a> · {copy(locale, '核實日期 ', 'Verified ')}{KMB_PASS_RULES.verifiedOn}</p>
    </details>}
  </div>;
}
