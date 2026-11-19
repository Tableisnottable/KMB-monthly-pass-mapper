'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { transportFetch } from '../../browser/transportClient';
import { inMacau, macauColour, macauTimetableUrl, macauMoney, macauOperators, macauTime, type MacauJourney, type MacauPattern, type MacauPayment, type MacauStop } from '../../domain/macau';
import { DEFAULT_WEIGHTS } from '../../engine/routeWeights';
import { DEFAULT_LIMITS, type JourneyLimits } from '../../domain/journeyLimits';
import { PlaceAutocomplete, type PlaceResult } from '../components/PlaceAutocomplete';
import { PlannerIcon } from '../components/PlannerIcon';
import { RegionSwitcher } from '../components/RegionSwitcher';
import { PaymentControl } from '../components/PaymentControl';
import { readPaymentPreferences, type OwnedPass, type PaymentChoice } from '../../domain/payment';
import { RouteWeightSettings } from '../components/RouteWeightSettings';
import { useLiveLocation } from '../components/useLiveLocation';
import { MacauMap, type MapPiece } from './MacauMap';

type CatalogueRow = Omit<MacauPattern, 'paths'> & { stopCount: number };
type Street = { paths: [number, number][][]; mode: string; minutes: number | null; distanceMetres?: number; fare: number | null; source: string };
const dateInput = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16);
const routeMinutes = (route: MacauJourney) => Math.ceil((Date.parse(route.arrivalTime!) - Date.parse(route.departureTime!)) / 60000);
const defaultCompanies = () => Object.fromEntries(macauOperators.map(o => [o.id, 'normal'])) as Record<string, 'must' | 'normal' | 'ban'>;
function mapPlace(lat: number, lng: number, name: string, type = 'map'): PlaceResult {
  return { id: `MO:${type}:${lat}:${lng}`, name, address: `${lat.toFixed(5)}, ${lng.toFixed(5)} · Macao`, lat, lng, type, googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` };
}
export function MacauPlanner({ locale }: { locale: 'zh' | 'en' }) {
  const t = (zh: string, en: string) => locale === 'en' ? en : zh;
  const [from, setFrom] = useState<PlaceResult | null>(null), [to, setTo] = useState<PlaceResult | null>(null);
  const [fromText, setFromText] = useState(''), [toText, setToText] = useState('');
  const [active, setActive] = useState<'from' | 'to'>('from'), [payment, setPayment] = useState<MacauPayment>('cash');
  const [walletPayment, setWalletPayment] = useState<PaymentChoice>('adult-octopus'), [passes, setPasses] = useState<OwnedPass[]>([]), [walletReady, setWalletReady] = useState(false);
  const [timeMode, setTimeMode] = useState('depart'), [time, setTime] = useState('');
  const [companies, setCompanies] = useState(defaultCompanies), [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [limits, setLimits] = useState<JourneyLimits>({ ...DEFAULT_LIMITS }), [change, setChange] = useState(5), [busEstimates, setBusEstimates] = useState(false);
  const [tab, setTab] = useState<'plan' | 'directory'>('plan'), [routes, setRoutes] = useState<MacauJourney[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [searched, setSearched] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [catalogueError, setCatalogueError] = useState(false);
  const [catalogue, setCatalogue] = useState<CatalogueRow[]>([]), [query, setQuery] = useState(''), [directory, setDirectory] = useState<MacauPattern | null>(null), [directoryBusy, setDirectoryBusy] = useState(false);
  const [imported, setImported] = useState(''), [pieces, setPieces] = useState<MapPiece[]>([]), [geometryNotice, setGeometryNotice] = useState('');
  const [street, setStreet] = useState<Street | null>(null), [streetBusy, setStreetBusy] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(false), gps = useLiveLocation(gpsEnabled), pendingGps = useRef(false);
  const searchAbort = useRef<AbortController | null>(null), dirAbort = useRef<AbortController | null>(null), streetAbort = useRef<AbortController | null>(null);
  const directoryPoints = useMemo(() => {
    if (!directory) return { from: null, to: null };
    const place = (s: MacauStop) => mapPlace(s[3], s[4], s[locale === 'en' ? 2 : 1], 'station');
    return { from: place(directory.stops[0]), to: place(directory.stops.at(-1)!) };
  }, [directory, locale]);
  const result = routes.find(row => row.id === selected);
  const invalidate = () => { searchAbort.current?.abort(); streetAbort.current?.abort(); setRoutes([]); setSelected(null); setSearched(false); setBusy(false); setStreetBusy(false); setStreet(null); setError(''); setPieces([]); setGeometryNotice(''); };
  function choose(field: 'from' | 'to', place: PlaceResult) {
    invalidate(); if (field === 'from') { setFrom(place); setFromText(place.name); setActive('to'); } else { setTo(place); setToText(place.name); }
  }
  useEffect(() => { try { const saved = readPaymentPreferences(localStorage.getItem('compass-payment-v1')); setPasses(saved.passes); setWalletPayment(saved.payment); } catch { /* optional storage */ } setWalletReady(true); }, []);
  useEffect(() => { if (walletReady) try { localStorage.setItem('compass-payment-v1', JSON.stringify({ payment: walletPayment, passes })); } catch { /* optional storage */ } }, [walletReady, walletPayment, passes]);
  useEffect(() => { setTime(dateInput()); const controller = new AbortController();
    transportFetch('/api/macau?resource=routes', { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error('Catalogue unavailable'); const data = await r.json(); setCatalogue(data.data); setImported(data.coverage.importedOn.slice(0, 10));
    }).catch(() => { if (!controller.signal.aborted) setCatalogueError(true); });
    return () => { controller.abort(); searchAbort.current?.abort(); dirAbort.current?.abort(); streetAbort.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!pendingGps.current || !gps.position) return; pendingGps.current = false;
    const { latitude, longitude } = gps.position.coords;
    if (!inMacau(latitude, longitude)) { setError(t('GPS 不在澳門範圍；可在地圖選點。', 'Your GPS is outside Macao. Choose a point on the map.')); return; }
    choose('from', mapPlace(latitude, longitude, t('我的位置', 'My location'), 'location'));
    // Only set the start when requested. Later GPS fixes move the blue dot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps.position]);
  useEffect(() => {
    if (tab === 'directory') { setPieces(directory ? [{ operator: directory.operator, number: directory.number, paths: directory.paths }] : []); setGeometryNotice(''); return; }
    if (street) { setPieces([{ operator: street.mode, number: '', paths: street.paths }]); setGeometryNotice(street.source === 'UNAVAILABLE' ? t('此方式的道路路徑暫時不可用。', 'Road routing is unavailable for this mode.') : t('道路時間為估算，並非即時交通。', 'Road times are estimates, not live traffic.')); return; }
    if (!result) { setPieces([]); return; }
    const controller = new AbortController(); setPieces([]); setGeometryNotice(t('載入實際道路及軌道…', 'Loading roads and tracks…'));
    const legs = result.legs.map(l => ({ id: l.networkPatternId, board: l.boardingIndex, alight: l.alightingIndex }));
    transportFetch('/api/macau?resource=geometry&legs=' + encodeURIComponent(JSON.stringify(legs)), { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error('Geometry unavailable'); const payload = await r.json(); setPieces(payload.data);
      setGeometryNotice(payload.missing ? t('部分道路資料缺失，已隱藏該段連線。', 'Some paths are missing and are hidden.') : t('實際道路／軌道；步行時間按距離估算。', 'Real roads/tracks; walking times are distance estimates.'));
    }).catch(() => { if (!controller.signal.aborted) setGeometryNotice(t('路徑暫時無法載入。', 'Route paths could not load.')); });
    return () => controller.abort();
  }, [result, directory, street, tab, locale]);
  function params() {
    return new URLSearchParams({ fromLat: String(from!.lat), fromLon: String(from!.lng), toLat: String(to!.lat), toLon: String(to!.lng), lang: locale });
  }
  async function search(event?: FormEvent) {
    event?.preventDefault(); if (!from || !to) { setError(t('請從建議清單或地圖選擇起點及終點。', 'Choose Start and End from suggestions or the map.')); return; }
    searchAbort.current?.abort(); streetAbort.current?.abort(); const controller = new AbortController(); searchAbort.current = controller;
    setBusy(true); setError(''); setStreet(null); setStreetBusy(false); setRoutes([]); setSelected(null); setTab('plan'); setSearched(false);
    const p = params(); p.set('resource', 'journey'); p.set('timeMode', timeMode); p.set('time', time ? time + ':00+08:00' : new Date().toISOString());
    p.set('payment', payment); p.set('busEstimates', String(busEstimates)); p.set('changeMinutes', String(change)); p.set('weights', JSON.stringify(weights)); p.set('limits', JSON.stringify(limits));
    p.set('operators', Object.keys(companies).filter(key => companies[key] !== 'ban').join(',')); p.set('requiredOperators', Object.keys(companies).filter(key => companies[key] === 'must').join(','));
    try {
      const response = await transportFetch('/api/macau?' + p, { signal: controller.signal }), payload = await response.json();
      if (!response.ok) throw new Error(payload.error); if (controller.signal.aborted) return;
      setRoutes(payload.data); setSelected(payload.data[0]?.id ?? null); setSearched(true);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : t('搜尋失敗。', 'Search failed.')); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function openRoute(id: string) {
    dirAbort.current?.abort(); const controller = new AbortController(); dirAbort.current = controller; setDirectoryBusy(true); setError(''); setDirectory(null);
    try { const r = await transportFetch('/api/macau?resource=route&id=' + encodeURIComponent(id), { signal: controller.signal }); const p = await r.json(); if (!r.ok) throw new Error(p.error); setDirectory(p.data); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Route unavailable'); }
    finally { if (!controller.signal.aborted) setDirectoryBusy(false); }
  }
  async function streetRoute(mode: string) {
    if (!from || !to) return;
    streetAbort.current?.abort(); const controller = new AbortController(); streetAbort.current = controller; setStreetBusy(true); setStreet(null); setError('');
    const p = params(); p.set('resource', 'street'); p.set('mode', mode);
    try { const r = await transportFetch('/api/macau?' + p, { signal: controller.signal }); const payload = await r.json(); if (!r.ok) throw new Error(payload.error); setStreet(payload.data); setSelected(null); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Road routing unavailable'); }
    finally { if (!controller.signal.aborted) setStreetBusy(false); }
  }
  function gpsStart() {
    if (gps.position && gpsEnabled) {
      const { latitude, longitude } = gps.position.coords;
      if (inMacau(latitude, longitude)) choose('from', mapPlace(latitude, longitude, t('我的位置', 'My location'), 'location'));
      else setError(t('目前位置不在澳門。', 'Your location is outside Macao.'));
    } else { pendingGps.current = true; setGpsEnabled(true); }
  }
  function useStop(stop: MacauStop, field: 'from' | 'to') {
    choose(field, mapPlace(stop[3], stop[4], stop[locale === 'en' ? 2 : 1], 'station')); setTab('plan');
  }
  const paymentLabel = payment === 'cash' ? t('普通成人現金／單程票', 'Adult cash / single ticket') : payment === 'macau-pass' ? t('澳門通／輕軌通', 'Macau Pass / LRT card') : t('合資格學生卡', 'Eligible student card');
  const badge = (operator: string, number: string) => <span className="mo-route-badge" style={{ background: macauColour({ operator, number } as MacauPattern) }}>{number}</span>;
  return <main className="compass-app macau-app" lang={locale === 'en' ? 'en' : 'zh-MO'}>
    <a href="#macau-search" className="planner-skip-link">{t('跳至行程規劃', 'Skip to journey planner')}</a>
    <header className="app-header"><a className="app-brand" href={locale === 'en' ? '/macau/en' : '/macau'}><span className="brand-symbol"><PlannerIcon name="arrow" /></span>Transit Compass</a>
      <nav className="header-actions"><a href={'/macau/install?lang=' + locale}>{t('安裝 App', 'Install app')}</a><a href={locale === 'en' ? '/macau' : '/macau/en'}>{locale === 'en' ? '中' : 'EN'}</a></nav></header>
    <div className="mo-layout"><aside className="mo-sidebar">
      <section className="mo-controls"><div className="mo-title"><RegionSwitcher current="macau" locale={locale} /><PaymentControl value={walletPayment} onChange={setWalletPayment} passes={passes} onPasses={setPasses} locale={locale} catalogOnly regionId="macau" /><span className="mo-preview">{t('預覽', 'PREVIEW')}</span></div>
        <div className="mo-tabs" role="tablist" aria-label={t('澳門工具', 'Macao tools')}>{(['plan', 'directory'] as const).map(id => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{id === 'plan' ? t('規劃行程', 'Plan a journey') : t('巴士及輕軌路線', 'Bus & LRT routes')}</button>)}</div>
        {tab === 'plan' && <form id="macau-search" onSubmit={search}>
          <label className="mo-payment">{t('付款方式', 'Payment')}<select aria-label={t('付款方式', 'Payment')} value={payment} onChange={e => { invalidate(); setPayment(e.target.value as MacauPayment); }}><option value="cash">{t('普通成人現金／單程票', 'Adult cash / single ticket')}</option><option value="macau-pass">{t('澳門通／輕軌通', 'Macau Pass / LRT card')}</option><option value="student">{t('合資格學生卡', 'Eligible student card')}</option></select></label>
          <div className="mo-fields"><PlaceAutocomplete region="macau" label={t('起點', 'Start')} value={fromText} selectedPlace={from} colorClass="origin-label" locale={locale} onFocus={() => setActive('from')} onChange={v => { invalidate(); setFrom(null); setFromText(v); }} onSelect={p => choose('from', p)} />
            <PlaceAutocomplete region="macau" label={t('終點', 'End')} value={toText} selectedPlace={to} colorClass="destination-label" locale={locale} onFocus={() => setActive('to')} onChange={v => { invalidate(); setTo(null); setToText(v); }} onSelect={p => choose('to', p)} /></div>
          <div className="mo-actions"><button type="button" onClick={gpsStart}><PlannerIcon name="locate" size={15} />{t('GPS 起點', 'Use my location')}</button><button type="button" onClick={() => { invalidate(); setFrom(to); setTo(from); setFromText(toText); setToText(fromText); }}><PlannerIcon name="swap" size={15} />{t('交換', 'Swap')}</button><span>{t('地圖選點：', 'Map picks: ')}{active === 'from' ? t('起點', 'Start') : t('終點', 'End')}</span></div>
          <div className="mo-time"><select aria-label={t('出發或到達', 'Depart or arrive')} value={timeMode} onChange={e => { invalidate(); setTimeMode(e.target.value); }}><option value="depart">{t('出發', 'Depart at')}</option><option value="arrive">{t('到達', 'Arrive by')}</option></select><input type="datetime-local" aria-label={t('澳門時間', 'Macao time')} value={time} onChange={e => { invalidate(); setTime(e.target.value); }} /></div>
          <small>{t('澳門當地時間（UTC+8）', 'Macao local time (UTC+8)')}</small>
          <details className="mo-settings"><summary>{t('交通公司、時間上限及重要性', 'Companies, time limits & importance')}</summary><div className="mo-settings-body">
            <h3>{t('交通公司', 'Transport companies')}</h3>{macauOperators.map(op => <label className="mo-setting" key={op.id}><span><i style={{ background: op.colour }} />{op[locale === 'en' ? 'nameEn' : 'nameTc']}</span><select aria-label={op[locale === 'en' ? 'nameEn' : 'nameTc']} value={companies[op.id]} onChange={e => { invalidate(); setCompanies({ ...companies, [op.id]: e.target.value as 'must' | 'normal' | 'ban' }); }}><option value="must">{t('必須', 'Must')}</option><option value="normal">{t('正常', 'Normal')}</option><option value="ban">{t('禁止', 'Ban')}</option></select></label>)}
            <label className="mo-setting">{t('最少轉乘時間', 'Minimum change')}<span><input aria-label={t('最少轉乘時間', 'Minimum change')} type="number" min="0" max="60" value={change} onChange={e => { invalidate(); setChange(Number(e.target.value)); }} /> min</span></label>
            {(Object.keys(limits) as (keyof JourneyLimits)[]).map(key => <label className="mo-setting" key={key}>{({ transfers: t('最多轉乘次數', 'Maximum transfers'), change: t('每次轉乘上限', 'Maximum per change'), walk: t('步行總時間上限', 'Maximum total walking'), wait: t('每次候車上限', 'Maximum per wait'), ride: t('乘車總時間上限', 'Maximum total ride') })[key]}<input type="number" min="0" max={key === 'transfers' ? 3 : 240} placeholder={t('不限', 'Any')} value={limits[key] ?? ''} onChange={e => { invalidate(); setLimits({ ...limits, [key]: e.target.value === '' ? null : Number(e.target.value) }); }} /></label>)}
            <RouteWeightSettings value={weights} onChange={w => { invalidate(); setWeights(w); }} locale={locale} companyAdjustments={false} />
            <button type="button" className="mo-reset" onClick={() => { invalidate(); setCompanies(defaultCompanies()); setWeights({ ...DEFAULT_WEIGHTS }); setLimits({ ...DEFAULT_LIMITS }); setChange(5); setBusEstimates(false); }}>{t('重設所有篩選', 'Reset all filters')}</button>
          </div></details>
          <label className="mo-bus-opt"><input type="checkbox" checked={busEstimates} onChange={e => { invalidate(); setBusEstimates(e.target.checked); }} /><span>{t('包括巴士估算行程（未核實營運時間）', 'Include estimated bus journeys (hours unverified)')}</span></label>
          <p className="mo-warning">{busEstimates ? t('巴士班次、候車時間及營運時段未核實；以下為路網估算，不能確認該時段有車。', 'Bus times, waits and operating hours are unverified. Results are network estimates and do not confirm a service is running.') : t('預設只規劃輕軌。巴士路線可在路線目錄查看，或自行開啟估算行程。', 'Light rail planning by default. Browse bus routes in the directory, or opt in to estimates.')}</p>
          <button className="mo-search" type="submit" disabled={busy}>{busy ? t('搜尋中…', 'Searching…') : t('搜尋路線', 'Find routes')}<PlannerIcon name="arrow" size={18} /></button>
        </form>}
        {tab === 'directory' && <label className="mo-directory-search">{t('搜尋路線編號或終點', 'Find a route number or terminus')}<input value={query} onChange={e => setQuery(e.target.value)} placeholder="26A, N1A, TAIPA…" /></label>}
      </section>
      {error && <p role="alert" className="mo-error">{error}</p>}
      {gpsEnabled && <p role="status" className="mo-gps">{gps.status === 'live' ? t('即時 GPS · 精確度約 ', 'Live GPS · accuracy about ') + Math.round(gps.position?.coords.accuracy ?? 0) + ' m' : gps.status === 'denied' ? t('定位權限被拒；請到瀏覽器設定允許。', 'Location permission denied. Allow it in browser settings.') : gps.status === 'unavailable' ? t('GPS 暫時不可用。', 'GPS unavailable.') : gps.status === 'paused' ? t('背景時 GPS 暫停。', 'GPS paused in the background.') : t('正在定位…', 'Locating…')}<button type="button" onClick={() => { pendingGps.current = false; setGpsEnabled(false); }}>{t('停止', 'Stop')}</button></p>}
      {tab === 'plan' ? <section className="mo-results" aria-label={t('行程結果', 'Journey results')} aria-busy={busy}>
        {searched && <p role="status">{routes.length ? routes.length + t(' 個方案 · 全部為估算', ' options · all estimates') : t('沒有符合設定的行程。嘗試附近車站、放寬限制或開啟巴士估算。', 'No journey matches. Try nearby stops, relax limits or enable bus estimates.')}</p>}
        {!searched && !busy && <div className="mo-welcome"><PlannerIcon name="compass" size={32} /><h1>{t('下一站，澳門。', 'Next stop, Macao.')}</h1><p>{t('搜尋地點或點選地圖開始。巴士及輕軌使用獨立的澳門資料。', 'Search places or pick on the map. Buses and light rail use a separate Macao dataset.')}</p></div>}
        {routes.map((route, index) => <article key={route.id} className={'mo-card' + (selected === route.id ? ' is-selected' : '')}>
          <button type="button" className="mo-card-main" aria-pressed={selected === route.id} onClick={() => { streetAbort.current?.abort(); setStreetBusy(false); setStreet(null); setSelected(route.id); }}><div className="mo-card-top"><strong>{index === 0 ? t('推薦', 'Recommended') : t('其他方案', 'Alternative')}</strong><span><b>{routeMinutes(route)}</b> min</span></div><div className="mo-route-chain">{route.legs.map((leg, i) => <span key={leg.id}>{i > 0 && <span className="mo-chain-arrow">›</span>}{badge(leg.operator, leg.routeNumber!)}</span>)}</div>
            <span className="mo-card-meta">{macauTime(route.departureTime!)} → {macauTime(route.arrivalTime!)} · {t('步行 ', 'Walk ')}{route.walkTransferTimeMinutes} min · {route.transferCount}{t(' 次轉乘', ' changes')}</span>
            <span className="mo-fares"><span>{t('普通成人', 'Normal adult')}<strong>{macauMoney(route.discountedFare)}</strong></span><span>{paymentLabel}<strong>{macauMoney(route.selectedFare)}</strong></span></span>
            {route.selectedFare === null && <small>{t('巴士卡類優惠未核實；不猜測折扣。', 'Bus card concessions unverified; no discount assumed.')}</small>}
          </button>
          <details open={selected === route.id} className="mo-legs"><summary>{t('站點、步行及時間詳情', 'Stops, walking & times')}</summary><p>{t('前往上車站步行 ', 'Walk to boarding stop ')}{route.originWalkMinutes} min</p>
            {route.legs.map((leg, i) => <div className="mo-leg" key={leg.id}>{i > 0 && <small>{t('轉乘步行 ', 'Transfer walk ')}{leg.accessWalkMinutes ?? 0} min</small>}<div>{badge(leg.operator, leg.routeNumber!)}<strong>{macauOperators.find(o => o.id === leg.operator)?.[locale === 'en' ? 'nameEn' : 'nameTc']}</strong></div><p>{macauTime(leg.departureTime!)} {leg.originStop?.name} → {macauTime(leg.arrivalTime!)} {leg.destinationStop?.name}</p><small>{t('乘車 ', 'Ride ')}{leg.journeyTimeMinutes} min · {t('預計候車 ', 'Estimated wait ')}{Math.ceil(leg.scheduledWaitMinutes ?? 0)} min · {t('估算 · 非即時', 'Estimate · not live')}</small></div>)}
            <p>{t('下車後步行 ', 'Walk after alighting ')}{route.destinationWalkMinutes} min</p><small>{t('排序分數 ', 'Ranking score ')}{route.finalScore} · {t('分數不是分鐘', 'scores are not minutes')}</small>
          </details></article>)}
        {from && to && <details className="mo-streets"><summary>{t('步行、單車、的士及駕駛', 'Walking, cycling, taxi & driving')}</summary><div className="mo-actions">{[['walk', '步行', 'Walk'], ['cycle', '單車', 'Cycle'], ['taxi', '的士', 'Taxi'], ['drive', '駕駛', 'Drive']].map(([mode, zh, en]) => <button key={mode} type="button" disabled={streetBusy} onClick={() => streetRoute(mode)}>{t(zh, en)}</button>)}</div>
          {streetBusy && <p role="status">{t('正在查詢道路…', 'Finding a road route…')}</p>}{street && <p role="status">{street.minutes === null ? t('暫時沒有可靠道路時間。', 'No reliable road time available.') : `${street.minutes} min · ${((street.distanceMetres ?? 0) / 1000).toFixed(1)} km`}{street.fare === null ? t(' · 的士收費／駕駛成本未核實', ' · taxi / driving cost unverified') : ' · ' + macauMoney(street.fare)}</p>}
          <small>{t('OSM 路徑估算，非即時交通；不保證單車可進入每個路段。', 'OSM estimates, not live traffic. Check cycling access and local restrictions.')}</small></details>}
      </section> : <section className="mo-directory" aria-label={t('路線目錄', 'Route directory')}>
        {catalogueError ? <p role="alert">{t('路線目錄載入失敗，請重新整理。', 'Route directory could not load. Please refresh.')}</p> : !catalogue.length ? <p role="status">{t('正在載入路線…', 'Loading routes…')}</p> : <p>{t('90 條巴士線 · 3 條輕軌線 · 按方向列出', '90 bus routes · 3 light rail lines · listed by direction')}</p>}
        {directoryBusy && <p role="status">{t('正在載入站點…', 'Loading stops…')}</p>}
        {directory && <article className="mo-directory-detail"><button type="button" className="mo-back" onClick={() => setDirectory(null)}>‹ {t('返回所有路線', 'All routes')}</button><h2>{badge(directory.operator, directory.number)} {directory.stops[0][locale === 'en' ? 2 : 1]} → {directory.stops.at(-1)![locale === 'en' ? 2 : 1]}</h2><a className="mo-timetable-link" href={macauTimetableUrl(directory)} target="_blank" rel="noreferrer">{t("官方時間表 ↗", "Official timetable ↗")}</a><p className="mo-warning">{t('車站狀態只反映匯入日期；班次時間及即時到站未接入。', 'Stop status reflects the import date. Timetables and live arrivals are not connected.')}</p><ol>{directory.stops.map((s, i) => <li key={s[0] + ':' + i}><strong>{s[locale === 'en' ? 2 : 1]}</strong><small>{s[0]}{s[5] ? t(' · 匯入時暫停使用', ' · suspended at import') : ''}</small><div><button type="button" disabled={s[5]} onClick={() => useStop(s, 'from')}>{t('設為起點', 'Start here')}</button><button type="button" disabled={s[5]} onClick={() => useStop(s, 'to')}>{t('設為終點', 'End here')}</button></div></li>)}</ol></article>}
        {!directory && catalogue.filter(p => [p.number, p.stops[0][1], p.stops[0][2], p.stops.at(-1)![1], p.stops.at(-1)![2]].join(' ').toLowerCase().includes(query.trim().toLowerCase())).map(p => <button type="button" className="mo-directory-row" key={p.id} onClick={() => openRoute(p.id)}>{badge(p.operator, p.number)}<span><strong>{p.stops[0][locale === 'en' ? 2 : 1]} → {p.stops.at(-1)![locale === 'en' ? 2 : 1]}</strong><small>{macauOperators.find(o => o.id === p.operator)?.[locale === 'en' ? 'nameEn' : 'nameTc']} · {p.stopCount}{t(' 站', ' stops')}</small></span><PlannerIcon name="chevron" size={16} /></button>)}
      </section>}
      {geometryNotice && <p role="status" className="mo-geometry-note">{geometryNotice}</p>}
      <details className="mo-sources"><summary>{t('資料來源及涵蓋範圍', 'Sources & coverage')}</summary><p>{t('資料匯入：', 'Data imported: ')}{imported || '…'}. {t('非持續即時更新。', 'Not continuously live.')}</p>
        <p>{t('巴士：交通事務局路線、站點及道路線形。普通現金票價 MOP6；卡類及轉乘優惠暫未核實。', 'Buses: DSAT routes, stops and road paths. Adult cash fare MOP6; card and interchange concessions unverified.')}</p>
        <p>{t('輕軌：官方路網、票價、營運時段及班距；平均候車及站間時間為估算，並非逐班時間表。週一至四暫採用較早收車時間，不假設公眾假期延長服務。', 'Light rail: published network, fares, service windows and headways. Waiting and interstation times are estimates, not exact departures. Mon–Thu uses the earlier finish; holiday extensions are not assumed.')}</p>
        <p>{t('學生票需有效合資格卡。此版本不包括渡輪、酒店接駁巴士及跨境行程。不儲存 GPS 軌跡；背景時暫停。', 'Student fares need an eligible valid card. Ferries, hotel shuttles and cross-border trips are not included. No GPS trail is stored; location updates pause in the background.')}</p>
        <ul><li><a href="https://bis.dsat.gov.mo:37812/macauweb/" target="_blank" rel="noreferrer">DSAT {t('巴士報站', 'Bus information')}</a></li><li><a href="https://www.macaotourism.gov.mo/en/travelessential/before-you-travel/local-transportation" target="_blank" rel="noreferrer">MGTO {t('本地交通及票價', 'Local transport & bus fares')}</a></li><li><a href="https://www.mlm.com.mo/en/route.html" target="_blank" rel="noreferrer">Macao LRT {t('路網及服務時間', 'Network & hours')}</a></li><li><a href="https://www.mlm.com.mo/en/general_ticket.html" target="_blank" rel="noreferrer">Macao LRT {t('普通票價', 'General fares')}</a> · <a href="https://www.mlm.com.mo/en/concessionary_ticket.html" target="_blank" rel="noreferrer">{t('優惠票', 'Concessions')}</a></li><li><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors (ODbL)</a> · Geofabrik · FOSSGIS / OSRM</li></ul>
      </details>
    </aside><MacauMap locale={locale} pieces={pieces} from={tab === 'directory' ? directoryPoints.from : from} to={tab === 'directory' ? directoryPoints.to : to} gpsEnabled={gpsEnabled} position={gps.position} onGps={() => { pendingGps.current = false; setGpsEnabled(v => !v); }} onPick={(lat, lng) => {
      if (!inMacau(lat, lng)) { setError(t('請選擇澳門範圍內的位置。', 'Choose a point inside Macao.')); return; } choose(active, mapPlace(lat, lng, t('地圖選點', 'Map location'))); setTab('plan');
    }} /></div>
  </main>;
}
