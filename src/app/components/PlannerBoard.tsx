'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ScoredRoute, TransitLeg } from '../../engine/UpgradedScoringEngine';
import type { PlaceResult } from './PlaceAutocomplete';
import { JourneyMap } from './JourneyMap';
import { PlannerIcon } from './PlannerIcon';
import { RouteDetails } from './RouteDetails';
import { hongKongTimeLabel } from '../../engine/journeyTime';
import { copy, fareLabel, hasEndedService, journeyMinutes, legOperator, modeIcon, modeLabel, routeBadgeStyle, routeSignColours, type JourneyLocations, type PlannerLocale } from './plannerUi';
import { combinedLegChoices, groupDurationLabel, groupPassFareLabel, groupJourneysByStops, type JourneyGroup, type JourneySort } from './journeyGroups';
import { FareComparison } from './FareComparison';
import { KMB_PASS_RULES } from '../../domain/monthlyPass';
import { AddedDeparture } from './AddedDeparture';
import { operatorName } from '../../data/transportOperators';

function RouteSymbols({ route, locale, choices, compact = false }: { route: ScoredRoute; locale: PlannerLocale; choices?: TransitLeg[][]; compact?: boolean }) {
  return <span className="route-symbols">{(choices ?? route.legs.map(leg => [leg])).map((legs, index) => <span className="leg-symbol-group" key={index}>
    {index > 0 && <span className="leg-separator">·</span>}
    {(compact ? legs.slice(0, 6) : legs).map((leg, option) => <span className="leg-route-choice" key={option}>{option > 0 && <span className="leg-alternative-divider">/</span>}
    {leg.mode === 'WALK' ? <PlannerIcon name="walk" size={21} /> : <span className="route-badge route-stop-plate" title={operatorName(legOperator(leg), locale) + ' · ' + leg.routeNumber + (routeSignColours(legOperator(leg), leg.routeNumber).verified ? '' : ' · ' + copy(locale, '公司顏色未核實', 'Company colour not verified'))} style={routeBadgeStyle(legOperator(leg), leg.routeNumber)}>
      <span className="route-badge-icon"><PlannerIcon name={modeIcon(leg.mode)} size={18} /></span>
      <strong>{leg.routeNumber || modeLabel(leg.mode, locale)}</strong>
    </span>}</span>)}{compact && legs.length > 6 && <small className="combined-more-services">+{legs.length - 6}</small>}
  </span>)}</span>;
}

function JourneyRow({ route, locale, onSelect, selected = false }: { route: ScoredRoute; locale: PlannerLocale; onSelect: () => void; selected?: boolean }) {
  const first = route.legs[0];
  const ended = hasEndedService(route);
  const live = first?.realtimeEta?.isLive;
  const isWalk = route.legs.every(leg => leg.mode === 'WALK');
  return <button type="button" className={'route-option' + (ended ? ' ended' : '') + (selected ? ' is-selected' : '')} onClick={onSelect} aria-pressed={selected}
    aria-label={journeyMinutes(route) + ' minute journey, ' + route.legs.map(leg => leg.routeNumber || leg.mode).join(', ') + ', ' + copy(locale, '無月票 ', 'Without pass ') + fareLabel(route, locale) + ', ' + copy(locale, '使用九巴月票 ', 'With KMB pass ') + groupPassFareLabel({ id: route.id, routes: [route] }, locale)}>
    {selected && <span className="route-selected-label"><PlannerIcon name="pin" size={13} />{copy(locale, '已選取 · 地圖顯示中', 'Selected on map')}</span>}
    <span className="route-option-top"><RouteSymbols route={route} locale={locale} /><span className="route-duration">{live && !ended && <PlannerIcon name="signal" size={17} />}{journeyMinutes(route)}<small>min</small></span></span>
    <FareComparison routes={[route]} locale={locale} />
    {route.departureTime && route.arrivalTime && <span className="route-clock-line">{hongKongTimeLabel(route.departureTime)} → {hongKongTimeLabel(route.arrivalTime)} <small>HKT · {copy(locale, '普通成人', 'Normal adult')}</small></span>}
    <span className="route-service-line">{ended ? <span className="service-ended">{copy(locale, '暫無班次', 'No upcoming service')}</span>
      : isWalk ? copy(locale, '全程步行', 'Walk all the way')
        : live ? <><PlannerIcon name="signal" size={13} /><span>{copy(locale, '約 ', 'in ')}{first.realtimeEta?.etaMinutes} {copy(locale, '分鐘到站', 'min from')} {first.originStop?.name}</span><AddedDeparture departure={first.liveDepartures?.[0]} locale={locale} /></>
          : first?.serviceStatus === 'UNVERIFIED' ? <span>{copy(locale, '班次未能核實 · 時間估算', 'Service unverified · estimated times')}</span>
            : first?.departureTime ? <span>{copy(locale, '時間表 · 上車 ', 'Timetable · board at ')}{hongKongTimeLabel(first.departureTime)}</span>
              : <span>{copy(locale, '班距約 ', 'Every ')}{first?.scheduledIntervalMinutes ?? 12} min</span>}</span>
  </button>;
}

function JourneyChoiceGroup({ group, locale, onSelect, onPreview, selectedId, searchOrigin }: { group: JourneyGroup; locale: PlannerLocale; onSelect: (route: ScoredRoute) => void; onPreview: (route: ScoredRoute) => void; selectedId?: string; searchOrigin?: string }) {
  const best = group.routes[0];
  const selectedRoute = group.routes.find(route => route.id === selectedId);
  if (group.routes.length === 1) return <JourneyRow route={best} locale={locale} onSelect={() => onSelect(best)} selected={Boolean(selectedRoute)} />;
  const choices = combinedLegChoices(group);
  const sameBoarding = group.routes.every(route => route.legs[0].originStop?.id === best.legs[0].originStop?.id);
  const sameStops = group.routes.every(route => route.legs.every((leg, index) => leg.originStop?.id === best.legs[index].originStop?.id && leg.destinationStop?.id === best.legs[index].destinationStop?.id));
  return <details className={'combined-journeys' + (selectedRoute ? ' is-selected' : '')}>
    <summary className="combined-journey-summary" onClick={() => onPreview(selectedRoute ?? best)}>
      <span className="journey-card-labels"><span className="combined-card-label"><PlannerIcon name="layers" size={13} />{copy(locale, '合併路線', 'Combined routes')}</span>
        {selectedRoute && <span className="route-selected-label"><PlannerIcon name="pin" size={13} />{copy(locale, '已選取 · 地圖顯示中', 'Selected on map')}</span>}</span>
      <span className="route-option-top"><span className="combined-option-count">{group.routes.length} {copy(locale, '個行程', 'journeys')}</span>
        <span className="route-duration">{groupDurationLabel(group)}<small>min</small></span></span>
      <FareComparison routes={group.routes} locale={locale} />
      <span className="combined-route-symbols">{choices ? <RouteSymbols route={best} locale={locale} choices={choices} compact />
        : group.routes.map((route, index) => <span className="combined-complete-path" key={route.id}>{index > 0 && <small>{copy(locale, '或', 'or')}</small>}<RouteSymbols route={route} locale={locale} /></span>)}</span>
      <span className="combined-stop-pair">{sameBoarding ? best.legs[0].originStop?.name : searchOrigin ?? copy(locale, '附近上車站', 'Nearby boarding stops')} → {best.legs.at(-1)?.destinationStop?.name}</span>
      {selectedRoute && <span className="combined-selected-journey">{copy(locale, '地圖行程：', 'Map journey: ')}{selectedRoute.legs.map(leg => leg.routeNumber || modeLabel(leg.mode, locale)).join(' → ')}</span>}
      {best.departureTime && best.arrivalTime && <span className="route-clock-line">{copy(locale, '首選 ', 'Top option ')}{hongKongTimeLabel(best.departureTime)} → {hongKongTimeLabel(best.arrivalTime)} <small>HKT · {copy(locale, '普通成人', 'Normal adult')}</small></span>}
      <span className="combined-expand-label">{sameStops ? copy(locale, '同一上落車站 · 查看各行程', 'Same boarding and alighting stops · View journeys')
        : copy(locale, '接駁上車站及轉乘站不同 · 查看行程', 'Boarding and transfer stops vary · View journeys')}<PlannerIcon name="chevron" size={13} /></span>
    </summary>
    <div className="combined-journey-options" role="group" aria-label={copy(locale, '選擇完整行程', 'Choose a complete journey')}>
      {group.routes.map(route => <JourneyRow key={route.id} route={route} locale={locale} onSelect={() => onSelect(route)} selected={route.id === selectedId} />)}
    </div>
  </details>;
}

function JourneySortControl({ value, onChange, locale }: { value: JourneySort; onChange: (value: JourneySort) => void; locale: PlannerLocale }) {
  return <label className="journey-sort"><span>{copy(locale, '排序', 'Sort by')}</span>
    <select aria-label={copy(locale, '行程排序', 'Sort journeys')} value={value} onChange={event => onChange(event.target.value as JourneySort)}>
      <option value="recommended">{copy(locale, '建議排序', 'Recommended')}</option>
      <option value="fastest">{copy(locale, '最快', 'Fastest')}</option>
      <option value="cheapest">{copy(locale, '最便宜（無月票）', 'Cheapest (without pass)')}</option>
      <option value="transfers">{copy(locale, '最少轉乘', 'Fewest transfers')}</option>
      <option value="walking">{copy(locale, '最少步行', 'Least walking')}</option>
    </select>
  </label>;
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
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [sort, setSort] = useState<JourneySort>('recommended');
  const sidebar = useRef<HTMLDivElement>(null);
  useEffect(() => { setSelectedId(routes[0]?.id ?? ''); setShowDetails(false); setShowAllRoutes(false); }, [routes]);
  const selected = routes.find(route => route.id === selectedId) ?? routes[0];
  const walking = routes.find(route => route.legs.every(leg => leg.mode === 'WALK'));
  const recommended = routes.filter(route => !hasEndedService(route) && route.legs.some(leg => leg.mode !== 'WALK'));
  const ended = routes.filter(hasEndedService);
  const recommendedGroups = groupJourneysByStops(recommended, sort);
  const endedGroups = groupJourneysByStops(ended, sort);
  const mapPlaces = endpoints ?? places;
  function choose(route: ScoredRoute) {
    setSelectedId(route.id); setShowDetails(true);
    sidebar.current?.scrollTo({ top: 0, behavior: 'instant' });
  }
  function preview(route: ScoredRoute) {
    setSelectedId(route.id);
  }
  return <div className={'planner-workspace' + (showMap ? ' map-visible' : '')}>
    <div className="planner-sidebar-scroll" ref={sidebar}>
      {showDetails && selected ? <section className="trip-panel" id="journey" aria-label={copy(locale, '行程詳情', 'Journey details')}>
        <div className="trip-heading"><button type="button" className="all-results-button" onClick={() => { setShowDetails(false); sidebar.current?.scrollTo({ top: 0 }); }}><span>{copy(locale, '所有行程結果', 'All journey results')}</span><PlannerIcon name="chevron" size={14} /></button><div className="trip-endpoints"><strong>{endpoints?.origin.name ?? selected.legs[0]?.originStop?.name}</strong><span>↓</span><strong>{endpoints?.destination.name ?? selected.legs[selected.legs.length - 1]?.destinationStop?.name}</strong></div></div>
        <div className="trip-summary"><RouteSymbols route={selected} locale={locale} /><span className="trip-walk"><PlannerIcon name="walk" size={17} />{selected.legs.every(leg => leg.mode === 'WALK') ? journeyMinutes(selected) : selected.walkTransferTimeMinutes} min</span><span className="route-duration">{journeyMinutes(selected)}<small>min</small></span></div>
        <div className="trip-fare-comparison"><FareComparison routes={[selected]} locale={locale} /></div>
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
            {recommendedGroups.length > 0 && <div className="route-group"><div className="route-group-heading"><h2>{copy(locale, '建議', 'Suggested')}</h2><JourneySortControl value={sort} onChange={setSort} locale={locale} /></div><div className="route-list">{(showAllRoutes ? recommendedGroups : recommendedGroups.slice(0, 12)).map(group => <JourneyChoiceGroup key={group.id} group={group} locale={locale} onSelect={choose} onPreview={preview} selectedId={selected?.id} searchOrigin={mapPlaces.origin?.name} />)}</div>
              {recommendedGroups.length > 12 && <button type="button" className="more-journeys" onClick={() => setShowAllRoutes(value => !value)}>{showAllRoutes ? copy(locale, '顯示較少路線', 'Show fewer options') : copy(locale, '顯示全部 ', 'Show all ') + recommendedGroups.length + copy(locale, ' 組行程', ' journey groups')}</button>}</div>}
            {walking && <div className="route-group"><h2>{copy(locale, '步行', 'Walk')}</h2><div className="route-list"><JourneyRow route={walking} locale={locale} onSelect={() => choose(walking)} selected={selected?.id === walking.id} /></div></div>}
            {endedGroups.length > 0 && <div className="route-group"><div className="route-group-heading"><h2>{copy(locale, '暫無班次', 'No upcoming service')}</h2>{recommendedGroups.length === 0 && <JourneySortControl value={sort} onChange={setSort} locale={locale} />}</div><div className="route-list">{endedGroups.map(group => <JourneyChoiceGroup key={group.id} group={group} locale={locale} onSelect={choose} onPreview={preview} selectedId={selected?.id} searchOrigin={mapPlaces.origin?.name} />)}</div></div>}
            <p className="route-estimate-note">{copy(locale, '車程及票價為估算，路線按你的權重排列。', 'Times and fares are estimates. Routes use your weighted ranking.')} <a href="/coverage">{copy(locale, '交通資料涵蓋範圍', 'Transport coverage')}</a></p>
            <p className="route-estimate-note">{copy(locale, '月票價假設已有有效九巴月票及足夠每日乘車額，不包括購買月票費用。無月票價為普通成人車費。', 'Pass fares assume a valid KMB Monthly Pass and sufficient daily rides; the pass purchase price is separate. Without-pass fares are normal adult fares.')} <a href={KMB_PASS_RULES.sourceUrl} target="_blank" rel="noreferrer">{copy(locale, '九巴月票條款', 'KMB pass terms')}</a></p>
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
