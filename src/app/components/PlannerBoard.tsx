'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ScoredRoute, TransitLeg } from '../../engine/UpgradedScoringEngine';
import type { PlaceResult } from './PlaceAutocomplete';
import { JourneyMap } from './JourneyMap';
import { PlannerIcon } from './PlannerIcon';
import { RouteDetails } from './RouteDetails';
import { hongKongTimeLabel } from '../../engine/journeyTime';
import { copy, fareLabel, hasEndedService, journeyMinutes, totalWalkMinutes, legOperator, modeIcon, modeLabel, routeBadgeStyle, routeSignColours, type JourneyLocations, type PlannerLocale } from './plannerUi';
import { combinedLegChoices, groupDurationLabel, groupPassFareLabel, groupStudentFareLabel, groupJourneysByStops, type JourneyGroup, type JourneySort } from './journeyGroups';
import { FareComparison } from './FareComparison';
import { KMB_PASS_RULES } from '../../domain/monthlyPass';
import { DepartureBadge } from './DepartureBadge';
import { operatorName } from '../../data/transportOperators';
import type { FareProfile } from '../../domain/journeyFares';
import { QuickTravelOptions, TravelOptionDetails, useTravelOptions } from './QuickTravelOptions';
import type { TravelMode } from '../../domain/travelOptions';
import type { JourneyTimeSelection } from '../../engine/journeyTime';
import type { RouteWeights } from '../../engine/routeWeights';
import { corridorChoices, routeCorridors, type RoutePreferences } from '../../domain/routePreferences';
import { STUDENT_FARE_SOURCE } from '../../domain/journeyFares';
import { JourneyEndpoints } from './JourneyEndpoints';
import { comparisonTypes, type ComparisonPreferences } from '../../domain/transportSelection';
const FareProfileContext = createContext<FareProfile>('adult');
const FareLabelContext = createContext<string | undefined>(undefined);

function WalkTime({ routes, locale }: { routes: ScoredRoute[]; locale: PlannerLocale }) {
  const times = routes.map(totalWalkMinutes), min = Math.min(...times), max = Math.max(...times);
  return <span className="journey-walk-time"><PlannerIcon name="walk" size={16} />{copy(locale, '全程步行 ', 'Total walking ')}{min}{max !== min ? '–' + max : ''} {copy(locale, '分鐘', 'min')}</span>;
}

function CorridorLabels({ route, locale }: { route: ScoredRoute; locale: PlannerLocale }) {
  const ids = routeCorridors(route), choices = Object.values(corridorChoices).flat();
  return ids.length ? <span className="route-corridor-label">{ids.map(id => { const choice = choices.find(row => row[0] === id); return choice?.[locale === 'en' ? 2 : 1]; }).filter(Boolean).join(' · ')}</span> : null;
}

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
  const profile = useContext(FareProfileContext);
  const selectedLabel = useContext(FareLabelContext);
  const first = route.legs[0];
  const ended = hasEndedService(route);
  const live = first?.realtimeEta?.isLive;
  const isWalk = route.legs.every(leg => leg.mode === 'WALK');
  const selectedPrice = profile === 'adult' ? fareLabel(route, locale) : profile === 'pass' ? groupPassFareLabel({ id: route.id, routes: [route] }, locale) : profile === 'student' ? groupStudentFareLabel({ id: route.id, routes: [route] }, locale) : copy(locale, '票價未核實', 'Fare unverified');
  return <button type="button" className={'route-option' + (ended ? ' ended' : '') + (selected ? ' is-selected' : '')} onClick={onSelect} aria-pressed={selected}
    aria-label={journeyMinutes(route) + ' minute journey, ' + route.legs.map(leg => leg.routeNumber || leg.mode).join(', ') + ', ' + copy(locale, '全程步行 ', 'Total walking ') + totalWalkMinutes(route) + ' min, ' + copy(locale, '普通成人 ', 'Normal adult ') + fareLabel(route, locale) + ', ' + copy(locale, '所選 ', 'Selected ') + (selectedLabel ?? profile) + ' ' + selectedPrice}>
    {selected && <span className="route-selected-label"><PlannerIcon name="pin" size={13} />{copy(locale, '已選取 · 地圖顯示中', 'Selected on map')}</span>}
    <span className="route-option-top"><RouteSymbols route={route} locale={locale} /><span className="route-duration">{live && !ended && <PlannerIcon name="signal" size={17} />}{journeyMinutes(route)}<small>min</small></span></span>
    <FareComparison routes={[route]} locale={locale} profile={profile} selectedLabel={selectedLabel} />
    <WalkTime routes={[route]} locale={locale} /><CorridorLabels route={route} locale={locale} />
    {route.departureTime && route.arrivalTime && <span className="route-clock-line">{hongKongTimeLabel(route.departureTime)} → {hongKongTimeLabel(route.arrivalTime)} <small>HKT</small></span>}
    <span className="route-service-line">{ended ? <span className="service-ended">{copy(locale, '暫無班次', 'No upcoming service')}</span>
      : isWalk ? copy(locale, '全程步行', 'Walk all the way')
        : live ? <><PlannerIcon name="signal" size={13} /><span>{copy(locale, '約 ', 'in ')}{first.realtimeEta?.etaMinutes} {copy(locale, '分鐘到站', 'min from')} {first.originStop?.name}</span><DepartureBadge departure={first.liveDepartures?.[0] ?? { status: 'LIVE' }} locale={locale} /></>
          : first?.serviceStatus === 'UNVERIFIED' ? <span>{copy(locale, '班次未能核實 · 時間估算', 'Service unverified · estimated times')}</span>
            : first?.departureTime ? <span><DepartureBadge departure={first.liveDepartures?.[0] ?? { status: 'TIMETABLE' }} locale={locale} /> {copy(locale, '上車 ', 'Board at ')}{hongKongTimeLabel(first.departureTime)}</span>
              : <span>{copy(locale, '班距約 ', 'Every ')}{first?.scheduledIntervalMinutes ?? 12} min</span>}</span>
  </button>;
}

function JourneyChoiceGroup({ group, locale, onSelect, onPreview, selectedId }: { group: JourneyGroup; locale: PlannerLocale; onSelect: (route: ScoredRoute) => void; onPreview: (route: ScoredRoute) => void; selectedId?: string }) {
  const profile = useContext(FareProfileContext);
  const selectedLabel = useContext(FareLabelContext);
  const best = group.routes[0];
  const selectedRoute = group.routes.find(route => route.id === selectedId);
  if (group.routes.length === 1) return <JourneyRow route={best} locale={locale} onSelect={() => onSelect(best)} selected={Boolean(selectedRoute)} />;
  const choices = combinedLegChoices(group);
  return <details className={'combined-journeys' + (selectedRoute ? ' is-selected' : '')}>
    <summary className="combined-journey-summary" onClick={() => onPreview(selectedRoute ?? best)}>
      <span className="journey-card-labels"><span className="combined-card-label"><PlannerIcon name="layers" size={13} />{copy(locale, '合併路線', 'Combined routes')}</span>
        {selectedRoute && <span className="route-selected-label"><PlannerIcon name="pin" size={13} />{copy(locale, '已選取 · 地圖顯示中', 'Selected on map')}</span>}</span>
      <span className="route-option-top"><span className="combined-option-count">{group.routes.length} {copy(locale, '個行程', 'journeys')}</span>
        <span className="route-duration">{groupDurationLabel(group)}<small>min</small></span></span>
      <FareComparison routes={group.routes} locale={locale} profile={profile} selectedLabel={selectedLabel} />
      <WalkTime routes={group.routes} locale={locale} /><CorridorLabels route={best} locale={locale} />
      <span className="combined-route-symbols">{choices ? <RouteSymbols route={best} locale={locale} choices={choices} compact />
        : group.routes.map((route, index) => <span className="combined-complete-path" key={route.id}>{index > 0 && <small>{copy(locale, '或', 'or')}</small>}<RouteSymbols route={route} locale={locale} /></span>)}</span>
      <span className="combined-stop-pair">{best.legs[0].originStop?.name} → {best.legs.at(-1)?.destinationStop?.name}</span>
      {selectedRoute && <span className="combined-selected-journey">{copy(locale, '地圖行程：', 'Map journey: ')}{selectedRoute.legs.map(leg => leg.routeNumber || modeLabel(leg.mode, locale)).join(' → ')}</span>}
      {best.departureTime && best.arrivalTime && <span className="route-clock-line">{copy(locale, '首選 ', 'Top option ')}{hongKongTimeLabel(best.departureTime)} → {hongKongTimeLabel(best.arrivalTime)} <small>HKT</small></span>}
      <span className="combined-expand-label">{copy(locale, '相同上落車及轉乘站 · 查看行程', 'Same boarding, alighting and transfer stops · View journeys')}<PlannerIcon name="chevron" size={13} /></span>
    </summary>
    <div className="combined-journey-options" role="group" aria-label={copy(locale, '選擇完整行程', 'Choose a complete journey')}>
      {group.routes.map(route => <JourneyRow key={route.id} route={route} locale={locale} onSelect={() => onSelect(route)} selected={route.id === selectedId} />)}
    </div>
  </details>;
}

function JourneySortControl({ value, onChange, fareBasis, onFareBasis, locale }: { value: JourneySort; onChange: (value: JourneySort) => void; fareBasis: 'adult' | 'selected'; onFareBasis: (value: 'adult' | 'selected') => void; locale: PlannerLocale }) {
  return <label className="journey-sort"><span>{copy(locale, '排序', 'Sort by')}</span>
    <select aria-label={copy(locale, '行程排序', 'Sort journeys')} value={value === 'cheapest' ? 'cheapest:' + fareBasis : value} onChange={event => {
      const [sort, fare] = event.target.value.split(':'); if (fare) onFareBasis(fare as 'adult' | 'selected'); onChange(sort as JourneySort);
    }}>
      <option value="recommended">{copy(locale, '建議排序', 'Recommended')}</option>
      <option value="fastest">{copy(locale, '最快', 'Fastest')}</option>
      <option value="cheapest:selected">{copy(locale, '所選付款最便宜', 'Cheapest selected fare')}</option>
      <option value="cheapest:adult">{copy(locale, '普通成人最便宜', 'Cheapest normal adult')}</option>
      <option value="transfers">{copy(locale, '最少轉乘', 'Fewest transfers')}</option>
      <option value="walking">{copy(locale, '最少步行', 'Least walking')}</option>
    </select>
  </label>;
}

export function PlannerBoard({ routes, searchPanel, emptyHint, endpoints, places, onMapPick, fareProfile, selectedFareLabel, preferences, time, weights, comparisons, locale = 'zh' }: {
  routes: ScoredRoute[];
  searchPanel: ReactNode;
  emptyHint?: string;
  endpoints: { origin: PlaceResult; destination: PlaceResult } | null;
  places: JourneyLocations;
  onMapPick: (lat: number, lng: number) => void;
  locale?: PlannerLocale;
  fareProfile: FareProfile;
  selectedFareLabel?: string;
  preferences: RoutePreferences;
  time: JourneyTimeSelection;
  weights: RouteWeights;
  comparisons: ComparisonPreferences;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [sort, setSort] = useState<JourneySort>('recommended');
  const [sortFare, setSortFare] = useState<'adult' | 'selected'>('selected');
  const comparisonModes = comparisonTypes.filter(type => comparisons[type.id]).map(type => type.id);
  const travel = useTravelOptions(endpoints ?? { origin: null, destination: null }, comparisonModes);
  const [travelMode, setTravelMode] = useState<TravelMode | null>(null);
  const selectedTravel = travel.options.find(option => option.mode === travelMode && option.available);
  const sidebar = useRef<HTMLDivElement>(null);
  useEffect(() => { setSelectedId(current => routes.some(route => route.id === current) ? current : routes.find(route => route.legs.some(leg => leg.mode !== 'WALK'))?.id ?? ''); }, [routes]);
  useEffect(() => { setTravelMode(null); setShowDetails(false); }, [travel.key]);
  const selected = routes.find(route => route.id === selectedId && route.legs.some(leg => leg.mode !== 'WALK')) ?? routes.find(route => route.legs.some(leg => leg.mode !== 'WALK'));
  const recommended = routes.filter(route => !hasEndedService(route) && route.legs.some(leg => leg.mode !== 'WALK'));
  const ended = routes.filter(hasEndedService);
  const recommendedGroups = groupJourneysByStops(recommended, sort, sortFare === 'adult' ? 'adult' : fareProfile, preferences);
  const endedGroups = groupJourneysByStops(ended, sort, sortFare === 'adult' ? 'adult' : fareProfile, preferences);
  const mapPlaces = endpoints ?? places;
  function choose(route: ScoredRoute) {
    setTravelMode(null);
    setSelectedId(route.id); setShowDetails(true);
    sidebar.current?.scrollTo({ top: 0, behavior: 'instant' });
  }
  function preview(route: ScoredRoute) {
    setTravelMode(null);
    setSelectedId(route.id);
  }
  return <FareProfileContext.Provider value={fareProfile}><FareLabelContext.Provider value={selectedFareLabel}><div className="planner-layout">{searchPanel}<div className={'planner-workspace' + (showMap ? ' map-visible' : '')}>
    <div className="planner-sidebar-scroll" ref={sidebar}>
      {showDetails && selectedTravel ? <TravelOptionDetails key={travel.key + selectedTravel.mode} option={selectedTravel} places={mapPlaces} locale={locale} time={time} profile={fareProfile}
        onBack={() => { setShowDetails(false); setTravelMode(null); }} onMap={() => setShowMap(true)} /> : showDetails && selected ? <section className="trip-panel" id="journey-details" aria-label={copy(locale, '行程詳情', 'Journey details')}>
        <div className="trip-heading"><button type="button" className="all-results-button" onClick={() => { setShowDetails(false); sidebar.current?.scrollTo({ top: 0 }); }}><span>{copy(locale, '所有行程結果', 'All journey results')}</span><PlannerIcon name="chevron" size={14} /></button><JourneyEndpoints places={mapPlaces} originFallback={selected.legs[0]?.originStop?.name} destinationFallback={selected.legs.at(-1)?.destinationStop?.name} /></div>
        <div className="trip-summary"><RouteSymbols route={selected} locale={locale} /><span className="trip-walk"><PlannerIcon name="walk" size={17} />{selected.legs.every(leg => leg.mode === 'WALK') ? journeyMinutes(selected) : selected.walkTransferTimeMinutes} min</span><span className="route-duration">{journeyMinutes(selected)}<small>min</small></span></div>
        <div className="trip-fare-comparison"><FareComparison routes={[selected]} locale={locale} profile={fareProfile} selectedLabel={selectedFareLabel} /></div>
        <button type="button" className="mobile-map-toggle" onClick={() => setShowMap(true)}><PlannerIcon name="monitor" size={15} />{copy(locale, '顯示地圖', 'Show Map')}</button>
        <RouteDetails route={selected} locale={locale} weights={weights} profile={fareProfile} selectedFareLabel={selectedFareLabel} />
      </section> : <>
        <button type="button" className="mobile-map-toggle" onClick={() => setShowMap(true)}><PlannerIcon name="monitor" size={15} />{copy(locale, '顯示地圖', 'Show Map')}</button>
        <section className="results-pane" id="routes" aria-label={copy(locale, '行程選擇', 'Journey options')}>
          {endpoints && comparisonModes.length > 0 && <><QuickTravelOptions options={travel.options} modes={comparisonModes} loading={travel.loading} locale={locale} onChoose={option => { setTravelMode(option.mode); setShowDetails(true); sidebar.current?.scrollTo({ top: 0 }); }} />
            <p className="quick-mode-note">{copy(locale, '按道路／路徑估算，非即時交通；「—」表示未有可用路徑。', 'Road/path estimates, not live traffic. “—” means no route is available.')}</p></>}
          {routes.length > 0 ? <>
            {recommendedGroups.length > 0 && <div className="route-group"><div className="route-group-heading"><h2>{copy(locale, '建議', 'Suggested')}</h2><JourneySortControl value={sort} onChange={setSort} fareBasis={sortFare} onFareBasis={setSortFare} locale={locale} /></div><div className="route-list">{(showAllRoutes ? recommendedGroups : recommendedGroups.slice(0, 12)).map(group => <JourneyChoiceGroup key={group.id} group={group} locale={locale} onSelect={choose} onPreview={preview} selectedId={selected?.id} />)}</div>
              {recommendedGroups.length > 12 && <button type="button" className="more-journeys" onClick={() => setShowAllRoutes(value => !value)}>{showAllRoutes ? copy(locale, '顯示較少路線', 'Show fewer options') : copy(locale, '顯示全部 ', 'Show all ') + recommendedGroups.length + copy(locale, ' 組行程', ' journey groups')}</button>}</div>}
            {endedGroups.length > 0 && <div className="route-group"><div className="route-group-heading"><h2>{copy(locale, '暫無班次', 'No upcoming service')}</h2>{recommendedGroups.length === 0 && <JourneySortControl value={sort} onChange={setSort} fareBasis={sortFare} onFareBasis={setSortFare} locale={locale} />}</div><div className="route-list">{endedGroups.map(group => <JourneyChoiceGroup key={group.id} group={group} locale={locale} onSelect={choose} onPreview={preview} selectedId={selected?.id} />)}</div></div>}
            <p className="route-estimate-note">{copy(locale, '車程及票價為估算，路線按你的權重排列。', 'Times and fares are estimates. Routes use your weighted ranking.')} <a href="/coverage">{copy(locale, '交通資料涵蓋範圍', 'Transport coverage')}</a></p>
            <p className="route-estimate-note">{copy(locale, '月票價假設已有有效九巴月票及足夠每日乘車額，不包括購買月票費用。無月票價為普通成人車費。', 'Pass fares assume a valid KMB Monthly Pass and sufficient daily rides; the pass purchase price is separate. Without-pass fares are normal adult fares.')} <a href={KMB_PASS_RULES.sourceUrl} target="_blank" rel="noreferrer">{copy(locale, '九巴月票條款', 'KMB pass terms')}</a></p>
            <p className="route-estimate-note">{copy(locale, '學生價假設有效學生身分八達通，採用港鐵公布的學生起訖票價。其他公司未核實的學生優惠不作假設，暫採成人價。機場快綫不適用學生乘車優惠。', 'Student fares assume valid Student Octopus status and use published MTR student OD fares. Unverified student offers on other operators use adult fares. The Student Travel Scheme does not cover Airport Express.')} <a href={STUDENT_FARE_SOURCE} target="_blank" rel="noreferrer">{copy(locale, '學生乘車優惠', 'Student scheme')}</a></p>
          </> : <p className="map-instruction" role="status">{emptyHint}</p>}
        </section>
      </>}
    </div>
    <div className="map-pane">
      <JourneyMap route={selectedTravel ? undefined : selected} travel={selectedTravel} places={mapPlaces} onPick={onMapPick} locale={locale} />
      <button type="button" className="mobile-close-map" onClick={() => setShowMap(false)}><PlannerIcon name="back" size={17} />{copy(locale, '返回行程', 'Back to journeys')}</button>
    </div>
  </div></div></FareLabelContext.Provider></FareProfileContext.Provider>;
}
