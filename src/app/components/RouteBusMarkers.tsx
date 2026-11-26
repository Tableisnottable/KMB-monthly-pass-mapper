'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { transportFetch } from '../../browser/transportClient';
import { buildBusTrack, scheduledBusPosition, type ScheduledBusRun } from '../../domain/busMap';
import { hongKongTimeLabel } from '../../engine/journeyTime';
import { copy, type PlannerLocale } from './plannerUi';
import { routeBadgeStyle } from './routeColours';
import { useAutoRefresh } from './useAutoRefresh';

type Coordinate = [number, number];
interface MapStop { lat: number; lng: number; name?: string }

/** Timetable simulations are labelled on both the map control and each bus. */
export function RouteBusMarkers({ map, patternId, stops, paths, operator, number, locale, onStop }: {
  map: Leaflet.Map; patternId: string; stops: MapStop[]; paths?: Coordinate[][];
  operator: string; number: string; locale: PlannerLocale; onStop: (index: number) => void;
}) {
  const [enabled, setEnabled] = useState(true);
  const [runs, setRuns] = useState<ScheduledBusRun[]>([]);
  const [clock, setClock] = useState(Date.now);
  const markers = useRef(new Map<string, Leaflet.Marker>());
  const control = useRef<HTMLElement>(null);
  const callback = useRef(onStop); callback.current = onStop;
  const track = useMemo(() => paths ? buildBusTrack(paths, stops.map(stop => [stop.lat, stop.lng])) : null, [paths, stops]);
  const polling = useAutoRefresh(enabled ? patternId : '', async signal => {
    const response = await transportFetch('/api/network?' + new URLSearchParams({ resource: 'route-vehicles', pattern: patternId }), { signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Bus estimates unavailable');
    const payload = await response.json() as { data: ScheduledBusRun[] };
    if (!signal.aborted) { setRuns(payload.data); setClock(Date.now()); }
  });
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') setClock(Date.now()); }, 5000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  useEffect(() => {
    let disposed = false;
    import('leaflet').then(L => { if (!disposed && control.current) L.DomEvent.disableClickPropagation(control.current); });
    const current = markers.current;
    return () => { disposed = true; current.forEach(marker => marker.remove()); current.clear(); };
  }, [map]);
  const positions = useMemo(() => enabled && track ? runs.flatMap(run => {
    const position = scheduledBusPosition(run, track, clock);
    return position ? [{ run, ...position }] : [];
  }) : [], [enabled, track, runs, clock]);
  useEffect(() => {
    let disposed = false;
    import('leaflet').then(L => {
      if (disposed) return;
      const current = markers.current, visible = new Set(positions.map(row => row.run.id));
      for (const [id, marker] of Array.from(current)) if (!visible.has(id)) { marker.remove(); current.delete(id); }
      for (const row of positions) {
        let marker = current.get(row.run.id);
        if (!marker) {
          const icon = document.createElement('span'); icon.className = 'route-map-bus-icon';
          const style = routeBadgeStyle(operator, number);
          icon.style.backgroundColor = style.backgroundColor; icon.style.color = style.color;
          if (style.backgroundImage) icon.style.backgroundImage = style.backgroundImage;
          // Static icon markup; route data is added only through textContent.
          icon.innerHTML = '<svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2m8-2v2M8 15h1m6 0h1M9 6h6"/></svg>';
          const label = document.createElement('strong'); label.textContent = number; icon.append(label);
          const estimate = document.createElement('small'); estimate.textContent = copy(locale, '估', 'Est.'); icon.append(estimate);
          marker = L.marker(row.point, { icon: L.divIcon({ html: icon, className: 'route-map-bus', iconSize: [64, 38], iconAnchor: [32, 19] }),
            zIndexOffset: 500, title: number + ' · ' + copy(locale, '時間表估算（非 GPS）', 'Timetable estimate (not GPS)') }).addTo(map);
          current.set(row.run.id, marker);
        }
        marker.setLatLng(row.point);
        const popup = document.createElement('section'); popup.className = 'route-map-bus-popup';
        const heading = document.createElement('strong'); heading.textContent = number + ' · ' + copy(locale, '時間表估算', 'Timetable estimate');
        const departure = document.createElement('p'); departure.textContent = copy(locale, '原定開出 ', 'Scheduled departure ') + hongKongTimeLabel(row.run.departureTime);
        const next = document.createElement('button'); next.type = 'button';
        next.textContent = copy(locale, '下一站：', 'Next: ') + (stops[row.nextStop]?.name ?? '') + ' · ' + hongKongTimeLabel(row.arrivalTime);
        next.onclick = () => callback.current(row.nextStop);
        const note = document.createElement('small'); note.textContent = copy(locale, '非即時 GPS', 'Not live GPS');
        popup.append(heading, departure, next, note);
        if (marker.getPopup()) marker.setPopupContent(popup); else marker.bindPopup(popup);
      }
    });
    return () => { disposed = true; };
  }, [map, positions, operator, number, stops, locale]);
  return <aside ref={control} className="route-bus-control" aria-label={copy(locale, '巴士位置', 'Bus positions')}>
    <label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />{copy(locale, '顯示巴士', 'Show buses')}</label>
    {enabled && <small role="status">{polling.failed ? copy(locale, '暫未能更新', 'Could not update')
      : !paths ? copy(locale, '載入路線…', 'Loading route…') : !track ? copy(locale, '位置暫不可用', 'Positions unavailable')
      : !polling.updatedAt ? copy(locale, '載入班次…', 'Loading trips…') : positions.length ? copy(locale, `${positions.length} 輛 · 時間表估算`, `${positions.length} buses · timetable estimate`)
      : copy(locale, '暫無可顯示的估算', 'No estimates to show')}
      <span>{copy(locale, '非即時 GPS', 'Not live GPS')}</span></small>}
  </aside>;
}
