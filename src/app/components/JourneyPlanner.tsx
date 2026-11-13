'use client';

import { useEffect, useRef, useState } from 'react';
import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import type { PlaceResult } from './PlaceAutocomplete';
import { JourneyPlaceSearch } from './JourneyPlaceSearch';
import { PlannerBoard } from './PlannerBoard';
import { PlannerIcon } from './PlannerIcon';
import { HongKongArtwork } from './HongKongArtwork';
import { LiveTransitSearch } from './LiveTransitSearch';
import { copy, type JourneyField, type JourneyLocations, type PlannerLocale } from './plannerUi';

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
  const [arrivalsOpen, setArrivalsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [places, setPlaces] = useState<JourneyLocations>({ origin: null, destination: null });
  const [activeField, setActiveField] = useState<JourneyField>('origin');
  const [endpoints, setEndpoints] = useState<{ origin: PlaceResult; destination: PlaceResult } | null>(null);
  const activeSearch = useRef<AbortController | null>(null);
  const arrivalsDialog = useRef<HTMLDialogElement>(null);
  const menuDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => () => activeSearch.current?.abort(), []);
  useEffect(() => { if (menuOpen) menuDialog.current?.showModal(); else menuDialog.current?.close(); }, [menuOpen]);
  useEffect(() => { if (arrivalsOpen) arrivalsDialog.current?.showModal(); else arrivalsDialog.current?.close(); }, [arrivalsOpen]);

  function resetJourney() {
    activeSearch.current?.abort(); activeSearch.current = null;
    setSearching(false); setRoutes([]); setMeta(null); setSearched(false); setError(null); setEndpoints(null);
  }

  async function handleSearch(origin: PlaceResult, destination: PlaceResult) {
    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    setSearching(true); setError(null); setRoutes([]); setMeta(null); setSearched(false);
    setEndpoints({ origin, destination });
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const params = new URLSearchParams({ fromLat: String(origin.lat), fromLon: String(origin.lng), toLat: String(destination.lat), toLon: String(destination.lng), lang: locale });
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

  function swap() {
    resetJourney();
    const next = { origin: places.destination, destination: places.origin };
    setPlaces(next);
    if (next.origin && next.destination) void handleSearch(next.origin, next.destination);
  }

  function pickMapPoint(lat: number, lng: number) {
    const name = lat.toFixed(5) + ', ' + lng.toFixed(5);
    selectPlace(activeField, { id: 'map-' + name, name, address: copy(locale, '地圖所選位置', 'Selected map location'), lat, lng, type: 'map', googleMapsUrl: '' });
  }

  const uncovered = meta?.originUncovered || meta?.destinationUncovered;
  const allClosed = routes.length > 0 && routes.every(route => route.legs.some(leg => leg.serviceEnded));
  const notice = uncovered
    ? copy(locale, (meta?.originUncovered ? '起點' : '目的地') + '附近沒有可規劃的公共交通站點。', 'No supported public transport stops were found near your ' + (meta?.originUncovered ? 'origin' : 'destination') + '.')
    : meta?.tooCloseToRide ? copy(locale, '兩個地點很接近，步行即可到達。', 'These places are close enough to walk between.')
      : allClosed ? copy(locale, '行程有已收班的路段，請留意服務狀態。', 'These options contain ended services. Check service status before travelling.')
        : searched && routes.length === 0 ? copy(locale, '未找到時間表內可用的連接（最多三次轉乘），可嘗試附近站點。', 'No available connection was found within three transfers. Try nearby stops.') : null;
  const emptyHint = searching ? copy(locale, '正在搜尋…', 'Thinking…') : searched ? copy(locale, '未找到可規劃的公共交通路線', 'No supported transit journey found')
    : activeField === 'origin' ? copy(locale, '點選地圖設定起點', 'Click the map to set Start') : copy(locale, '點選地圖設定目的地', 'Click the map to set End');

  const searchPanel = <aside className="planner-sidebar" id="journey">
    <div className="city-banner"><HongKongArtwork /><div><h1>Hong Kong</h1><button type="button" className="city-switch" disabled title={copy(locale, '目前提供香港路線規劃', 'Journey planning currently covers Hong Kong')}>{copy(locale, '切換城市', 'Switch City')}</button></div></div>
    <JourneyPlaceSearch places={places} onInput={editPlace} onSelect={selectPlace} onFocus={setActiveField}
      onSwap={swap} onSearch={() => { if (places.origin && places.destination) void handleSearch(places.origin, places.destination); }}
      searching={searching} locale={locale} />
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
      places={places} onMapPick={pickMapPoint} locale={locale} />
    <dialog className="menu-dialog" ref={menuDialog} onCancel={() => setMenuOpen(false)} onClose={() => setMenuOpen(false)}>
      <div className="dialog-heading"><strong>Transit Compass HK</strong><button type="button" onClick={() => setMenuOpen(false)} aria-label={copy(locale, '關閉選單', 'Close menu')}><PlannerIcon name="close" size={22} /></button></div>
      <nav aria-label={copy(locale, '更多選項', 'More options')}><a href={locale === 'en' ? '/en' : '/'}>{copy(locale, '規劃行程', 'Get Me Somewhere')}</a><button type="button" onClick={() => { setMenuOpen(false); setArrivalsOpen(true); }}>{copy(locale, '到站時間', 'Live arrivals')}</button><a href="/traffic">{copy(locale, '交通消息', 'Service alerts')}</a><a href="/updates">{copy(locale, '路線更新', 'Route updates')}</a><a href={locale === 'en' ? '/' : '/en'}>{locale === 'en' ? '繁體中文' : 'English'}</a></nav>
      <details className="weight-method"><summary>{copy(locale, '路線權重', 'Route weighting')}<PlannerIcon name="chevron" size={14} /></summary>
        <p>{copy(locale, '使用原有權重公式，分數越低越優先。', 'Your original weighted formula is unchanged. Lower scores rank first.')}</p>
        <p>{copy(locale, '每次轉乘 +8；候車倍率：繁忙 1.0、非繁忙 1.3、深夜 1.8。', 'Each transfer adds 8. Waiting multipliers: peak 1.0, off-peak 1.3, overnight 1.8.')}</p>
        <p>KMB −1 · LWB −0.46 · MTR +0.5 · CTB +1</p>
      </details>
      <div className="menu-footnote"><a href="/coverage">{copy(locale, '交通資料涵蓋範圍', 'Transport coverage')}</a><p><a href="/api/sources">{copy(locale, '資料來源及鳴謝', 'Data sources & attribution')}</a></p><p>{copy(locale, '獨立交通規劃原型。鐵路、巴士、小巴、電車、渡輪及步行。車程及票價為估算。', 'Independent transit prototype. Rail, buses, minibuses, trams, ferries and walking. Times and fares are estimates.')}</p></div>
    </dialog>
    <dialog className="arrivals-dialog" ref={arrivalsDialog} onCancel={() => setArrivalsOpen(false)} onClose={() => setArrivalsOpen(false)}>
      <div className="dialog-heading"><h2>{copy(locale, '查詢車站到站時間', 'Station arrivals')}</h2><button type="button" onClick={() => setArrivalsOpen(false)} aria-label={copy(locale, '關閉到站時間', 'Close arrivals')}><PlannerIcon name="close" size={22} /></button></div><LiveTransitSearch locale={locale} />
    </dialog>
  </main>;
}
