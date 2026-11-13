'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import type { PlaceResult } from './PlaceAutocomplete';
import { JourneyMap } from './JourneyMap';
import { PlannerIcon } from './PlannerIcon';
import { RouteDetails } from './RouteDetails';
import { copy, hasEndedService, journeyMinutes, routeColor, type JourneyLocations, type PlannerLocale } from './plannerUi';

function RouteSymbols({ route }: { route: ScoredRoute }) {
  return <span className="route-symbols">{route.legs.map((leg, index) => <span className="leg-symbol-group" key={leg.id}>
    {index > 0 && <span className="leg-separator">·</span>}
    {leg.mode === 'WALK' ? <PlannerIcon name="walk" size={21} /> : <span className="route-badge" style={{ color: routeColor(leg.operator) }}>
      <span className="route-badge-icon" style={{ backgroundColor: routeColor(leg.operator) }}><PlannerIcon name="bus" size={18} /></span>
      {leg.routeNumber && <strong>{leg.routeNumber}</strong>}
    </span>}
  </span>)}</span>;
}

function JourneyRow({ route, locale, onSelect }: { route: ScoredRoute; locale: PlannerLocale; onSelect: () => void }) {
  const first = route.legs[0];
  const ended = hasEndedService(route);
  const live = first?.realtimeEta?.isLive;
  const isWalk = route.legs.every(leg => leg.mode === 'WALK');
  return <button type="button" className={'route-option' + (ended ? ' ended' : '')} onClick={onSelect}
    aria-label={journeyMinutes(route) + ' minute journey, ' + route.legs.map(leg => leg.routeNumber || leg.mode).join(', ') + ', HK$' + route.discountedFare.toFixed(2)}>
    <span className="route-option-top"><RouteSymbols route={route} /><span className="route-option-price">{route.discountedFare > 0 ? '$' + route.discountedFare.toFixed(2) : copy(locale, '免費', 'Free')}</span><span className="route-duration">{live && !ended && <PlannerIcon name="signal" size={17} />}{journeyMinutes(route)}<small>min</small></span></span>
    <span className="route-service-line">{ended ? <span className="service-ended">{copy(locale, '暫無班次', 'No upcoming service')}</span>
      : isWalk ? copy(locale, '全程步行', 'Walk all the way')
        : live ? <><PlannerIcon name="signal" size={13} /><span>{copy(locale, '約 ', 'in ')}{first.realtimeEta?.etaMinutes} {copy(locale, '分鐘到站', 'min from')} {first.originStop?.name}</span></>
          : <span>{copy(locale, '班距約 ', 'Every ')}{first?.scheduledIntervalMinutes ?? 12} min</span>}</span>
  </button>;
}

export function PlannerBoard({ routes, searchPanel, emptyHint, endpoints, places, onMapPick, locale = 'zh' }: {
  routes: ScoredRoute[];
  searchPanel: ReactNode;
  emptyHint?: string;
  endpoints: { origin: PlaceResult; destination: PlaceResult } | null;
  places: JourneyLocations;
  onMapPick: (lat: number, lng: number) => void;
  locale?: PlannerLocale;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const sidebar = useRef<HTMLDivElement>(null);
  useEffect(() => { setSelectedId(routes[0]?.id ?? ''); setShowDetails(false); }, [routes]);
  const selected = routes.find(route => route.id === selectedId) ?? routes[0];
  const walking = routes.find(route => route.legs.every(leg => leg.mode === 'WALK'));
  const recommended = routes.filter(route => !hasEndedService(route) && route.legs.some(leg => leg.mode !== 'WALK'));
  const ended = routes.filter(hasEndedService);
  const mapPlaces = endpoints ?? places;
  function choose(route: ScoredRoute) {
    setSelectedId(route.id); setShowDetails(true);
    sidebar.current?.scrollTo({ top: 0, behavior: 'instant' });
  }
  return <div className={'planner-workspace' + (showMap ? ' map-visible' : '')}>
    <div className="planner-sidebar-scroll" ref={sidebar}>
      {showDetails && selected ? <section className="trip-panel" id="journey" aria-label={copy(locale, '行程詳情', 'Journey details')}>
        <div className="trip-heading"><button type="button" className="all-results-button" onClick={() => { setShowDetails(false); sidebar.current?.scrollTo({ top: 0 }); }}><span>{copy(locale, '所有行程結果', 'All journey results')}</span><PlannerIcon name="chevron" size={14} /></button><div className="trip-endpoints"><strong>{endpoints?.origin.name ?? selected.legs[0]?.originStop?.name}</strong><span>↓</span><strong>{endpoints?.destination.name ?? selected.legs[selected.legs.length - 1]?.destinationStop?.name}</strong></div></div>
        <div className="trip-summary"><RouteSymbols route={selected} /><span className="trip-fare">$ {selected.discountedFare.toFixed(2)}</span><span className="trip-walk"><PlannerIcon name="walk" size={17} />{selected.legs.every(leg => leg.mode === 'WALK') ? journeyMinutes(selected) : selected.walkTransferTimeMinutes} min</span><span className="route-duration">{journeyMinutes(selected)}<small>min</small></span></div>
        <button type="button" className="mobile-map-toggle" onClick={() => setShowMap(true)}><PlannerIcon name="monitor" size={15} />{copy(locale, '顯示地圖', 'Show Map')}</button>
        <RouteDetails route={selected} locale={locale} />
      </section> : <>
        {searchPanel}
        <button type="button" className="mobile-map-toggle" onClick={() => setShowMap(true)}><PlannerIcon name="monitor" size={15} />{copy(locale, '顯示地圖', 'Show Map')}</button>
        <section className="results-pane" id="routes" aria-label={copy(locale, '行程選擇', 'Journey options')}>
          {routes.length > 0 ? <>
            <div className="quick-modes"><button type="button" disabled={!walking} onClick={() => { if (walking) choose(walking); }}><PlannerIcon name="walk" size={25} /><span>{walking ? journeyMinutes(walking) : '—'}<small>min</small></span><strong>{copy(locale, '步行', 'Walk')}</strong></button>
              <button type="button" disabled title={copy(locale, '目前未提供單車路線', 'Cycle routing is not currently available')}><PlannerIcon name="cycle" size={27} /><span>—</span><strong>{copy(locale, '單車', 'Cycle')}</strong></button>
              <button type="button" disabled title={copy(locale, '目前未提供的士路線', 'Taxi routing is not currently available')}><PlannerIcon name="car" size={25} /><span>—</span><strong>{copy(locale, '的士', 'Cab')}</strong></button></div>
            {recommended.length > 0 && <div className="route-group"><h2>{copy(locale, '建議', 'Suggested')}</h2><div className="route-list">{recommended.map(route => <JourneyRow key={route.id} route={route} locale={locale} onSelect={() => choose(route)} />)}</div></div>}
            {walking && <div className="route-group"><h2>{copy(locale, '步行', 'Walk')}</h2><div className="route-list"><JourneyRow route={walking} locale={locale} onSelect={() => choose(walking)} /></div></div>}
            {ended.length > 0 && <div className="route-group"><h2>{copy(locale, '暫無班次', 'No upcoming service')}</h2><div className="route-list">{ended.map(route => <JourneyRow key={route.id} route={route} locale={locale} onSelect={() => choose(route)} />)}</div></div>}
            <p className="route-estimate-note">{copy(locale, '車程及票價為估算，路線按你的權重排列。', 'Times and fares are estimates. Routes use your weighted ranking.')}</p>
          </> : <p className="map-instruction" role="status">{emptyHint}</p>}
        </section>
      </>}
    </div>
    <div className="map-pane">
      <JourneyMap route={selected} places={mapPlaces} onPick={onMapPick} locale={locale} />
      <button type="button" className="mobile-close-map" onClick={() => setShowMap(false)}><PlannerIcon name="back" size={17} />{copy(locale, '返回行程', 'Back to journeys')}</button>
    </div>
  </div>;
}
