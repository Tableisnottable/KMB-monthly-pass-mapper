'use client';

import { transportFetch as fetch } from '../../browser/transportClient';

import { useEffect, useRef, useState } from 'react';
import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import type { PlaceResult } from './PlaceAutocomplete';
import { JourneyPlaceSearch } from './JourneyPlaceSearch';
import { PlannerBoard } from './PlannerBoard';
import { PlannerIcon } from './PlannerIcon';
import { HongKongArtwork } from './HongKongArtwork';
import { LiveTransitSearch } from './LiveTransitSearch';
import { copy, type JourneyField, type JourneyLocations, type PlannerLocale } from './plannerUi';
import { type JourneyTimeSelection } from '../../engine/journeyTime';
import { FareProfileControl } from './FareProfileControl';
import type { FareProfile } from '../../domain/journeyFares';
import { JourneyPreferences, defaultCompanies } from './JourneyPreferences';
import { DEFAULT_PREFERENCES, type RoutePreferences } from '../../domain/routePreferences';
import { DEFAULT_WEIGHTS, customWeights, type RouteWeights } from '../../engine/routeWeights';
import { RouteWeightSettings } from './RouteWeightSettings';

interface JourneyMeta {
  source?: string;
  live?: boolean;
  candidates?: number;
  durationMs?: number;
  tooCloseToRide?: boolean;
  originUncovered?: boolean;
  destinationUncovered?: boolean;
}

export function JourneyPlanner({ initialRoutes, locale = 'zh' }: { initialRoutes: ScoredRoute[]; locale?: PlannerLocale }) {
  const [routes, setRoutes] = useState(initialRoutes);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<JourneyMeta | null>(null);
  const [searched, setSearched] = useState(false);
  const [time, setTime] = useState<JourneyTimeSelection>({ mode: 'now', value: '' });
  const [fareProfile, setFareProfile] = useState<FareProfile>('adult');
  const [companies, setCompanies] = useState(defaultCompanies);
  const [preferences, setPreferences] = useState<RoutePreferences>({ ...DEFAULT_PREFERENCES });
  const [changeMinutes, setChangeMinutes] = useState(3);
  const [weights, setWeights] = useState<RouteWeights>({ ...DEFAULT_WEIGHTS });
  const [arrivalsOpen, setArrivalsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [places, setPlaces] = useState<JourneyLocations>({ origin: null, destination: null });
  const [activeField, setActiveField] = useState<JourneyField>('origin');
  const [endpoints, setEndpoints] = useState<{ origin: PlaceResult; destination: PlaceResult } | null>(null);
  const activeSearch = useRef<AbortController | null>(null);
  const arrivalsDialog = useRef<HTMLDialogElement>(null);
  const menuDialog = useRef<HTMLDialogElement>(null);
  const labelLookups = useRef(new Map<string, AbortController>());
  useEffect(() => () => activeSearch.current?.abort(), []);
  useEffect(() => () => { for (const controller of Array.from(labelLookups.current.values())) controller.abort(); }, []);
  useEffect(() => { if (menuOpen) menuDialog.current?.showModal(); else menuDialog.current?.close(); }, [menuOpen]);
  useEffect(() => { if (arrivalsOpen) arrivalsDialog.current?.showModal(); else arrivalsDialog.current?.close(); }, [arrivalsOpen]);

  function resetJourney() {
    activeSearch.current?.abort(); activeSearch.current = null;
    setSearching(false); setRoutes([]); setMeta(null); setSearched(false); setError(null); setEndpoints(null);
  }

  async function handleSearch(origin: PlaceResult, destination: PlaceResult, appliedWeights = weights) {
    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    setSearching(true); setError(null); setRoutes([]); setMeta(null); setSearched(false);
    setEndpoints({ origin, destination });
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const params = new URLSearchParams({ fromLat: String(origin.lat), fromLon: String(origin.lng), toLat: String(destination.lat), toLon: String(destination.lng), lang: locale });
      params.set('timeMode', time.mode);
      params.set('operators', Object.entries(companies).filter(([, level]) => level !== 'ban').map(([id]) => id).join(','));
      params.set('requiredOperators', Object.entries(companies).filter(([, level]) => level === 'must').map(([id]) => id).join(','));
      params.set('weights', JSON.stringify(appliedWeights)); params.set('preferences', JSON.stringify(preferences)); params.set('changeMinutes', String(changeMinutes));
      if (time.mode !== 'now') params.set('time', time.value + ':00+08:00');
      const response = await fetch('/api/journey?' + params, { cache: 'no-store', signal: controller.signal });
      const payload = await response.json() as { data?: ScoredRoute[]; meta?: JourneyMeta; error?: string };
      if (!response.ok || !Array.isArray(payload.data)) throw new Error(payload.error ?? copy(locale, '暫時無法搜尋行程。', 'Journey search is temporarily unavailable.'));
      if (activeSearch.current !== controller) return;
      setRoutes(payload.data); setMeta(payload.meta ?? null); setSearched(true);
    } catch (err) {
      if (activeSearch.current !== controller) return;
      setError(controller.signal.aborted
        ? copy(locale, '路線搜尋逾時，請再試一次。', 'Journey search timed out. Please try again.')
        : err instanceof Error ? err.message : copy(locale, '搜尋失敗，請再試一次。', 'Search failed. Please try again.'));
    } finally {
      window.clearTimeout(timeout);
      if (activeSearch.current === controller) { setSearching(false); activeSearch.current = null; }
    }
  }

  function selectPlace(field: JourneyField, place: PlaceResult) {
    resetJourney();
    const next = { ...places, [field]: place };
    setPlaces(next);
    if (field === 'origin') setActiveField('destination');
    if (next.origin && next.destination) void handleSearch(next.origin, next.destination);
  }

  function editPlace(field: JourneyField) {
    resetJourney(); setPlaces(current => ({ ...current, [field]: null })); setActiveField(field);
  }

  async function resolveMapLabel(place: PlaceResult) {
    const controller = new AbortController(); labelLookups.current.set(place.id, controller);
    try {
      const response = await fetch('/api/place-label?' + new URLSearchParams({ lat: String(place.lat), lon: String(place.lng), lang: locale }), { signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json() as { name: string; address: string };
      if (!data.name || controller.signal.aborted) return;
      const rename = (value: PlaceResult | null) => value?.id === place.id ? { ...value, name: data.name, address: data.address } : value;
      setPlaces(current => ({ origin: rename(current.origin), destination: rename(current.destination) }));
      setEndpoints(current => current ? { origin: rename(current.origin)!, destination: rename(current.destination)! } : current);
    } catch { /* Keep readable map-point labels when reverse lookup is offline. */ }
    finally { labelLookups.current.delete(place.id); }
  }

  function swap() {
    resetJourney();
    const next = { origin: places.destination, destination: places.origin };
    setPlaces(next);
    if (next.origin && next.destination) void handleSearch(next.origin, next.destination);
  }

  function pickMapPoint(lat: number, lng: number) {
    const name = activeField === 'origin' ? copy(locale, '地圖所選起點', 'Start selected on map') : copy(locale, '地圖所選目的地', 'Destination selected on map');
    const place: PlaceResult = { id: 'map-' + lat + ',' + lng + '-' + Date.now(), name,
      address: copy(locale, '正在查找街道及鄰近地標…', 'Finding the street and nearby landmarks…'), lat, lng, type: 'map', googleMapsUrl: '' };
    selectPlace(activeField, place); void resolveMapLabel(place);
  }

  const uncovered = meta?.originUncovered || meta?.destinationUncovered;
  const allClosed = routes.length > 0 && routes.every(route => route.legs.some(leg => leg.serviceEnded));
  const notice = uncovered
    ? copy(locale, (meta?.originUncovered ? '起點' : '目的地') + '附近沒有可規劃的公共交通站點。', 'No supported public transport stops were found near your ' + (meta?.originUncovered ? 'origin' : 'destination') + '.')
    : meta?.tooCloseToRide ? copy(locale, '兩個地點很接近，步行即可到達。', 'These places are close enough to walk between.')
      : allClosed ? copy(locale, '行程有已收班的路段，請留意服務狀態。', 'These options contain ended services. Check service status before travelling.')
        : searched && routes.length === 0 ? copy(locale, '目前公司、轉乘及時間設定下未找到可用的連接（最多三次轉乘）。請放寬設定或嘗試附近站點。', 'No connection was found with these company, transfer and time settings (up to three transfers). Relax the settings or try nearby stops.') : null;
  const emptyHint = searching ? copy(locale, '正在搜尋…', 'Thinking…') : searched ? copy(locale, '未找到可規劃的公共交通路線', 'No supported transit journey found')
    : activeField === 'origin' ? copy(locale, '點選地圖設定起點', 'Click the map to set Start') : copy(locale, '點選地圖設定目的地', 'Click the map to set End');

  const searchPanel = <aside className="planner-sidebar" id="journey">
    <div className="city-banner"><HongKongArtwork /><div><h1>Hong Kong</h1><button type="button" className="city-switch" disabled title={copy(locale, '目前提供香港路線規劃', 'Journey planning currently covers Hong Kong')}>{copy(locale, '切換城市', 'Switch City')}</button></div></div>
    <FareProfileControl value={fareProfile} onChange={setFareProfile} locale={locale} />
    <JourneyPlaceSearch places={places} onInput={editPlace} onSelect={selectPlace} onFocus={setActiveField}
      onSwap={swap} onSearch={() => { if (places.origin && places.destination) void handleSearch(places.origin, places.destination); }}
      searching={searching} locale={locale} time={time} onTimeChange={value => { resetJourney(); setTime(value); }} />
    <JourneyPreferences companies={companies} onCompanies={value => { resetJourney(); setCompanies(value); }}
      corridors={preferences} onCorridors={value => { resetJourney(); setPreferences(value); }} changeMinutes={changeMinutes}
      onChangeMinutes={value => { resetJourney(); setChangeMinutes(value); }} locale={locale} />
    {customWeights(weights) && <p className="planner-notice notice-warning">{copy(locale, '自訂重要性正在影響推薦排序。可在選單還原預設。', 'Custom importance is affecting recommendations. Reset it in the menu if needed.')}</p>}
    {error && <p className="planner-notice notice-error" role="alert">{error}</p>}
    {notice && <p className="planner-notice notice-warning" role="status">{notice}</p>}
  </aside>;

  return <main className="compass-app" lang={locale === 'en' ? 'en' : 'zh-HK'}>
    <a className="planner-skip-link" href="#journey">{copy(locale, '跳至行程規劃', 'Skip to journey planner')}</a>
    <header className="app-header">
      <div className="header-brand-group">
        <button type="button" className="header-menu-button" onClick={() => setMenuOpen(true)} aria-label={copy(locale, '開啟選單', 'Open menu')}><PlannerIcon name="menu" size={24} /></button>
        <a className="app-brand" href={locale === 'en' ? '/en' : '/'} aria-label="Transit Compass HK"><span className="brand-symbol"><PlannerIcon name="arrow" size={20} /></span><span>Transit Compass</span></a>
      </div>
      <nav className="header-actions" aria-label={copy(locale, '主選單', 'Main navigation')}>
        <a href={locale === 'en' ? '/' : '/en'} className="language-button" aria-label={locale === 'en' ? '繁體中文' : 'English'}>{locale === 'en' ? '中' : 'EN'}</a>
        <button type="button" onClick={() => setArrivalsOpen(true)} aria-label={copy(locale, '到站時間', 'Live arrivals')} title={copy(locale, '到站時間', 'Live arrivals')}><PlannerIcon name="clock" size={21} /></button>
        <a className="get-somewhere" href={locale === 'en' ? '/en' : '/'}><PlannerIcon name="monitor" size={23} /><span>{copy(locale, '帶我去目的地', 'Get Me Somewhere')}</span></a>
      </nav>
    </header>
    <PlannerBoard routes={routes} searchPanel={searchPanel} emptyHint={emptyHint} endpoints={endpoints}
      places={places} onMapPick={pickMapPoint} locale={locale} fareProfile={fareProfile} preferences={preferences} time={time} weights={weights} />
    <dialog className="menu-dialog" ref={menuDialog} onCancel={() => setMenuOpen(false)} onClose={() => setMenuOpen(false)}>
      <div className="dialog-heading"><strong>Transit Compass HK</strong><button type="button" onClick={() => setMenuOpen(false)} aria-label={copy(locale, '關閉選單', 'Close menu')}><PlannerIcon name="close" size={22} /></button></div>
      <nav aria-label={copy(locale, '更多選項', 'More options')}><a href={locale === 'en' ? '/en' : '/'}>{copy(locale, '規劃行程', 'Get Me Somewhere')}</a><button type="button" onClick={() => { setMenuOpen(false); setArrivalsOpen(true); }}>{copy(locale, '到站時間', 'Live arrivals')}</button><a href={'/timetables?lang=' + locale}>{copy(locale, '營辦商及班次時間表', 'Companies & timetables')}</a><a href="/traffic">{copy(locale, '道路交通消息', 'Road traffic')}</a><a href="/updates">{copy(locale, '巴士服務消息', 'Bus service updates')}</a><a href={'/install?lang=' + locale}>{copy(locale, '安裝 App', 'Install app')}</a><a href={locale === 'en' ? '/' : '/en'}>{locale === 'en' ? '繁體中文' : 'English'}</a></nav>
      <details className="weight-method"><summary>{copy(locale, '路線權重', 'Route weighting')}<PlannerIcon name="chevron" size={14} /></summary>
        <RouteWeightSettings value={weights} locale={locale} onApply={value => { setWeights(value); setMenuOpen(false); resetJourney(); if (places.origin && places.destination) void handleSearch(places.origin, places.destination, value); }} />
      </details>
      <div className="menu-footnote"><a href="/coverage">{copy(locale, '交通資料涵蓋範圍', 'Transport coverage')}</a><p><a href="/api/sources">{copy(locale, '資料來源及鳴謝', 'Data sources & attribution')}</a></p><p>{copy(locale, '獨立交通規劃原型。鐵路、巴士、小巴、電車、渡輪及步行。車程及票價為估算。', 'Independent transit prototype. Rail, buses, minibuses, trams, ferries and walking. Times and fares are estimates.')}</p></div>
    </dialog>
    <dialog className="arrivals-dialog" ref={arrivalsDialog} onCancel={() => setArrivalsOpen(false)} onClose={() => setArrivalsOpen(false)}>
      <div className="dialog-heading"><h2>{copy(locale, '查詢車站到站時間', 'Station arrivals')}</h2><button type="button" onClick={() => setArrivalsOpen(false)} aria-label={copy(locale, '關閉到站時間', 'Close arrivals')}><PlannerIcon name="close" size={22} /></button></div><LiveTransitSearch locale={locale} />
    </dialog>
  </main>;
}
