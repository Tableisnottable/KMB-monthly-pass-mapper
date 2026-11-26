'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { macauColour, type MacauPoint } from '../../domain/macau';
import type { MacauPattern } from '../../domain/macau';
import type { MacauBusPosition } from '../../domain/macauLive';
import type { PlaceResult } from '../components/PlaceAutocomplete';
import { PlannerIcon } from '../components/PlannerIcon';
export type MapPiece = { operator: string; number: string; paths: MacauPoint[][] };
export function MacauMap({ pieces, from, to, onPick, position, onGps, gpsEnabled, locale, pattern, buses, onStop }: {
  pieces: MapPiece[]; from: PlaceResult | null; to: PlaceResult | null; onPick: (lat: number, lng: number) => void;
  position: GeolocationPosition | null; onGps: () => void; gpsEnabled: boolean; locale: 'zh' | 'en';
  pattern?: MacauPattern; buses?: MacauBusPosition[]; onStop: (index: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null), pick = useRef(onPick);
  const state = useRef<{ L: typeof Leaflet; map: Leaflet.Map; route: Leaflet.LayerGroup; gps: Leaflet.LayerGroup; vehicles: Leaflet.LayerGroup } | null>(null);
  const selectStop = useRef(onStop);
  selectStop.current = onStop;
  const [ready, setReady] = useState(false), [error, setError] = useState(false);
  pick.current = onPick;
  useEffect(() => {
    let cancelled = false, resize: ResizeObserver | undefined;
    import('leaflet').then(L => {
      if (cancelled || !container.current) return;
      const map = L.map(container.current, { zoomControl: false }).setView([22.172, 113.557], 12);
      map.on('click', (e: Leaflet.LeafletMouseEvent) => pick.current(e.latlng.lat, e.latlng.lng));
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })
        .on('tileerror', () => setError(true)).on('tileload', () => setError(false)).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      state.current = { L, map, route: L.layerGroup().addTo(map), gps: L.layerGroup().addTo(map), vehicles: L.layerGroup().addTo(map) };
      resize = new ResizeObserver(() => map.invalidateSize()); resize.observe(container.current); setReady(true);
    }).catch(() => setError(true));
    return () => { cancelled = true; resize?.disconnect(); state.current?.map.remove(); state.current = null; };
  }, []);
  useEffect(() => {
    const current = state.current; if (!ready || !current) return;
    const { L, map, route } = current; route.clearLayers();
    const points: MacauPoint[] = [];
    for (const piece of pieces) for (const path of piece.paths) {
      if (path.length < 2) continue;
      const colour = piece.operator === 'walk' ? '#617c74' : piece.operator === 'cycle' ? '#197daf' : piece.operator === 'drive' || piece.operator === 'taxi' ? '#6d529c' : macauColour(piece as Parameters<typeof macauColour>[0]);
      L.polyline(path, { color: '#fff', weight: 9, opacity: .9, interactive: false }).addTo(route);
      L.polyline(path, { color: colour, weight: 5, dashArray: piece.operator === 'walk' ? '5 8' : undefined, interactive: false }).addTo(route); points.push(...path);
    }
    for (const [place, label, colour] of [[from, locale === 'en' ? 'Start' : '起點', '#298d35'], [to, locale === 'en' ? 'End' : '終點', '#b13145']] as const) {
      if (!place || pattern) continue;
      const text = document.createElement('span'); text.textContent = label + ' · ' + place.name;
      const point: MacauPoint = [place.lat, place.lng]; points.push(point);
      L.circleMarker(point, { radius: 7, color: '#fff', weight: 3, fillColor: colour, fillOpacity: 1 }).bindTooltip(text, { permanent: true, direction: 'top' }).addTo(route);
    }
    pattern?.stops.forEach((stop, index) => {
      const point: MacauPoint = [stop[3], stop[4]];
      const number = document.createElement('span');
      number.textContent = String(index + 1);
      number.style.borderColor = macauColour(pattern);
      const title = `${index + 1}. ${stop[locale === 'en' ? 2 : 1]} (${stop[0]})`;
      const tooltip = document.createElement('span');
      tooltip.textContent = title;
      L.marker(point, { title, alt: title, bubblingMouseEvents: false,
        icon: L.divIcon({ className: 'mo-map-stop', html: number, iconSize: [23, 23], iconAnchor: [11, 11] }),
      }).bindTooltip(tooltip).on('click', () => selectStop.current(index)).addTo(route);
      points.push(point);
    });
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [35, 50], maxZoom: 16 });
  }, [ready, pieces, from, to, locale, pattern]);
  useEffect(() => {
    const current = state.current;
    if (!ready || !current) return;
    current.vehicles.clearLayers();
    if (!pattern || !buses) return;
    const colour = macauColour(pattern);
    for (const bus of buses) {
      const icon = document.createElement('span');
      icon.textContent = bus.fleetNumber ?? pattern.number;
      icon.style.backgroundColor = colour;
      const title = `${pattern.number} · ${bus.fleetNumber ?? ''} ${locale === 'en' ? 'Reported bus location' : '來源回報車輛位置'}`;
      current.L.marker(bus.point, { title, alt: title, zIndexOffset: 400, bubblingMouseEvents: false,
        icon: current.L.divIcon({ className: 'mo-map-vehicle', html: icon, iconSize: [54, 24], iconAnchor: [27, 12] }),
      }).addTo(current.vehicles);
    }
  }, [ready, pattern, buses, locale]);
  useEffect(() => {
    const current = state.current; if (!ready || !current) return;
    current.gps.clearLayers(); if (!position || !gpsEnabled) return;
    const point: MacauPoint = [position.coords.latitude, position.coords.longitude];
    current.L.circle(point, { radius: Math.min(position.coords.accuracy, 10000), color: '#3478e5', weight: 1, fillOpacity: .12 }).addTo(current.gps);
    current.L.circleMarker(point, { radius: 8, color: '#fff', weight: 3, fillColor: '#3478e5', fillOpacity: 1 })
      .bindTooltip(locale === 'en' ? 'Your live location' : '你的位置').addTo(current.gps);
  }, [ready, position, gpsEnabled, locale]);
  return <section className="macau-map" aria-label={locale === 'en' ? 'Macao map' : '澳門地圖'}>
    <div ref={container} className="map-canvas" />
    <div className="map-tools"><button type="button" className="map-tool" aria-pressed={gpsEnabled} aria-label={locale === 'en' ? 'Live GPS' : '即時 GPS'} onClick={onGps}><PlannerIcon name="locate" /></button>
      <button type="button" className="map-tool" aria-label={locale === 'en' ? 'Reset Macao map' : '重設澳門地圖'} onClick={() => state.current?.map.setView([22.172, 113.557], 12)}><PlannerIcon name="compass" /></button></div>
    {error && <div className="map-message" role="status">{locale === 'en' ? 'Map tiles unavailable. Route details remain available.' : '底圖暫時無法載入，仍可查看路線詳情。'}</div>}
    {!ready && <div className="map-loading" role="status">{locale === 'en' ? 'Loading map…' : '正在載入地圖…'}</div>}
    <p className="map-caption">{locale === 'en' ? 'DSAT bus roads · OpenStreetMap tracks · source gaps stay hidden' : '交通事務局巴士道路 · OpenStreetMap 軌道 · 缺失路段不繪線'}</p>
  </section>;
}
