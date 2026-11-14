'use client';

import { useState } from 'react';
import { transportFetch } from '../../browser/transportClient';
import type { Segment } from '../../engine/UpgradedScoringEngine';
import type { CancellationNotice, LiveDeparture } from '../../data/networkTimetable';
import { copy, legOperator, type PlannerLocale } from './plannerUi';
import { JointArrivalBoard } from './JointArrivalBoard';
import { useAutoRefresh } from './useAutoRefresh';
import { RefreshStatus } from './RefreshStatus';

/** Current stop departures are display-only; they never retime later transfers. */
export function LegArrivalBoard({ leg, locale, laterConnection }: { leg: Segment; locale: PlannerLocale; laterConnection: boolean }) {
  const [departures, setDepartures] = useState(leg.liveDepartures ?? []);
  const [cancellations, setCancellations] = useState<CancellationNotice[]>(leg.departureNotices ?? []);
  const key = leg.networkPatternId && leg.boardingIndex !== undefined && leg.originStop?.id ? [leg.networkPatternId, leg.boardingIndex, leg.originStop.id, locale].join(':') : '';
  const polling = useAutoRefresh(key, async signal => {
    const params = new URLSearchParams({ resource: 'departures', stop: leg.originStop!.id,
      pattern: leg.networkPatternId!, board: String(leg.boardingIndex), lang: locale });
    const response = await transportFetch('/api/network?' + params, { signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Departures unavailable');
    const payload = await response.json() as { data: (Omit<LiveDeparture, 'time' | 'minutes'> & { status: string; time: string | null; minutes: number | null })[] };
    if (signal.aborted) return;
    setDepartures(payload.data.filter(row => row.departureType !== 'CANCELLED' && (row.status === 'LIVE' || row.status === 'TIMETABLE') && row.time !== null && row.minutes !== null) as LiveDeparture[]);
    setCancellations(payload.data.filter(row => row.departureType === 'CANCELLED').map(row => ({ departureType: 'CANCELLED', operator: row.operator, remark: row.remark ?? '', time: row.time ?? undefined })));
  });
  return <div className="leg-arrivals">
    {laterConnection && <p className="connection-arrivals-note">{copy(locale, '以下為此站現在的班次，不是預計轉乘時刻的保證班次。行程時間仍按到達此站後的可用班次計算。', 'Current departures at this stop, not guaranteed departures at your later connection time. Journey timing still uses connections reachable after you arrive.')}</p>}
    <JointArrivalBoard departures={departures} cancellations={cancellations} operator={legOperator(leg)} routeNumber={leg.routeNumber}
      stopName={leg.originStop?.name} locale={locale} scheduledTime={leg.departureTime}
      scheduledHeadway={leg.publishedHeadwayMinutes} timetableOnly={laterConnection || leg.serviceStatus === 'TIMETABLE'} />
    <div className="leg-arrivals-actions"><button type="button" onClick={polling.refresh} disabled={polling.loading}>{polling.loading ? copy(locale, '更新中…', 'Updating…') : copy(locale, '更新此站班次', 'Refresh stop departures')}</button></div>
    <RefreshStatus {...polling} locale={locale} />
  </div>;
}
