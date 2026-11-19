'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { regions, browseLocation, regionHref } from '../../domain/regions';
import type { OpenMapArea, OpenMapLine, MapPoint } from '../../domain/openMap';
import { loadOpenMapArea } from '../../browser/openMapClient';
import { RegionSwitcher } from './RegionSwitcher';
import { PaymentControl } from './PaymentControl';
import { readPaymentPreferences, type OwnedPass, type PaymentChoice } from '../../domain/payment';
import { PlannerIcon } from './PlannerIcon';

function AreaMap({ center, data, selected, onArea, locale }: { center: MapPoint; data: OpenMapArea | null; selected: OpenMapLine | null; onArea: (point: MapPoint) => void; locale: 'zh' | 'en' }) {
  const element = useRef<HTMLDivElement>(null);
  const state = useRef<{ L: typeof Leaflet; map: Leaflet.Map; layer: Leaflet.LayerGroup } | null>(null);
  const [ready, setReady] = useState(false), [tileError, setTileError] = useState(false);
  useEffect(() => {
    let cancelled = false, resize: ResizeObserver | undefined;
    import('leaflet').then(L => {
      if (cancelled || !element.current) return;
      const map = L.map(element.current, { zoomControl: false }).setView(center, 16);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }).on('tileerror', () => setTileError(true)).on('tileload', () => setTileError(false)).addTo(map);
      state.current = { L, map, layer: L.layerGroup().addTo(map) };
      resize = new ResizeObserver(() => map.invalidateSize()); resize.observe(element.current); setReady(true);
    });
    return () => { cancelled = true; resize?.disconnect(); state.current?.map.remove(); state.current = null; };
    // The center effect below handles later city selections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { state.current?.map.setView(center, 16); }, [center, ready]);
  useEffect(() => {
    const s = state.current; if (!s || !ready) return; s.layer.clearLayers();
    if (!data) return;
    const [south, west, north, east] = data.bounds;
    s.L.rectangle([[south, west], [north, east]], { color: '#4b7772', weight: 1, dashArray: '5 6', fillOpacity: .02, interactive: false }).addTo(s.layer);
    for (const road of data.roads) for (const path of road.paths) s.L.polyline(path, { color: '#829b98', weight: 3, opacity: .55, interactive: false }).addTo(s.layer);
    for (const stop of data.stops) {
      const text = document.createElement('span'); text.textContent = locale === 'en' ? stop.en : stop.name;
      s.L.circleMarker(stop.point, { radius: 4, color: '#fff', weight: 1.5, fillColor: '#248443', fillOpacity: 1 }).bindTooltip(text).addTo(s.layer);
    }
    if (selected) {
      for (const path of selected.paths) {
        s.L.polyline(path, { color: '#fff', weight: 9, interactive: false }).addTo(s.layer);
        s.L.polyline(path, { color: '#126cbd', weight: 5, interactive: false }).addTo(s.layer);
      }
      const points = selected.paths.flat(); if (points.length) s.map.fitBounds(points, { padding: [35, 35], maxZoom: 18 });
    }
  }, [data, selected, ready, locale]);
  return <section className="open-area-map" aria-label={locale === 'en' ? 'Open data map' : '開放資料地圖'}><div ref={element} className="map-canvas" />
    <button type="button" className="load-map-area" onClick={() => { const p = state.current?.map.getCenter(); if (p) onArea([Math.max(-90, Math.min(90, p.lat)), ((p.lng + 180) % 360 + 360) % 360 - 180]); }}><PlannerIcon name="locate" size={18} />{locale === 'en' ? 'Load this area' : '載入此處道路及交通'}</button>
    {tileError && <p className="open-map-error" role="status">{locale === 'en' ? 'Base map unavailable; the data list is still usable.' : '底圖暫時無法載入，仍可使用資料清單。'}</p>}
  </section>;
}

export function OpenDataExplorer({ initialRegion = 'japan', locale }: { initialRegion?: string; locale: 'zh' | 'en' }) {
  const [regionId, setRegionId] = useState(initialRegion);
  const [locationReady, setLocationReady] = useState(false);
  const [passes, setPasses] = useState<OwnedPass[]>([]), [payment, setPayment] = useState<PaymentChoice>('adult-octopus'), [paymentReady, setPaymentReady] = useState(false);
  useEffect(() => { try { const saved = readPaymentPreferences(localStorage.getItem('compass-payment-v1')); setPasses(saved.passes); setPayment(saved.payment); } catch { /* optional storage */ } setPaymentReady(true); }, []);
  useEffect(() => { if (paymentReady) try { localStorage.setItem('compass-payment-v1', JSON.stringify({ payment, passes })); } catch { /* optional storage */ } }, [paymentReady, payment, passes]);
  const region = regions.find(r => r.id === regionId) ?? regions.find(r => r.id === initialRegion)!;
  const [center, setCenter] = useState<MapPoint>([region.cities[0].lat, region.cities[0].lon]);
  const [data, setData] = useState<OpenMapArea | null>(null), [selected, setSelected] = useState<OpenMapLine | null>(null);
  const [tab, setTab] = useState<'roads' | 'routes' | 'stops'>('roads'), [category, setCategory] = useState('all'), [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(false), [reload, setReload] = useState(0);
  const en = locale === 'en', t = (zh: string, english: string) => en ? english : zh;
  useEffect(() => {
    const found = browseLocation(new URLSearchParams(window.location.search), initialRegion);
    setRegionId(found.region.id); setCenter([found.city.lat, found.city.lon]); setLocationReady(true);
  }, [initialRegion]);
  useEffect(() => {
    if (!locationReady) return;
    const controller = new AbortController(), key = `open-area:${regionId}:${center.map(n => n.toFixed(5)).join(',')}`;
    let active = true; setSelected(null); setError(false); setData(null); setBusy(true);
    void (async () => {
      try {
        if (!reload) {
          try { const saved = JSON.parse(localStorage.getItem(key) ?? 'null'); if (saved?.roads && saved?.routes && saved?.stops && Date.now() - Date.parse(saved.fetchedAt) < 86400000) { if (active) { setData(saved); setBusy(false); } return; } } catch { /* storage optional */ }
          const firstCity = region.cities[0];
          if (['taiwan', 'japan'].includes(regionId) && center[0] === firstCity.lat && center[1] === firstCity.lon) {
            try {
              const snapshot = await fetch(`/open-data/${regionId}.json`, { signal: controller.signal });
              if (snapshot.ok) { const saved = await snapshot.json(); if (saved?.roads && saved?.stops) { if (active) setData(saved); return; } }
            } catch { controller.signal.throwIfAborted(); /* Try the public map when the landing snapshot fails. */ }
          }
        }
        const next = await loadOpenMapArea(regionId, center, controller.signal);
        if (active) {
          setData(next);
          try {
            const keys = Object.keys(localStorage).filter(k => k.startsWith('open-area:')); if (keys.length >= 8) localStorage.removeItem(keys[0]);
            localStorage.setItem(key, JSON.stringify(next));
          } catch { /* map works without persistence */ }
        }
      } catch { if (active) setError(true); } finally { if (active) setBusy(false); }
    })();
    return () => { active = false; controller.abort(); };
  // region is derived from regionId; using the stable id avoids repeat loads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId, center, reload, locationReady]);
  const currentCity = region.cities.find(c => c.lat === center[0] && c.lon === center[1]);
  const query = search.trim().toLowerCase();
  const lines = (tab === 'roads' ? data?.roads : data?.routes) ?? [];
  const filtered = lines.filter(r => (category === 'all' || tab !== 'roads' || r.kind === category) && [r.name, r.en, r.ref, r.operator ?? ''].join(' ').toLowerCase().includes(query));
  const stops = data?.stops.filter(s => [s.name, s.en].join(' ').toLowerCase().includes(query)) ?? [];
  return <main className="open-data-app" lang={en ? 'en' : 'zh-Hant'}>
    <header className="app-header"><a className="app-brand" href={en ? '/en' : '/'}><span className="brand-symbol"><PlannerIcon name="arrow" /></span>Transit Compass</a><a className="language-button" href={regionHref(region, en ? 'zh' : 'en', currentCity)}>{en ? '中' : 'EN'}</a></header>
    <div className="open-data-layout"><aside className="open-data-sidebar">
      <div className="open-data-controls"><div className="open-region-row"><RegionSwitcher current={regionId} locale={locale} /><PaymentControl value={payment} onChange={setPayment} passes={passes} onPasses={setPasses} locale={locale} catalogOnly regionId={regionId} /></div><span className="open-data-badge">{t('開放地圖', 'Open map')}</span>
        <h1>{t(region.zh, region.en)}<span>{t('道路及交通', 'Roads & transport')}</span></h1>
        <div className="open-city-list" aria-label={t('選擇城市', 'Choose city')}>{region.cities.map(c => <button type="button" key={c.en} aria-pressed={center[0] === c.lat && center[1] === c.lon} onClick={() => { setCenter([c.lat, c.lon]); setReload(0); window.history.replaceState(window.history.state, '', regionHref(region, locale, c)); }}>{t(c.name, c.en)}</button>)}</div>
        <p className="open-coverage-note">{t('附近道路及已繪製交通。尚未支援行程、班次及票價。', 'Local mapped roads & transport. Journey planning, timetables and fares are not available yet.')}</p>
        <nav className="open-data-tabs" aria-label={t('資料種類', 'Data type')}>{(['roads', 'routes', 'stops'] as const).map(id => <button type="button" key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setCategory('all'); setSearch(''); }}><PlannerIcon name={id === 'roads' ? 'layers' : id === 'routes' ? 'bus' : 'pin'} size={17} />{id === 'roads' ? t('道路', 'Roads') : id === 'routes' ? t('路線', 'Routes') : t('站點', 'Stops')}</button>)}</nav>
        <label className="choice-search"><PlannerIcon name="pin" size={17} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} aria-label={t('搜尋此清單', 'Search this list')} placeholder={t('搜尋名稱或編號', 'Name or number')} /></label>
        {tab === 'roads' && <div className="road-categories">{[['all', '全部', 'All'], ['tunnel', '隧道', 'Tunnels'], ['bridge', '橋樑', 'Bridges'], ['road', '主要道路', 'Main roads']].map(([id, zh, english]) => <button type="button" key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>{t(zh, english)}</button>)}</div>}
      </div>
      <div className="open-data-results" aria-busy={busy}>
        {busy && <p role="status">{t('正在載入附近資料…', 'Loading this area…')}</p>}
        {error && <div role="alert"><p>{t('公開資料暫時無法載入。', 'Open data is temporarily unavailable.')}</p><button className="open-retry" type="button" onClick={() => setReload(n => n + 1)}>{t('重試', 'Retry')}</button></div>}
        {!busy && data && <><p className="open-result-count" role="status">{tab === 'stops' ? stops.length : filtered.length} {t('項 · 地圖虛線範圍內', 'items · dashed map area')}</p>
          {tab !== 'stops' ? filtered.map(line => <button className="open-data-item" type="button" key={line.id} aria-pressed={selected?.id === line.id} onClick={() => setSelected(line)}><span><strong>{t(line.name, line.en)}</strong><small>{line.ref && line.ref !== line.name ? line.ref + ' · ' : ''}{line.operator ?? (line.kind === 'tunnel' ? t('隧道', 'Tunnel') : line.kind === 'bridge' ? t('橋樑', 'Bridge') : line.kind === 'road' ? t('主要道路', 'Main road') : line.kind)}</small></span><PlannerIcon name="chevron" size={16} /></button>)
            : stops.map(stop => <a className="open-data-item" key={stop.id} href={`https://www.openstreetmap.org/${stop.id}`} target="_blank" rel="noreferrer"><span><strong>{t(stop.name, stop.en)}</strong><small>{stop.kind}</small></span><PlannerIcon name="external" size={16} /></a>)}
          {!(tab === 'stops' ? stops.length : filtered.length) && <p>{t('此範圍未找到相符資料。移動地圖，再按「載入此處」。', 'No matching mapped data here. Move the map and choose Load this area.')}</p>}
        </>}
      </div>
      <footer className="open-data-source"><details><summary>{t('資料來源及涵蓋範圍', 'Sources & coverage')}</summary><p>{t('只顯示載入範圍內已繪製的路段，並非全國完整路線。地圖資料不代表即時車輛位置或完整時間表。', 'Shows mapped local segments, not complete national networks. Map records are not live vehicles or complete timetables.')}</p>{data && <p>{t('資料擷取：', 'Retrieved: ')}{new Date(data.fetchedAt).toLocaleDateString(en ? 'en-GB' : 'zh-HK', { timeZone: 'Asia/Hong_Kong' })}</p>}<a href="https://github.com/mledoze/countries" target="_blank" rel="noreferrer">Countries · ODbL 1.0</a><br /><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL 1.0</a></details></footer>
    </aside>{locationReady ? <AreaMap center={center} data={data} selected={selected} locale={locale} onArea={point => { setCenter(point); setReload(0); }} /> : <section className="open-area-map" aria-busy="true" aria-label={t('載入地圖', 'Loading map')} />}</div>
  </main>;
}
