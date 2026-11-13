'use client';

import { transportFetch as fetch } from '../../browser/transportClient';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import type { PlaceResult } from './PlaceAutocomplete';
import { copy, legOperator, routeColor, type JourneyLocations, type PlannerLocale } from './plannerUi';
import { PlannerIcon } from './PlannerIcon';

type MapState = { map: Leaflet.Map; L: typeof Leaflet; routeLayer: Leaflet.LayerGroup; locationLayer: Leaflet.LayerGroup };

export function JourneyMap({ route, places, onPick, locale }: { route?: ScoredRoute; places: JourneyLocations; onPick: (lat: number, lng: number) => void; locale: PlannerLocale }) {
  const container = useRef<HTMLDivElement>(null);
  const state = useRef<MapState | null>(null);
  const journeyBounds = useRef<Leaflet.LatLngBounds | null>(null);
  const { origin, destination } = places;
  const onMapPick = useRef(onPick);
  useEffect(() => { onMapPick.current = onPick; }, [onPick]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [tileError, setTileError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geometryStatus, setGeometryStatus] = useState<'loading' | 'ready' | 'partial' | 'error'>('loading');
  const [estimatedRoad, setEstimatedRoad] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    import('leaflet').then(L => {
      if (cancelled || !container.current) return;
      const map = L.map(container.current, { zoomControl: false, scrollWheelZoom: true }).setView([22.303, 114.164], 14);
      map.on('click', (event: Leaflet.LeafletMouseEvent) => onMapPick.current(event.latlng.lat, event.latlng.lng));
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      tiles.on('tileerror', () => setTileError(true));
      tiles.on('tileload', () => setTileError(false));
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      state.current = { map, L, routeLayer: L.layerGroup().addTo(map), locationLayer: L.layerGroup().addTo(map) };
      resize = new ResizeObserver(() => {
        map.invalidateSize();
        if (journeyBounds.current && container.current?.clientWidth && container.current.clientHeight) {
          map.fitBounds(journeyBounds.current, { padding: [65, 75], maxZoom: 15, animate: false });
        }
      });
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
    journeyBounds.current = null;
    const points: Leaflet.LatLngTuple[] = [];
    function point(lat?: number, lng?: number): Leaflet.LatLngTuple | null {
      return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
    }
    function mark(p: Leaflet.LatLngTuple, label: string, color: string) {
      const text = document.createElement('span'); text.textContent = label;
      L.circleMarker(p, { radius: 4, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1, interactive: false })
        .bindTooltip(text, { direction: 'top' }).addTo(routeLayer);
      points.push(p);
    }
    function flag(place: PlaceResult, label: string) {
      const p: Leaflet.LatLngTuple = [place.lat, place.lng];
      const text = document.createElement('span'); text.className = 'map-endpoint-flag'; text.textContent = label;
      const width = locale === 'zh' ? 60 : 46;
      L.marker(p, { icon: L.divIcon({ html: text, className: 'map-flag-icon', iconSize: [width, 39], iconAnchor: [width / 2, 39] }), interactive: false }).addTo(routeLayer);
      points.push(p);
    }
    if (route) {
      route.legs.forEach(leg => {
        const a = point(leg.originStop?.lat, leg.originStop?.lng);
        const b = point(leg.destinationStop?.lat, leg.destinationStop?.lng);
        if (!a || !b) return;
        mark(a, leg.originStop?.name ?? '', routeColor(legOperator(leg), leg.routeNumber));
        mark(b, leg.destinationStop?.name ?? '', routeColor(legOperator(leg), leg.routeNumber));
      });
    }
    if (origin) flag(origin, copy(locale, '起點', 'Start'));
    if (destination) flag(destination, copy(locale, '目的地', 'End'));
    function fit() {
      if (points.length) {
        journeyBounds.current = L.latLngBounds(points);
        if (container.current?.clientWidth && container.current.clientHeight) map.fitBounds(journeyBounds.current, { padding: [65, 75], maxZoom: 15 });
      }
    }
    fit();
    if (!route || !origin || !destination) return;
    const controller = new AbortController();
    setGeometryStatus('loading');
    setEstimatedRoad(false);
    const params = new URLSearchParams({ fromLat: String(origin.lat), fromLon: String(origin.lng), toLat: String(destination.lat), toLon: String(destination.lng) });
    if (route.legs.every(l => l.mode === 'WALK')) params.set('walk', 'true');
    else params.set('legs', route.legs.map(l => `${l.networkPattern}:${l.boardingIndex}:${l.alightingIndex}`).join(','));
    const timeout = window.setTimeout(() => { setGeometryStatus('error'); controller.abort(); }, 45000);
    fetch('/api/journey-geometry?' + params, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Geometry unavailable');
      const payload = await response.json() as { pieces: { legIndex: number; walk: boolean; paths: [number, number][][]; source: string }[]; missing: number };
      if (controller.signal.aborted) return;
      for (const piece of payload.pieces) {
        if (piece.source === 'UNAVAILABLE') continue;
        const leg = route!.legs[piece.legIndex];
        const color = piece.walk ? '#72827d' : routeColor(leg ? legOperator(leg) : '', leg?.routeNumber);
        for (const path of piece.paths) {
          if (path.length < 2 || path.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) continue;
          L.polyline(path, { color: '#fff', weight: piece.walk ? 6 : 9, opacity: .9, interactive: false }).addTo(routeLayer);
          L.polyline(path, { color, weight: piece.walk ? 3 : 5, dashArray: piece.walk ? '5 7' : undefined, lineCap: 'round', interactive: false }).addTo(routeLayer);
          points.push(...path);
        }
      }
      setEstimatedRoad(payload.pieces.some(piece => piece.source === 'OSM_ROAD'));
      setGeometryStatus(payload.missing ? 'partial' : 'ready'); fit();
    }).catch(() => { if (!controller.signal.aborted) setGeometryStatus('error'); })
      .finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [ready, route, origin, destination, locale]);

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
    <div className="map-tools"><button className="map-tool" onClick={locate} disabled={!ready || locating} aria-label={copy(locale, '在地圖上定位', 'Locate me on the map')}><PlannerIcon name="locate" size={20} /></button>
      <button className="map-tool" aria-label={copy(locale, '返回香港全境', 'Reset Hong Kong map')} onClick={() => state.current?.map.setView([22.303, 114.164], 14)}><PlannerIcon name="compass" size={20} /></button></div>
    {!ready && !message && <div className="map-loading"><span className="planner-spinner" />{copy(locale, '正在載入地圖…', 'Loading the map…')}</div>}
    {(message || tileError) && <div className="map-message" role="status">{tileError ? copy(locale, '底圖暫時無法載入，路線仍可在左側查看。', 'Map tiles are unavailable. Your route details are still available.') : message}<button onClick={() => { setMessage(''); setTileError(false); }} aria-label={copy(locale, '關閉提示', 'Dismiss message')}><PlannerIcon name="close" size={14} /></button></div>}
    {route && <div className="map-caption" role="status"><PlannerIcon name="info" size={12} /><span>{geometryStatus === 'loading'
      ? copy(locale, '正在載入實際路徑…', 'Loading roads and tracks…')
      : geometryStatus === 'ready' ? estimatedRoad
        ? copy(locale, '部分道路路徑由 OpenStreetMap 估算', 'Some road paths are estimated using OpenStreetMap')
        : copy(locale, '運輸署道路線形 · OpenStreetMap 軌道及步行路徑', 'TD road alignments · OpenStreetMap tracks and footpaths')
        : copy(locale, '部分路徑暫未能載入；該段連線已隱藏。', 'Some paths are unavailable; those lines are hidden.')}</span></div>}
  </section>;
}
