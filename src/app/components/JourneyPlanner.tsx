'use client';

import { transportFetch as fetch } from '../../browser/transportClient';

import { useEffect, useRef, useState } from 'react';
import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import type { PlaceResult } from './PlaceAutocomplete';
import { JourneyPlaceSearch } from './JourneyPlaceSearch';
import { PlannerBoard } from './PlannerBoard';
import { PlannerIcon } from './PlannerIcon';
import { LiveTransitSearch } from './LiveTransitSearch';
import { copy, type JourneyField, type JourneyLocations, type PlannerLocale } from './plannerUi';
import { type JourneyTimeSelection } from '../../engine/journeyTime';
import type { FareProfile } from '../../domain/journeyFares';
import { JourneyPreferences, defaultCompanies, type SettingsSection, type CompanyPreferences } from './JourneyPreferences';
import { DEFAULT_PREFERENCES, corridorIds, roadLevel, type RoutePreferences } from '../../domain/routePreferences';
import { DEFAULT_WEIGHTS, customWeights, type RouteWeights } from '../../engine/routeWeights';
import { RouteWeightSettings } from './RouteWeightSettings';
import { DEFAULT_CHANGE_MINUTES, defaultComparisons, defaultTransport, type ComparisonPreferences, type TransportPreferences } from '../../domain/transportSelection';
import { activeCity, supportedCities } from '../../domain/cities';
import { useAutoRefresh } from './useAutoRefresh';
import { DEFAULT_LIMITS, type JourneyLimits } from '../../domain/journeyLimits';
import { PaymentControl } from './PaymentControl';
import { passActive, paymentChoices, paymentProfile, readPaymentPreferences, type OwnedPass, type PaymentChoice } from '../../domain/payment';
import coverageSnapshot from '../../data/transport/manifest.json';

interface JourneyMeta {
  source?: string;
  live?: boolean;
  candidates?: number;
  durationMs?: number;
  tooCloseToRide?: boolean;
  originUncovered?: boolean;
  destinationUncovered?: boolean;
}
type PlannerSettings = { companies: CompanyPreferences; transport: TransportPreferences; comparisons: ComparisonPreferences; preferences: RoutePreferences; changeMinutes: number; weights: RouteWeights; limits: JourneyLimits };
const defaultSettings = (): PlannerSettings => ({ companies: defaultCompanies(), transport: defaultTransport(), comparisons: defaultComparisons(), preferences: { ...DEFAULT_PREFERENCES }, changeMinutes: DEFAULT_CHANGE_MINUTES, weights: { ...DEFAULT_WEIGHTS }, limits: { ...DEFAULT_LIMITS } });

export function JourneyPlanner({ initialRoutes, locale = 'zh' }: { initialRoutes: ScoredRoute[]; locale?: PlannerLocale }) {
  const [routes, setRoutes] = useState(initialRoutes);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<JourneyMeta | null>(null);
  const [searched, setSearched] = useState(false);
  const [time, setTime] = useState<JourneyTimeSelection>({ mode: 'now', value: '' });
  const [payment, setPayment] = useState<PaymentChoice>('adult-octopus');
  const [passes, setPasses] = useState<OwnedPass[]>([]);
  const [paymentLoaded, setPaymentLoaded] = useState(false);
  const [dataUpdateAvailable, setDataUpdateAvailable] = useState(false);
  const fareProfile: FareProfile = payment === 'kmb-pass' && !passes.some(pass => pass.id === 'kmb' && passActive(pass)) ? 'unverified' : paymentProfile(payment);
  const paymentRow = paymentChoices.find(row => row[0] === payment)!;
  const selectedFareLabel = copy(locale, paymentRow[1], paymentRow[2]);
  const [companies, setCompanies] = useState(defaultCompanies);
  const [transport, setTransport] = useState(defaultTransport);
  const [comparisons, setComparisons] = useState(defaultComparisons);
  const [preferences, setPreferences] = useState<RoutePreferences>({ ...DEFAULT_PREFERENCES });
  const [changeMinutes, setChangeMinutes] = useState(DEFAULT_CHANGE_MINUTES);
  const [weights, setWeights] = useState<RouteWeights>({ ...DEFAULT_WEIGHTS });
  const [limits, setLimits] = useState<JourneyLimits>({ ...DEFAULT_LIMITS });
  const [arrivalsOpen, setArrivalsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);
  const [draft, setDraft] = useState<PlannerSettings>(defaultSettings);
  const [places, setPlaces] = useState<JourneyLocations>({ origin: null, destination: null });
  const [activeField, setActiveField] = useState<JourneyField>('origin');
  const [endpoints, setEndpoints] = useState<{ origin: PlaceResult; destination: PlaceResult } | null>(null);
  const activeSearch = useRef<AbortController | null>(null);
  const arrivalsDialog = useRef<HTMLDialogElement>(null);
  const menuDialog = useRef<HTMLDialogElement>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const labelLookups = useRef(new Map<string, AbortController>());
  useEffect(() => () => activeSearch.current?.abort(), []);
  useEffect(() => { try { const saved = readPaymentPreferences(localStorage.getItem('compass-payment-v1')); setPayment(saved.payment); setPasses(saved.passes); } catch { /* Storage may be blocked. */ } setPaymentLoaded(true); }, []);
  useEffect(() => { if (paymentLoaded) try { localStorage.setItem('compass-payment-v1', JSON.stringify({ payment, passes })); } catch { /* Preferences still work for this session. */ } }, [payment, passes, paymentLoaded]);
  useEffect(() => () => { for (const controller of Array.from(labelLookups.current.values())) controller.abort(); }, []);
  useEffect(() => { if (menuOpen) menuDialog.current?.showModal(); else menuDialog.current?.close(); }, [menuOpen]);
  useEffect(() => { if (arrivalsOpen) arrivalsDialog.current?.showModal(); else arrivalsDialog.current?.close(); }, [arrivalsOpen]);
  useEffect(() => { if (settingsSection) { if (!settingsDialog.current?.open) settingsDialog.current?.showModal(); } else settingsDialog.current?.close(); }, [settingsSection]);

  function openSettings(section: SettingsSection) {
    setDraft({ companies: { ...companies }, transport: { ...transport }, comparisons: { ...comparisons }, preferences: { ...preferences }, changeMinutes, weights: { ...weights }, limits: { ...limits } });
    setSettingsSection(section);
  }
  function applySettings(value: typeof draft) {
    const changed = JSON.stringify(value) !== JSON.stringify({ companies, transport, comparisons, preferences, changeMinutes, weights, limits });
    setTransport(value.transport); setComparisons(value.comparisons);
    setCompanies(value.companies); setPreferences(value.preferences); setChangeMinutes(value.changeMinutes); setWeights(value.weights); setSettingsSection(null);
    setLimits(value.limits);
    if (changed) { resetJourney(); if (places.origin && places.destination) void handleSearch(places.origin, places.destination, value); }
  }

  function resetJourney() {
    activeSearch.current?.abort(); activeSearch.current = null;
    setSearching(false); setRoutes([]); setMeta(null); setSearched(false); setError(null); setEndpoints(null);
  }

  async function handleSearch(origin: PlaceResult, destination: PlaceResult, applied = { companies, transport, comparisons, preferences, changeMinutes, weights, limits }, background = false, signal?: AbortSignal) {
    if (background && activeSearch.current) return;
    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    if (!background) { setSearching(true); setError(null); setRoutes([]); setMeta(null); setSearched(false); setEndpoints({ origin, destination }); }
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const params = new URLSearchParams({ fromLat: String(origin.lat), fromLon: String(origin.lng), toLat: String(destination.lat), toLon: String(destination.lng), lang: locale });
      params.set('timeMode', time.mode);
      params.set('operators', Object.entries(applied.companies).filter(([, level]) => level !== 'ban').map(([id]) => id).join(','));
      params.set('requiredOperators', Object.entries(applied.companies).filter(([, level]) => level === 'must').map(([id]) => id).join(','));
      params.set('modes', Object.entries(applied.transport).filter(([, level]) => level !== 'ban').map(([id]) => id).join(','));
      params.set('requiredModes', Object.entries(applied.transport).filter(([, level]) => level === 'must').map(([id]) => id).join(','));
      params.set('walkComparison', String(applied.comparisons.walk));
      params.set('weights', JSON.stringify(applied.weights)); params.set('preferences', JSON.stringify(applied.preferences)); params.set('changeMinutes', String(applied.changeMinutes));
      params.set('limits', JSON.stringify(applied.limits));
      if (time.mode !== 'now') params.set('time', time.value + ':00+08:00');
      const response = await fetch('/api/journey?' + params, { cache: 'no-store', signal: controller.signal });
      const payload = await response.json() as { data?: ScoredRoute[]; meta?: JourneyMeta; error?: string };
      if (!response.ok || !Array.isArray(payload.data)) throw new Error(payload.error ?? copy(locale, '暫時無法搜尋行程。', 'Journey search is temporarily unavailable.'));
      if (activeSearch.current !== controller) return;
      setRoutes(payload.data); setMeta(payload.meta ?? null); setSearched(true);
    } catch (err) {
      if (activeSearch.current !== controller) return;
      if (background) throw err;
      setError(controller.signal.aborted
        ? copy(locale, '路線搜尋逾時，請再試一次。', 'Journey search timed out. Please try again.')
        : err instanceof Error ? err.message : copy(locale, '搜尋失敗，請再試一次。', 'Search failed. Please try again.'));
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      if (activeSearch.current === controller) { setSearching(false); activeSearch.current = null; }
    }
  }

  const refreshKey = searched && time.mode === 'now' && endpoints ? JSON.stringify([endpoints.origin.id, endpoints.destination.id, companies, transport, comparisons, preferences, changeMinutes, weights, limits, locale]) : '';
  const journeyRefresh = useAutoRefresh(refreshKey, signal => handleSearch(endpoints!.origin, endpoints!.destination, undefined, true, signal), 120_000, false);
  useAutoRefresh('source-version', async signal => {
    const response = await window.fetch('/api/sources', { signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Source version unavailable');
    const payload = await response.json();
    if (!signal.aborted && payload.coverage?.importedOn > coverageSnapshot.importedOn) setDataUpdateAvailable(true);
  }, 6 * 3600_000);

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
        : searched && routes.length === 0 ? copy(locale, '目前交通種類、公司、轉乘及時間設定下未找到可用的公共交通連接（最多三次轉乘）。請放寬設定或嘗試附近站點。', 'No transit connection was found with these transport type, company, transfer and time settings (up to three transfers). Relax the settings or try nearby stops.') : null;
  const emptyHint = searching ? copy(locale, '正在搜尋…', 'Thinking…') : searched ? copy(locale, '未找到可規劃的公共交通路線', 'No supported transit journey found')
    : activeField === 'origin' ? copy(locale, '點選地圖設定起點', 'Click the map to set Start') : copy(locale, '點選地圖設定目的地', 'Click the map to set End');

  const filterSections: [SettingsSection, string, string, number | string][] = [
    ['companies', '交通方式', 'Transport', Object.values(companies).filter(level => level !== 'normal').length + Object.values(transport).filter(level => level !== 'normal').length + Object.values(comparisons).filter(value => !value).length],
    ['roads', '道路', 'Roads', corridorIds.filter(id => roadLevel(preferences, id) !== 'normal').length],
    ['changes', '時間上限', 'Time limits', Object.values(limits).filter(value => value !== null).length + (changeMinutes === DEFAULT_CHANGE_MINUTES ? 0 : 1)],
    ['importance', '重要性', 'Importance', customWeights(weights) ? copy(locale, '自訂', 'Custom') : 0],
  ];
  const settingsChanged = filterSections.some(([, , , count]) => Boolean(count));
  const searchPanel = <section className="planner-toolbar" id="journey" aria-label={copy(locale, '規劃行程', 'Plan a journey')}>
    <div className="planner-toolbar-top"><h1 className="sr-only">{copy(locale, activeCity.nameTc, activeCity.nameEn)}</h1>
      <label className="city-control"><span className="sr-only">{copy(locale, '選擇城市', 'Choose city')}</span>
        <select defaultValue={activeCity.id} onChange={event => { if (event.target.value === 'macau') window.location.assign(locale === 'en' ? '/macau/en' : '/macau'); }} title={copy(locale, '切換城市；澳門版本為預覽。', 'Switch city; Macao is a preview.')}>
          {supportedCities.map(city => <option key={city.id} value={city.id}>{copy(locale, city.nameTc, city.nameEn)}</option>)}
        </select></label><PaymentControl value={payment} onChange={setPayment} passes={passes} onPasses={setPasses} locale={locale} /></div>
    <JourneyPlaceSearch places={places} onInput={editPlace} onSelect={selectPlace} onFocus={setActiveField}
      onSwap={swap} onSearch={() => { if (places.origin && places.destination) void handleSearch(places.origin, places.destination); }}
      searching={searching} locale={locale} time={time} onTimeChange={value => { resetJourney(); setTime(value); }} />
    <div className="planner-filter-bar" role="group" aria-label={copy(locale, '行程篩選器', 'Journey filters')}>
      {filterSections.map(([id, zh, en, count]) => <button type="button" key={id} className={count ? 'filter-chip is-active' : 'filter-chip'}
        aria-haspopup="dialog" onClick={() => openSettings(id)}>{copy(locale, zh, en)}{Boolean(count) && <small>{count}</small>}<PlannerIcon name="chevron" size={12} /></button>)}
      <button type="button" className="filter-reset" disabled={!settingsChanged} onClick={() => applySettings(defaultSettings())}>{copy(locale, '重設', 'Reset')}</button>
    </div>
    {error && <p className="planner-notice notice-error" role="alert">{error}</p>}
    {notice && <p className="planner-notice notice-warning" role="status">{notice}</p>}
    {dataUpdateAvailable && <p className="planner-notice notice-warning" role="status">{copy(locale, '有新交通、票價或時間表資料。', 'Updated transport, fare or timetable data is available.')} <button type="button" onClick={() => window.location.reload()}>{copy(locale, '重新載入以使用新資料', 'Reload to use updated data')}</button></p>}
    {journeyRefresh.failed && <p className="planner-notice notice-warning" role="status">{copy(locale, '行程自動更新失敗；保留的時間可能已過時，將自動重試。', 'Journey refresh failed. Retained times may be stale; retrying automatically.')}</p>}
  </section>;

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
      places={places} onMapPick={pickMapPoint} locale={locale} fareProfile={fareProfile} selectedFareLabel={selectedFareLabel} preferences={preferences} time={time} weights={weights} comparisons={comparisons} />
    <dialog className="menu-dialog" ref={menuDialog} onCancel={() => setMenuOpen(false)} onClose={() => setMenuOpen(false)}>
      <div className="dialog-heading"><strong>Transit Compass HK</strong><button type="button" onClick={() => setMenuOpen(false)} aria-label={copy(locale, '關閉選單', 'Close menu')}><PlannerIcon name="close" size={22} /></button></div>
      <nav aria-label={copy(locale, '更多選項', 'More options')}><a href={locale === 'en' ? '/en' : '/'}>{copy(locale, '規劃行程', 'Get Me Somewhere')}</a><button type="button" onClick={() => { setMenuOpen(false); setArrivalsOpen(true); }}>{copy(locale, '到站時間', 'Live arrivals')}</button><a href={'/timetables?lang=' + locale}>{copy(locale, '營辦商及班次時間表', 'Companies & timetables')}</a><a href="/traffic">{copy(locale, '道路交通消息', 'Road traffic')}</a><a href="/updates">{copy(locale, '巴士服務消息', 'Bus service updates')}</a><a href={'/install?lang=' + locale}>{copy(locale, '安裝 App', 'Install app')}</a><a href={locale === 'en' ? '/' : '/en'}>{locale === 'en' ? '繁體中文' : 'English'}</a></nav>
      <div className="menu-footnote"><a href="/coverage">{copy(locale, '交通資料涵蓋範圍', 'Transport coverage')}</a><p><a href="/api/sources">{copy(locale, '資料來源及鳴謝', 'Data sources & attribution')}</a></p><p>{copy(locale, '獨立交通規劃原型。鐵路、巴士、小巴、電車、渡輪及步行。車程及票價為估算。', 'Independent transit prototype. Rail, buses, minibuses, trams, ferries and walking. Times and fares are estimates.')}</p></div>
    </dialog>
    <dialog className="settings-dialog" ref={settingsDialog} aria-labelledby="journey-settings-title" onCancel={() => setSettingsSection(null)} onClose={() => setSettingsSection(null)}>
      <div className="dialog-heading"><h2 id="journey-settings-title">{copy(locale, '行程設定', 'Journey settings')}</h2><button type="button" onClick={() => setSettingsSection(null)} aria-label={copy(locale, '取消並關閉設定', 'Cancel and close settings')}><PlannerIcon name="close" size={22} /></button></div>
      <nav className="settings-sections" aria-label={copy(locale, '設定類別', 'Settings sections')}>{filterSections.map(([id, zh, en]) => <button type="button" key={id} aria-pressed={settingsSection === id} onClick={() => { setSettingsSection(id); settingsDialog.current?.querySelector('.settings-content')?.scrollTo({ top: 0 }); }}>{copy(locale, zh, en)}</button>)}</nav>
      <div className="settings-content">{settingsSection === 'importance' ? <RouteWeightSettings value={draft.weights} onChange={value => setDraft({ ...draft, weights: value })} locale={locale} />
        : settingsSection && <JourneyPreferences section={settingsSection} companies={draft.companies} onCompanies={value => setDraft({ ...draft, companies: value })}
          transport={draft.transport} onTransport={value => setDraft({ ...draft, transport: value })}
          comparisons={draft.comparisons} onComparisons={value => setDraft({ ...draft, comparisons: value })}
          limits={draft.limits} onLimits={value => setDraft({ ...draft, limits: value })}
          corridors={draft.preferences} onCorridors={value => setDraft({ ...draft, preferences: value })} changeMinutes={draft.changeMinutes} onChangeMinutes={value => setDraft({ ...draft, changeMinutes: value })} locale={locale} />}</div>
      <footer className="settings-footer"><button type="button" className="settings-reset" onClick={() => setDraft(defaultSettings())}>{copy(locale, '重設所有設定', 'Reset all settings')}</button>
        <button type="button" className="settings-apply" disabled={draft.limits.change !== null && draft.limits.change < draft.changeMinutes} onClick={() => applySettings(draft)}>{places.origin && places.destination ? copy(locale, '套用並搜尋', 'Apply & search') : copy(locale, '套用設定', 'Apply settings')}</button></footer>
    </dialog>
    <dialog className="arrivals-dialog" ref={arrivalsDialog} onCancel={() => setArrivalsOpen(false)} onClose={() => setArrivalsOpen(false)}>
      <div className="dialog-heading"><h2>{copy(locale, '查詢車站到站時間', 'Station arrivals')}</h2><button type="button" onClick={() => setArrivalsOpen(false)} aria-label={copy(locale, '關閉到站時間', 'Close arrivals')}><PlannerIcon name="close" size={22} /></button></div><LiveTransitSearch locale={locale} />
    </dialog>
  </main>;
}
