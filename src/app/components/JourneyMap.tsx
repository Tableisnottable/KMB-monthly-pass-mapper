'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import type { PlaceResult } from './PlaceAutocomplete';
import { copy, routeColor, type PlannerLocale } from './plannerUi';
import { PlannerIcon } from './PlannerIcon';

type Endpoints = { origin: PlaceResult; destination: PlaceResult };
type MapState = { map: Leaflet.Map; L: typeof Leaflet; routeLayer: Leaflet.LayerGroup; locationLayer: Leaflet.LayerGroup };

export function JourneyMap({ route, endpoints, locale }: { route?: ScoredRoute; endpoints: Endpoints | null; locale: PlannerLocale }) {
  const container = useRef<HTMLDivElement>(null);
  const state = useRef<MapState | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [tileError, setTileError] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    import('leaflet').then(L => {
      if (cancelled || !container.current) return;
      const map = L.map(container.current, { zoomControl: false, scrollWheelZoom: true }).setView([22.324, 114.17], 12);
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      tiles.on('tileerror', () => setTileError(true));
      tiles.on('tileload', () => setTileError(false));
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      state.current = { map, L, routeLayer: L.layerGroup().addTo(map), locationLayer: L.layerGroup().addTo(map) };
      resize = new ResizeObserver(() => map.invalidateSize());
      resize.observe(container.current);
      setReady(true);
    }).catch(() => setMessage(copy(locale, '地圖載入失敗，請重新整理。', 'The map could not load. Please refresh.')));
    return () => { cancelled = true; resize?.disconnect(); state.current?.map.remove(); state.current = null; };
    // Map creation happens once; subsequent language changes do not reset the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const current = state.current;
    if (!ready || !current) return;
    const { L, map, routeLayer } = current;
    routeLayer.clearLayers();
    const points: Leaflet.LatLngTuple[] = [];
    function point(lat?: number, lng?: number): Leaflet.LatLngTuple | null {
      return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
    }
    function mark(p: Leaflet.LatLngTuple, label: string, color: string, endpoint = false) {
      const text = document.createElement('span'); text.textContent = label;
      L.circleMarker(p, { radius: endpoint ? 8 : 5, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 })
        .bindTooltip(text, { direction: 'top' }).addTo(routeLayer);
      points.push(p);
    }
    function connect(a: Leaflet.LatLngTuple, b: Leaflet.LatLngTuple, color: string, walk = false) {
      L.polyline([a, b], { color: '#fff', weight: walk ? 6 : 9, opacity: .9 }).addTo(routeLayer);
      L.polyline([a, b], { color, weight: walk ? 3 : 5, dashArray: walk ? '5 7' : undefined, lineCap: 'round' }).addTo(routeLayer);
    }
    if (endpoints) {
      mark([endpoints.origin.lat, endpoints.origin.lng], endpoints.origin.name, '#16745d', true);
      mark([endpoints.destination.lat, endpoints.destination.lng], endpoints.destination.name, '#dc6948', true);
    }
    if (route) {
      let previous: Leaflet.LatLngTuple | null = endpoints ? [endpoints.origin.lat, endpoints.origin.lng] : null;
      route.legs.forEach(leg => {
        const a = point(leg.originStop?.lat, leg.originStop?.lng);
        const b = point(leg.destinationStop?.lat, leg.destinationStop?.lng);
        if (!a || !b) return;
        if (previous) connect(previous, a, '#72827d', true);
        connect(a, b, routeColor(leg.operator), leg.mode === 'WALK');
        mark(a, leg.originStop?.name ?? '', routeColor(leg.operator));
        mark(b, leg.destinationStop?.name ?? '', routeColor(leg.operator));
        previous = b;
      });
      if (previous && endpoints) connect(previous, [endpoints.destination.lat, endpoints.destination.lng], '#72827d', true);
    }
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [65, 75], maxZoom: 15 });
  }, [ready, route, endpoints]);

  function locate() {
    if (!navigator.geolocation) { setMessage(copy(locale, '瀏覽器不支援定位。', 'Location is unavailable in this browser.')); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      const current = state.current;
      if (current) {
        const p: Leaflet.LatLngTuple = [position.coords.latitude, position.coords.longitude];
        current.locationLayer.clearLayers();
        current.L.circleMarker(p, { radius: 8, color: '#fff', weight: 3, fillColor: '#4265ce', fillOpacity: 1 }).addTo(current.locationLayer);
        current.map.setView(p, 15);
      }
      setLocating(false); setMessage(copy(locale, '已在地圖上顯示你的位置。', 'Your location is shown on the map.'));
    }, () => { setLocating(false); setMessage(copy(locale, '無法定位，請檢查瀏覽器權限。', 'Could not locate you. Check your browser permissions.')); }, { timeout: 10000, maximumAge: 60000 });
  }

  return <section className="journey-map" id="map" aria-label={copy(locale, '行程地圖', 'Journey map')}>
    <div className="map-canvas" ref={container} />
    <div className="map-heading"><span className="map-heading-icon"><PlannerIcon name="layers" size={19} /></span><div><strong>{copy(locale, '香港', 'Hong Kong')}</strong><small>{copy(locale, '每一程，都有方向。', 'A little direction for every day.')}</small></div><span className="region-tag">HK</span></div>
    <div className="map-tools"><button className="map-tool" onClick={locate} disabled={!ready || locating} aria-label={copy(locale, '在地圖上定位', 'Locate me on the map')}><PlannerIcon name="locate" size={20} /></button>
      <button className="map-tool" aria-label={copy(locale, '返回香港全境', 'Reset Hong Kong map')} onClick={() => state.current?.map.setView([22.324, 114.17], 12)}><PlannerIcon name="compass" size={20} /></button></div>
    {!ready && !message && <div className="map-loading"><span className="planner-spinner" />{copy(locale, '正在載入地圖…', 'Loading the map…')}</div>}
    {(message || tileError) && <div className="map-message" role="status">{tileError ? copy(locale, '底圖暫時無法載入，路線仍可在左側查看。', 'Map tiles are unavailable. Your route details are still available.') : message}<button onClick={() => { setMessage(''); setTileError(false); }} aria-label={copy(locale, '關閉提示', 'Dismiss message')}><PlannerIcon name="close" size={14} /></button></div>}
    <div className="map-caption"><PlannerIcon name="info" size={14} /><span>{route ? copy(locale, '路線連線為示意，並非實際行車或步行路徑。', 'Route connections are schematic, not street-level directions.') : copy(locale, '搜尋行程，探索你的下一程。', 'Your next journey starts with a search.')}</span></div>
  </section>;
}
