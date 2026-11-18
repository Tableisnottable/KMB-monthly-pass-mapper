'use client';
import { useEffect, useState } from 'react';
import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import type { JourneyLocations, PlannerLocale } from './plannerUi';
import { copy, modeIcon } from './plannerUi';
import { PlannerIcon } from './PlannerIcon';
import { haversineKm } from '../../engine/journeyHelpers';
import { hongKongTimeLabel } from '../../engine/journeyTime';
import { useLiveLocation } from './useLiveLocation';

export function JourneyNavigation({ route, places, locale, onStop, onPosition }: {
  route: ScoredRoute; places: JourneyLocations; locale: PlannerLocale; onStop: () => void;
  onPosition: (position: GeolocationPosition | null) => void;
}) {
  const gps = useLiveLocation(true);
  const [step, setStep] = useState(0), [clock, setClock] = useState(Date.now);
  useEffect(() => { onPosition(gps.position); }, [gps.position, onPosition]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const leg = route.legs[step];
  const endpoint = leg?.destinationStop ?? places.destination;
  const distance = gps.position && endpoint?.lat !== undefined && endpoint.lng !== undefined
    ? haversineKm(gps.position.coords.latitude, gps.position.coords.longitude, endpoint.lat, endpoint.lng) * 1000 : undefined;
  const arrival = !leg && distance !== undefined && distance <= 50;
  return <section className="journey-navigation" aria-label={copy(locale, '行程導航', 'Journey navigation')}>
    <header><span className="navigation-go">GO</span><strong>{arrival ? copy(locale, '已到達', 'You have arrived') : copy(locale, '行程進行中', 'Journey in progress')}</strong>
      <button type="button" onClick={onStop}>{copy(locale, '結束', 'End')}</button></header>
    <div className="navigation-instruction"><PlannerIcon name={leg ? modeIcon(leg.mode) : 'walk'} size={28} /><div>
      <strong>{leg ? (leg.mode === 'WALK' ? copy(locale, '步行', 'Walk') : leg.routeNumber) + ' → ' + leg.destinationStop.name
        : copy(locale, '步行至 ', 'Walk to ') + places.destination?.name}</strong>
      {leg && <small>{copy(locale, '上車站：', 'Board at: ')}{leg.originStop.name}</small>}
      {distance !== undefined && <small>{copy(locale, '距離目的站約 ', 'About ')}{Math.round(distance)} m{copy(locale, '（直線距離）', ' to this stop (straight-line distance)')}</small>}
    </div></div>
    <div className="navigation-timing"><span>{copy(locale, '預計到達 ', 'Arrive ')}{(route.arrivalTime ? hongKongTimeLabel(route.arrivalTime) : '—')}</span>
      <strong>{Math.max(0, Math.ceil((Date.parse(route.arrivalTime ?? '') - clock) / 60000))} min</strong></div>
    <p role="status">{gps.status === 'live' ? copy(locale, 'GPS 已開啟', 'GPS on') : gps.status === 'denied' ? copy(locale, '請允許定位', 'Allow location access')
      : gps.status === 'paused' ? copy(locale, 'GPS 已暫停', 'GPS paused') : gps.status === 'unavailable' ? copy(locale, 'GPS 暫不可用', 'GPS unavailable') : copy(locale, '定位中…', 'Finding location…')}</p>
    {leg && <button type="button" className="navigation-next" onClick={() => setStep(value => value + 1)}>{copy(locale, '已到此站 · 下一步', 'Reached this stop · Next step')}<PlannerIcon name="arrow" size={18} /></button>}
  </section>;
}
