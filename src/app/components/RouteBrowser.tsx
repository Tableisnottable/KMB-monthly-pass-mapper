'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { transportFetch } from '../../browser/transportClient';
import type { Segment, Stop } from '../../engine/UpgradedScoringEngine';
import { LegArrivalBoard } from './LegArrivalBoard';
import { copy, routeBadgeStyle, type PlannerLocale } from './plannerUi';
import { operatorName } from '../../data/transportOperators';
import { routeLineStyles } from './routeColours';
import { PlannerIcon } from './PlannerIcon';
import { JointArrivalBoard } from './JointArrivalBoard';

interface RouteRow { id: string; operator: string; number: string; nameTc: string; nameEn: string; mode: string }
interface RouteStop extends Stop { lat: number; lng: number; boarding: boolean; fare: number; fareStatus: string }
interface RoutePattern { id: string; index: number; direction: string; stops: RouteStop[] }

export function RouteBrowser() {
  const [locale, setLocale] = useState<PlannerLocale>('zh');
  const [query, setQuery] = useState(''), [matches, setMatches] = useState<RouteRow[]>([]);
  const [route, setRoute] = useState<RouteRow | null>(null), [patterns, setPatterns] = useState<RoutePattern[]>([]);
  const [patternId, setPatternId] = useState(''), [stopIndex, setStopIndex] = useState(0);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => { const p = new URLSearchParams(window.location.search); setLocale(p.get('lang') === 'en' ? 'en' : 'zh'); setQuery(p.get('q') ?? ''); return () => active.current?.abort(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (!query.trim()) { setMatches([]); return; }
    const timer = setTimeout(async () => {
      try {
        const response = await transportFetch('/api/network?' + new URLSearchParams({ resource: 'routes', mode: 'BUS', q: query, limit: '80' }), { signal: controller.signal });
        if (!response.ok) throw new Error();
        const payload = await response.json();
        if (!controller.signal.aborted) { setMatches(payload.data.sort((a: RouteRow, b: RouteRow) => Number(b.number.toLowerCase() === query.trim().toLowerCase()) - Number(a.number.toLowerCase() === query.trim().toLowerCase()))); setError(''); }
      } catch { if (!controller.signal.aborted) setError(copy(locale, '搜尋失敗，請重試', 'Search failed. Please retry.')); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, locale]);
  async function choose(row: RouteRow) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setLoading(true); setError(''); setRoute(row); setPatterns([]);
    try {
      const response = await transportFetch('/api/network?' + new URLSearchParams({ resource: 'route-map', route: row.id, lang: locale }), { signal: controller.signal });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      if (!controller.signal.aborted) { setPatterns(payload.patterns); setPatternId(payload.patterns[0]?.id ?? ''); setStopIndex(0); }
    } catch { if (!controller.signal.aborted) setError(copy(locale, '此路線暫無站序資料。', 'Stop details are unavailable for this route.')); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  const pattern = patterns.find(item => item.id === patternId), stop = pattern?.stops[stopIndex];
  const leg: Segment | undefined = route && pattern && stop ? { operator: route.operator.split('+')[0], networkOperator: route.operator,
    mode: route.mode, routeNumber: route.number, networkRouteId: route.id, networkPatternId: pattern.id, networkPattern: pattern.index,
    boardingIndex: stopIndex, alightingIndex: pattern.stops.length - 1, originStop: stop, destinationStop: pattern.stops.at(-1) } : undefined;
  return <main className="route-browser" lang={locale === 'zh' ? 'zh-HK' : 'en'}>
    <header className="route-browser-header"><a href={locale === 'en' ? '/en' : '/'} aria-label={copy(locale, '返回規劃', 'Back to planner')}><PlannerIcon name="back" size={23} /></a>
      <h1>{copy(locale, '查路線', 'Bus routes')}</h1><a href={'/routes?lang=' + (locale === 'en' ? 'zh' : 'en')}>{locale === 'en' ? '中' : 'EN'}</a></header>
    <div className="route-browser-layout"><section className="route-browser-controls">
      <label className="route-number-search"><PlannerIcon name="bus" size={22} /><input aria-label={copy(locale, '巴士路線號碼', 'Bus route number')} autoComplete="off" value={query} placeholder={copy(locale, '輸入路線，例如 74X', 'Route number, e.g. 74X')} onChange={event => { setQuery(event.target.value); setRoute(null); setPatterns([]); }} /></label>
      {!route ? <div className="route-number-matches">{matches.map(row => <button type="button" key={row.id} onClick={() => void choose(row)}>
        <strong className="route-badge" style={routeBadgeStyle(row.operator, row.number)}>{row.number}</strong><span>{locale === 'en' ? row.nameEn : row.nameTc}<small>{operatorName(row.operator, locale)}</small></span><PlannerIcon name="chevron" size={17} /></button>)}
        {!query && <p>{copy(locale, '輸入號碼，查看方向、車站及到站時間。', 'Enter a number for directions, stops and arrivals.')}</p>}
        {!!query && !matches.length && !error && <p>{copy(locale, '暫無相符路線', 'No matching route')}</p>}</div> : <>
        <div className="route-browser-heading"><strong className="route-badge" style={routeBadgeStyle(route.operator, route.number)}>{route.number}</strong><span>{operatorName(route.operator, locale)}</span><button type="button" onClick={() => setRoute(null)}>{copy(locale, '更換', 'Change')}</button></div>
        <label className="route-direction"><span>{copy(locale, '方向', 'Direction')}</span><select value={patternId} onChange={event => { setPatternId(event.target.value); setStopIndex(0); }}>{patterns.map((item, i) => <option key={item.id} value={item.id}>{item.stops[0]?.name} → {item.stops.at(-1)?.name} ({i + 1})</option>)}</select></label>
        <a className="route-timetable-link" href={'/timetables?' + new URLSearchParams({ route: route.id, pattern: patternId, lang: locale })}>{copy(locale, '時間表', 'Timetable')} →</a>
        <ol className="route-browser-stops">{pattern?.stops.map((item, i) => <li data-stop-index={i} key={item.id + ':' + i}><button type="button" aria-pressed={i === stopIndex} onClick={() => setStopIndex(i)}>
          <span className="route-stop-number">{i + 1}</span><span><strong>{item.name}</strong>{i < pattern.stops.length - 1 && <small>{item.fareStatus === 'UNAVAILABLE' ? copy(locale, '票價待查', 'Fare unavailable') : 'HK$' + item.fare.toFixed(1) + (item.fareStatus === 'FULL_FARE' ? copy(locale, ' 上限', ' maximum') : '')}</small>}</span>
        </button>{i === stopIndex && leg && item.boarding && i < pattern.stops.length - 1 && <LegArrivalBoard key={pattern.id + ':' + i} leg={leg} locale={locale} laterConnection={false} />}
          {i === stopIndex && route && i === pattern.stops.length - 1 && <JointArrivalBoard key={pattern.id + ':terminal:' + i} departures={[]} operator={route.operator} routeNumber={route.number}
            stopName={item.name} locale={locale} historyQuery={{ route: route.id, stop: item.id, terminal: true }} />}</li>)}</ol>
      </>}
      {loading && <p role="status">{copy(locale, '載入中…', 'Loading…')}</p>}{error && <p role="alert">{error}</p>}
    </section><RouteBrowserMap pattern={pattern} selected={stopIndex} route={route} onStop={index => { setStopIndex(index); requestAnimationFrame(() => document.querySelector('[data-stop-index="' + index + '"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); }} locale={locale} /></div>
  </main>;
}

function RouteBrowserMap({ pattern, selected, route, onStop, locale }: { pattern?: RoutePattern; selected: number; route: RouteRow | null; onStop: (index: number) => void; locale: PlannerLocale }) {
  const container = useRef<HTMLDivElement>(null), map = useRef<Leaflet.Map | null>(null);
  const callback = useRef(onStop); callback.current = onStop;
  const selectionMarker = useRef<Leaflet.CircleMarker | null>(null);
  const [ready, setReady] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    let disposed = false; let observer: ResizeObserver | undefined;
    import('leaflet').then(L => {
      if (disposed || !container.current) return;
      map.current = L.map(container.current).setView([22.33, 114.16], 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map.current);
      observer = new ResizeObserver(() => map.current?.invalidateSize()); observer.observe(container.current); setReady(true);
    });
    return () => { disposed = true; observer?.disconnect(); map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!ready || !map.current || !pattern || !route) return;
    const controller = new AbortController(), current = map.current;
    let layer: Leaflet.LayerGroup | undefined;
    import('leaflet').then(async L => {
      if (controller.signal.aborted) return;
      layer = L.layerGroup().addTo(current);
      pattern.stops.forEach((stop, index) => {
        const label = document.createElement('span'); label.textContent = `${index + 1}. ${stop.name}`;
        L.circleMarker([stop.lat, stop.lng], { radius: index === selected ? 8 : 5, color: '#fff', weight: 2, fillColor: index === selected ? '#1485cc' : '#3b5363', fillOpacity: 1 }).bindTooltip(label)
          .on('click', () => callback.current(index)).addTo(layer!);
      });
      current.fitBounds(L.latLngBounds(pattern.stops.map(stop => [stop.lat, stop.lng])), { padding: [30, 30], maxZoom: 15 });
      try {
        const response = await transportFetch('/api/network?' + new URLSearchParams({ resource: 'route-shape', pattern: pattern.id }), { signal: controller.signal });
        if (!response.ok) throw new Error(); const geometry = await response.json();
        if (controller.signal.aborted) return;
        if (geometry.source === 'UNAVAILABLE') throw new Error();
        for (const path of geometry.paths) {
          L.polyline(path, { color: '#fff', weight: 9, interactive: false }).addTo(layer!);
          for (const style of routeLineStyles(route.operator, route.number)) L.polyline(path, { ...style, interactive: false }).addTo(layer!);
        }
        setMessage('');
      } catch { if (!controller.signal.aborted) setMessage(copy(locale, '部分路線線形暫不可用', 'Some route geometry is unavailable')); }
    });
    return () => { controller.abort(); layer?.remove(); };
  }, [ready, pattern, route, locale]);
  useEffect(() => {
    const stop = pattern?.stops[selected]; if (!ready || !stop || !map.current) return;
    let disposed = false;
    map.current.panTo([stop.lat, stop.lng]);
    import('leaflet').then(L => { if (disposed || !map.current) return; selectionMarker.current?.remove(); selectionMarker.current = L.circleMarker([stop.lat, stop.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#1686ce', fillOpacity: 1, interactive: false }).addTo(map.current); });
    return () => { disposed = true; selectionMarker.current?.remove(); };
  }, [ready, pattern, selected]);
  return <section className="route-browser-map" aria-label={copy(locale, '路線地圖', 'Route map')}><div ref={container} />{message && <p role="status">{message}</p>}</section>;
}
