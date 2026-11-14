'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { transportFetch } from '../../browser/transportClient';
import type { Segment, Stop } from '../../engine/UpgradedScoringEngine';
import { hongKongTimeLabel } from '../../engine/journeyTime';
import { copy, type PlannerLocale } from './plannerUi';
import { routeColor } from './routeColours';
import { legOperator } from './plannerUi';

export function LegStopTimeline({ leg, locale }: { leg: Segment; locale: PlannerLocale }) {
  const [stops, setStops] = useState<Stop[]>([]);
  useEffect(() => {
    setStops([]);
    if (!leg.networkPatternId || leg.boardingIndex === undefined || leg.alightingIndex === undefined) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ resource: 'pattern-stops', pattern: leg.networkPatternId,
      board: String(leg.boardingIndex), alight: String(leg.alightingIndex), lang: locale });
    transportFetch('/api/network?' + params, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Stop list unavailable');
      const payload = await response.json(); if (!controller.signal.aborted) setStops(payload.data);
    }).catch(() => { /* Known endpoints remain visible without inventing stops. */ });
    return () => controller.abort();
  }, [leg.networkPatternId, leg.boardingIndex, leg.alightingIndex, locale]);
  const count = leg.boardingIndex !== undefined && leg.alightingIndex !== undefined ? leg.alightingIndex - leg.boardingIndex : undefined;
  return <div className="leg-stop-timeline" style={{ '--timeline-colour': routeColor(legOperator(leg), leg.routeNumber) } as CSSProperties}>
    <div className="timeline-endpoint"><strong>{leg.originStop?.name}</strong>{leg.departureTime && <time dateTime={leg.departureTime}>{hongKongTimeLabel(leg.departureTime)}</time>}</div>
    <details className="timeline-intermediate"><summary>{count !== undefined && count > 0 ? count + copy(locale, ' 個站', ' stops') : copy(locale, '乘車路段', 'Ride segment')}<span>{leg.journeyTimeMinutes} min</span></summary>
      {stops.length > 2 ? <ol>{stops.slice(1, -1).map((stop, index) => <li key={index}>{stop.name}</li>)}</ol>
        : <p>{stops.length ? copy(locale, '中途不停站', 'No intermediate stops') : copy(locale, '逐站資料暫未能載入。', 'Stop list is currently unavailable.')}</p>}
    </details>
    <div className="timeline-endpoint"><strong>{leg.destinationStop?.name}</strong>{leg.arrivalTime && <time dateTime={leg.arrivalTime}>{hongKongTimeLabel(leg.arrivalTime)}</time>}</div>
  </div>;
}
