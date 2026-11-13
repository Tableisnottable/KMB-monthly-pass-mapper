'use client';

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import type { PlaceResult } from './PlaceAutocomplete';
import { copy, routeColor, type JourneyLocations, type PlannerLocale } from './plannerUi';
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
    function connect(a: Leaflet.LatLngTuple, b: Leaflet.LatLngTuple, color: string, walk = false) {
      L.polyline([a, b], { color: '#fff', weight: walk ? 6 : 9, opacity: .9 }).addTo(routeLayer);
      L.polyline([a, b], { color, weight: walk ? 3 : 5, dashArray: walk ? '5 7' : undefined, lineCap: 'round' }).addTo(routeLayer);
    }
    function flag(place: PlaceResult, label: string) {
      const p: Leaflet.LatLngTuple = [place.lat, place.lng];
      const text = document.createElement('span'); text.className = 'map-endpoint-flag'; text.textContent = label;
      L.marker(p, { icon: L.divIcon({ html: text, className: 'map-flag-icon', iconSize: [46, 39], iconAnchor: [23, 39] }), interactive: false }).addTo(routeLayer);
      points.push(p);
    }
    if (route) {
      let previous: Leaflet.LatLngTuple | null = origin ? [origin.lat, origin.lng] : null;
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
      if (previous && destination) connect(previous, [destination.lat, destination.lng], '#8e8e8e', true);
    } else if (origin && destination) {
      connect([origin.lat, origin.lng], [destination.lat, destination.lng], '#37ab2e', true);
    }
    if (origin) flag(origin, copy(locale, '起點', 'Start'));
    if (destination) flag(destination, copy(locale, '目的地', 'End'));
    if (points.length) {
      journeyBounds.current = L.latLngBounds(points);
      if (container.current?.clientWidth && container.current.clientHeight) {
        map.fitBounds(journeyBounds.current, { padding: [65, 75], maxZoom: 15 });
      }
    }
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
    {route && <div className="map-caption"><PlannerIcon name="info" size={12} /><span>{copy(locale, '路線連線為示意，並非實際行車或步行路徑。', 'Schematic connections, not street-level directions.')}</span></div>}
  </section>;
}
