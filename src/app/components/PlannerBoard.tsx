'use client';

import { useEffect, useState } from 'react';
import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import type { PlaceResult } from './PlaceAutocomplete';
import { JourneyMap } from './JourneyMap';
import { PlannerIcon } from './PlannerIcon';
import { RouteDetails } from './RouteDetails';
import { copy, hasEndedService, journeyMinutes, routeColor, type PlannerLocale } from './plannerUi';

type Mode = 'all' | 'BUS' | 'SUBWAY' | 'FERRY' | 'WALK';
const filters: { mode: Mode; zh: string; en: string }[] = [
  { mode: 'all', zh: '全部', en: 'All' }, { mode: 'BUS', zh: '巴士', en: 'Bus' },
  { mode: 'SUBWAY', zh: '港鐵', en: 'MTR' }, { mode: 'FERRY', zh: '渡輪', en: 'Ferry' }, { mode: 'WALK', zh: '步行', en: 'Walk' },
];

function legLabel(route: ScoredRoute, locale: PlannerLocale): string {
  if (route.legs.every(leg => leg.mode === 'WALK')) return copy(locale, '全程步行', 'Walk all the way');
  return route.legs.map(leg => leg.mode === 'WALK' ? copy(locale, '步行', 'Walk') : leg.routeNumber || leg.operator).join(' · ');
}

export function PlannerBoard({ routes, emptyHint, endpoints, locale = 'zh' }: {
  routes: ScoredRoute[];
  emptyHint?: string;
  endpoints: { origin: PlaceResult; destination: PlaceResult } | null;
  locale?: PlannerLocale;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<Mode>('all');
  const [showDetails, setShowDetails] = useState(false);
  useEffect(() => { setSelectedId(routes[0]?.id ?? ''); setFilter('all'); setShowDetails(false); }, [routes]);
  const candidates = filter === 'all' ? routes : routes.filter(route => route.legs.some(leg => leg.mode === filter));
  const selected = candidates.find(route => route.id === selectedId) ?? candidates[0];
  const bestId = routes.find(route => !hasEndedService(route))?.id ?? routes[0]?.id;

  return <div className="planner-results" id="routes">
    <section className="results-pane" aria-label={copy(locale, '行程選擇', 'Route options')}>
      <div className="results-header"><div><span className="section-overline">{copy(locale, '路線規劃', 'YOUR ROUTES')}</span><h2>{routes.length ? copy(locale, '選擇你的路線', 'Choose your route') : copy(locale, '等你出發', 'Where to next?')}</h2></div>{routes.length > 0 && <span className="result-count">{routes.length} {copy(locale, '個選擇', 'options')}</span>}</div>
      {routes.length > 0 ? <>
        <div className="route-filters" role="group" aria-label={copy(locale, '交通方式篩選', 'Filter by mode')}>
          {filters.filter(item => item.mode === 'all' || routes.some(route => route.legs.some(leg => leg.mode === item.mode)))
            .map(item => <button type="button" key={item.mode} className={filter === item.mode ? 'selected' : ''} onClick={() => setFilter(item.mode)} aria-pressed={filter === item.mode}>{copy(locale, item.zh, item.en)}</button>)}
        </div>
        <div className="route-list">{candidates.map(route => {
          const active = selected?.id === route.id;
          const ended = hasEndedService(route);
          return <button type="button" key={route.id} className={'route-option' + (active ? ' active' : '')} onClick={() => { setSelectedId(route.id); setShowDetails(false); }} aria-pressed={active}>
            <span className="route-option-top"><span className="route-duration">{journeyMinutes(route)}<small>min</small></span><span className="route-option-summary"><span>{ended ? copy(locale, '班次已結束', 'Service ended') : route.id === bestId ? copy(locale, '最合適', 'BEST MATCH') : copy(locale, '行程', 'JOURNEY')}</span><strong>{legLabel(route, locale)}</strong><small>{route.transferCount} {copy(locale, '次轉乘', 'transfers')} · {route.legs.length} {copy(locale, '段', 'legs')}</small></span><span className="route-option-price">HK${route.discountedFare.toFixed(2)}<small>{copy(locale, '估算車費', 'est. fare')}</small></span></span>
            <span className="route-lines" aria-hidden="true">{route.legs.map(leg => <span key={leg.id} style={{ backgroundColor: leg.mode === 'WALK' ? '#81918d' : routeColor(leg.operator), width: Math.max(24, Math.round(100 / route.legs.length)) + '%' }} />)}</span>
            <span className="route-service-line"><span><PlannerIcon name="walk" size={12} />{route.legs.every(leg => leg.mode === 'WALK') ? journeyMinutes(route) : route.walkTransferTimeMinutes} min</span><span className={ended ? 'service-ended' : route.legs[0]?.realtimeEta?.isLive ? 'service-live' : ''}>{ended ? copy(locale, '暫無班次', 'No upcoming service') : route.legs[0]?.realtimeEta?.isLive ? copy(locale, '即時到站 ', 'Live arrival ') + route.legs[0].realtimeEta.etaMinutes + ' min' : route.legs.every(leg => leg.mode === 'WALK') ? copy(locale, '不用候車', 'No waiting') : copy(locale, '候車時間為估算', 'Estimated waiting')}</span></span>
          </button>;
        })}</div>
        <p className="route-estimate-note">{copy(locale, '時間含步行及估算候車；已收班路線的時間僅供參考。', 'Times include walking and estimated waiting. Ended-service times are for reference only.')}</p>
        {selected && <div className="selected-route" aria-live="polite">
          <div className="selected-heading"><span><PlannerIcon name="arrow" size={17} />{copy(locale, '行程詳情', 'YOUR JOURNEY')}</span><button type="button" className="text-control" onClick={() => setShowDetails(v => !v)} aria-expanded={showDetails}>{showDetails ? copy(locale, '收起', 'Close') : copy(locale, '查看詳情', 'Details')}<PlannerIcon name="chevron" size={14} /></button></div>
          <div className="selected-stops"><strong>{endpoints?.origin.name ?? selected.legs[0]?.originStop?.name}</strong><span className="stop-connector" /><strong>{endpoints?.destination.name ?? selected.legs[selected.legs.length - 1]?.destinationStop?.name}</strong></div>
          <div className="selected-meta"><span>{journeyMinutes(selected)} min</span><span>{selected.transferCount} {copy(locale, '次轉乘', 'transfers')}</span><span>HK${selected.discountedFare.toFixed(2)}</span><span className="weighted-score">{copy(locale, '評分', 'score')} {selected.finalScore.toFixed(1)}</span></div>
          {showDetails && <RouteDetails route={selected} locale={locale} />}
        </div>}
      </> : <div className="empty-routes"><span className="empty-icon"><PlannerIcon name="compass" size={25} /></span><strong>{emptyHint ?? copy(locale, '想去邊度？', 'Ready when you are.')}</strong><p>{copy(locale, '搜尋香港的地點、街道或車站，比較班次、候車時間、轉乘及車費。', 'Search a Hong Kong place, street or station to compare services, waiting, transfers and fare.')}</p><div className="empty-hints"><span><PlannerIcon name="clock" size={15} />{copy(locale, '出發時間會以現在計算', 'Leave now')}</span><span><PlannerIcon name="info" size={15} />{copy(locale, '透明路線評分', 'Explainable route scores')}</span></div></div>}
    </section>
    <div className="map-pane"><JourneyMap route={selected} endpoints={endpoints} locale={locale} /></div>
  </div>;
}
