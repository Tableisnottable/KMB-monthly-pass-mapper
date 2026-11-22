'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import type { JourneyLocations, PlannerLocale } from './plannerUi';
import { copy, legOperator, modeIcon, routeBadgeStyle } from './plannerUi';
import { PlannerIcon } from './PlannerIcon';
import { hongKongTimeLabel } from '../../engine/journeyTime';
import { useLiveLocation } from './useLiveLocation';
import { navigationDistance, navigationSteps, type NavigationStep } from '../../domain/navigationSteps';
import { LegArrivalBoard } from './LegArrivalBoard';

export function JourneyNavigation({ route, places, locale, onStop, onPosition }: {
  route: ScoredRoute; places: JourneyLocations; locale: PlannerLocale; onStop: () => void;
  onPosition: (position: GeolocationPosition | null) => void;
}) {
  const gps = useLiveLocation(true);
  const steps = useMemo(() => navigationSteps(route, places), [route, places]);
  const [stepIndex, setStep] = useState(0), [clock, setClock] = useState(Date.now);
  const [loaded, setLoaded] = useState(false);
  const proximity = useRef<{ index: number; timestamp: number } | null>(null);
  const storageKey = 'compass-go-step:' + route.id;
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      if (saved && Date.now() - saved.updated < 86400000 && Number.isInteger(saved.step) && saved.step >= 0 && saved.step < steps.length) setStep(saved.step);
    } catch { /* Manual progress remains available. */ }
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => { if (loaded) try { sessionStorage.setItem(storageKey, JSON.stringify({ step: stepIndex, updated: Date.now() })); } catch {} }, [loaded, stepIndex, storageKey]);
  useEffect(() => { onPosition(gps.position); }, [gps.position, onPosition]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const current = steps[stepIndex], leg = current ? route.legs[current.legIndex] : undefined;
  const distance = current ? navigationDistance(gps.position?.coords ?? null, current.to) : undefined;
  useEffect(() => {
    // Walks advance after two accurate fixes. A GPS point cannot prove boarding.
    if (!current || current.kind !== 'walk' || gps.status !== 'live' || distance === undefined || distance > 40 || !gps.position) { proximity.current = null; return; }
    if (proximity.current?.index === stepIndex && gps.position.timestamp - proximity.current.timestamp >= 2000) {
      setStep(index => Math.min(index + 1, steps.length - 1)); proximity.current = null;
    } else if (proximity.current?.index !== stepIndex) proximity.current = { index: stepIndex, timestamp: gps.position.timestamp };
  }, [current, stepIndex, distance, gps.position, gps.status, steps.length]);
  const title = (step: NavigationStep) => step.kind === 'walk' ? copy(locale, '步行至 ', 'Walk to ') + step.to.name
    : step.kind === 'board' ? copy(locale, '在此上車：', 'Board at ') + step.from.name
    : step.kind === 'ride' ? copy(locale, '乘車至 ', 'Ride to ') + step.to.name
    : step.kind === 'alight' ? copy(locale, '在此下車：', 'Alight at ') + step.to.name
    : copy(locale, '已到達 ', 'Arrived at ') + step.to.name;
  const action = current?.kind === 'board' ? copy(locale, '我已上車', 'I’m on board')
    : current?.kind === 'ride' ? copy(locale, '已到下車站', 'Reached my stop')
    : current?.kind === 'alight' ? copy(locale, '我已下車', 'I’ve alighted') : copy(locale, '已到這裡', 'I’m here');
  const arrival = current?.kind === 'arrive';
  const arrivalTime = Date.parse(route.arrivalTime ?? '');
  function end() { try { sessionStorage.removeItem(storageKey); } catch {} onStop(); }
  return <section className="journey-navigation" aria-label={copy(locale, '行程導航', 'Journey navigation')}>
    <header><span className="navigation-go">GO</span><strong>{arrival ? copy(locale, '已到達', 'You have arrived') : `${stepIndex + 1} / ${steps.length}`}</strong>
      <button type="button" onClick={end}>{copy(locale, '結束', 'End')}</button></header>
    <div className="navigation-progress" role="progressbar" aria-label={copy(locale, '行程進度', 'Journey progress')} aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={arrival ? steps.length : stepIndex}><span style={{ width: `${(arrival ? steps.length : stepIndex) / Math.max(1, steps.length) * 100}%` }} /></div>
    {current && <div className="navigation-instruction" aria-live="polite"><PlannerIcon name={current.kind === 'walk' ? 'walk' : current.kind === 'arrive' ? 'pin' : modeIcon(leg?.mode)} size={32} /><div>
      {leg && current.kind !== 'walk' && current.kind !== 'arrive' && <span className="navigation-route-badge" style={routeBadgeStyle(legOperator(leg), leg.routeNumber)}>{leg.routeNumber}</span>}
      <strong>{title(current)}</strong>
      {current.minutes !== undefined && <small>{Math.ceil(current.minutes)} min</small>}
      {distance !== undefined && <small>{copy(locale, '直線約 ', 'About ')}{Math.round(distance)} m{copy(locale, '', ' straight-line')}</small>}
      {current.kind === 'ride' && distance !== undefined && distance < 250 && <b className="navigation-near-stop">{copy(locale, '即將到站 · 準備下車', 'Your stop is near · prepare to alight')}</b>}
    </div></div>}
    <div className="navigation-timing"><span>{copy(locale, '預計到達 ', 'Arrive ')}{Number.isFinite(arrivalTime) ? hongKongTimeLabel(route.arrivalTime!) : '—'}</span>
      <strong>{Number.isFinite(arrivalTime) ? Math.max(0, Math.ceil((arrivalTime - clock) / 60000)) + ' min' : '—'}</strong></div>
    <p role="status">{gps.status === 'live' ? copy(locale, 'GPS 已開啟', 'GPS on') : gps.status === 'denied' ? copy(locale, '請允許定位，或按下一步繼續', 'Allow location, or continue using the buttons')
      : gps.status === 'paused' ? copy(locale, 'GPS 已暫停', 'GPS paused') : gps.status === 'unavailable' ? copy(locale, 'GPS 暫不可用，可手動繼續', 'GPS unavailable · continue manually') : copy(locale, '定位中…', 'Finding location…')}</p>
    {!arrival ? <div className="navigation-step-actions"><button type="button" disabled={!stepIndex} onClick={() => setStep(index => Math.max(0, index - 1))}>{copy(locale, '上一步', 'Back')}</button><button type="button" className="navigation-next" onClick={() => setStep(index => Math.min(index + 1, steps.length - 1))}>{action}<PlannerIcon name="arrow" size={18} /></button></div>
      : <button type="button" className="navigation-next" onClick={end}>{copy(locale, '完成行程', 'Finish journey')}</button>}
    {current?.kind === 'board' && leg && <LegArrivalBoard key={leg.id} leg={leg} locale={locale} laterConnection={false} />}
    <ol className="navigation-step-list" aria-label={copy(locale, '行程步驟', 'Journey steps')}>{steps.map((item, index) => <li key={item.id} className={index < stepIndex ? 'is-complete' : index === stepIndex ? 'is-current' : ''} aria-current={index === stepIndex ? 'step' : undefined}>
      <span>{index < stepIndex ? '✓' : index + 1}</span><div><strong>{title(item)}</strong>{item.kind === 'board' && <small>{route.legs[item.legIndex].routeNumber}</small>}</div>
    </li>)}</ol>
  </section>;
}
