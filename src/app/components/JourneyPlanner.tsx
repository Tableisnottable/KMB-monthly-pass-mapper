'use client';

import { useEffect, useRef, useState } from 'react';
import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import type { PlaceResult } from './PlaceAutocomplete';
import { JourneyPlaceSearch } from './JourneyPlaceSearch';
import { PlannerBoard } from './PlannerBoard';
import { PlannerIcon } from './PlannerIcon';
import { LiveTransitSearch } from './LiveTransitSearch';
import { copy, type PlannerLocale } from './plannerUi';

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
  const [endpoints, setEndpoints] = useState<{ origin: PlaceResult; destination: PlaceResult } | null>(null);
  const activeSearch = useRef<AbortController | null>(null);
  const arrivalsDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => () => activeSearch.current?.abort(), []);
  useEffect(() => {
    if (arrivalsOpen) arrivalsDialog.current?.showModal();
    else arrivalsDialog.current?.close();
  }, [arrivalsOpen]);

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
      const params = new URLSearchParams({ fromLat: String(origin.lat), fromLon: String(origin.lng), toLat: String(destination.lat), toLon: String(destination.lng) });
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

  const uncovered = meta?.originUncovered || meta?.destinationUncovered;
  const allClosed = routes.length > 0 && routes.every(route => route.legs.some(leg => leg.serviceEnded));
  const notice = uncovered
    ? copy(locale, (meta?.originUncovered ? '起點' : '目的地') + '附近沒有可規劃的九巴或城巴站點，這一帶暫不在路線涵蓋範圍。', 'No supported KMB or Citybus stops were found near your ' + (meta?.originUncovered ? 'origin' : 'destination') + '. This area is outside current planning coverage.')
    : meta?.tooCloseToRide
      ? copy(locale, '兩個地點很接近，步行即可到達。', 'These places are close enough to walk between.')
      : allClosed ? copy(locale, '每個行程都有已收班的路段，請留意下方服務狀態。', 'Every option has an ended service. Check service status before travelling.') : null;
  const emptyHint = searching ? copy(locale, '正在尋找你的路線…', 'Finding your way…') : searched ? copy(locale, '未找到可用路線', 'No routes found') : undefined;

  return <main className="compass-app" lang={locale === 'en' ? 'en' : 'zh-HK'}>
    <header className="app-header">
      <a className="app-brand" href={locale === 'en' ? '/en' : '/'}><span className="brand-symbol"><PlannerIcon name="compass" size={25} /></span><span>transit<span className="brand-light">compass</span><small>HONG KONG</small></span></a>
      <nav className="desktop-nav" aria-label={copy(locale, '主選單', 'Main navigation')}><a href="#journey" className="nav-active">{copy(locale, '規劃行程', 'Journey planner')}</a><button type="button" onClick={() => setArrivalsOpen(true)}>{copy(locale, '到站時間', 'Live arrivals')}</button><a href="/traffic">{copy(locale, '交通消息', 'Service alerts')}</a></nav>
      <div className="header-right"><span className="header-region"><span />HONG KONG</span><a className="language-button" href={locale === 'en' ? '/' : '/en'}>{locale === 'en' ? '繁中' : 'EN'}</a></div>
    </header>
    <div className="workspace-topline"><span><PlannerIcon name="pin" size={14} />{copy(locale, '香港出行，從這裡開始。', 'The city is yours. Let’s find your way.')}</span><span>{copy(locale, '九巴 · 城巴 · 步行', 'KMB · Citybus · Walking')}</span></div>
    <div className="planner-workspace">
      <aside className="planner-sidebar" id="journey">
        <div className="search-intro"><span className="section-overline">{copy(locale, '由這一程開始', 'A GOOD DAY STARTS HERE')}</span><h1>{copy(locale, '下一站，去邊度？', 'Where are we going?')}</h1><p>{copy(locale, '比較路線，找到最適合你的一程。', 'A smarter way from here to there.')}</p></div>
        <JourneyPlaceSearch onSearch={handleSearch} onEdit={resetJourney} searching={searching} locale={locale} />
        <details className="weight-method"><summary><PlannerIcon name="layers" size={15} />{copy(locale, '使用現有權重評分', 'Your weighted route ranking')}<PlannerIcon name="chevron" size={13} /></summary><div>
          <p>{copy(locale, '總分 = 路段時間 + 候車成本 + 營辦商調整 + 步行 + 轉乘調整。分數越低越優先。', 'Score = travel time + waiting cost + operator adjustments + walking + transfer adjustments. Lower scores rank first.')}</p>
          <p>{copy(locale, '每次轉乘 +8；時段倍率：繁忙 1.0、非繁忙 1.3、深夜 1.8。', 'Each transfer adds 8. Waiting multipliers: peak 1.0, off-peak 1.3, overnight 1.8.')}</p>
          <p>KMB −1 · LWB −0.46 · MTR +0.5 · CTB +1</p>
        </div></details>
        {searching && <p className="planner-notice" role="status"><span className="planner-spinner" />{copy(locale, '正在查詢官方站點及班次…', 'Checking official stops and services…')}</p>}
        {error && <p className="planner-notice notice-error" role="alert">{error}</p>}
        {notice && <p className="planner-notice notice-warning" role="status">{notice}</p>}
        {searched && meta && routes.length > 0 && <p className="search-data-note">{copy(locale, '官方路線及 ETA · 車程及票價為估算', 'Official routes & ETA · travel time and fare estimated')}{typeof meta.durationMs === 'number' ? ' · ' + (meta.durationMs / 1000).toFixed(1) + 's' : ''}</p>}
      </aside>
      <PlannerBoard routes={routes} emptyHint={emptyHint} endpoints={endpoints} locale={locale} />
    </div>
    <footer className="app-footer"><span>TRANSIT COMPASS HK <span className="footer-dot">·</span> {copy(locale, '你的城市，你的方向。', 'Your city. Your way.')}</span><div><button type="button" onClick={() => setArrivalsOpen(true)}>{copy(locale, '到站時間', 'Live arrivals')}</button><a href="/updates">{copy(locale, '路線更新', 'Route updates')}</a><a href="/traffic">{copy(locale, '交通消息', 'Service alerts')}</a><a href="/api/sources">{copy(locale, '資料來源', 'Data sources')}</a><span>{copy(locale, '獨立交通規劃原型', 'Independent transit prototype')}</span></div></footer>
    <dialog className="arrivals-dialog" ref={arrivalsDialog} onCancel={() => setArrivalsOpen(false)} onClose={() => setArrivalsOpen(false)}>
      <div className="dialog-heading"><div><span className="section-overline">LIVE ARRIVALS</span><h2>{copy(locale, '查詢車站到站時間', 'Station arrivals')}</h2></div><button className="map-tool" type="button" onClick={() => setArrivalsOpen(false)} aria-label={copy(locale, '關閉到站時間', 'Close arrivals')}><PlannerIcon name="close" size={20} /></button></div><LiveTransitSearch />
    </dialog>
  </main>;
}
