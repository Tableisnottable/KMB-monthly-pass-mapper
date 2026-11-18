'use client';

import { useState } from 'react';
import { transportFetch } from '../../browser/transportClient';
import type { Segment } from '../../engine/UpgradedScoringEngine';
import type { CancellationNotice, LiveDeparture } from '../../data/networkTimetable';
import { isNonOperatingDeparture } from '../../domain/departureType';
import { copy, legOperator, type PlannerLocale } from './plannerUi';
import { JointArrivalBoard } from './JointArrivalBoard';
import { useAutoRefresh } from './useAutoRefresh';
import { RefreshStatus } from './RefreshStatus';

/** Selecting a reachable departure retimes the rest of the journey. */
export function LegArrivalBoard({ leg, locale, laterConnection, onSelectDeparture, earliestTime, selecting, routeStop }: {
  leg: Segment; locale: PlannerLocale; laterConnection: boolean;
  routeStop?: 'arrival' | 'departure';
  onSelectDeparture?: (departure: LiveDeparture, key: string) => void; earliestTime?: string; selecting?: boolean;
}) {
  const [departures, setDepartures] = useState(leg.liveDepartures ?? []);
  const [cancellations, setCancellations] = useState<CancellationNotice[]>(leg.departureNotices ?? []);
  const key = leg.networkPatternId && leg.boardingIndex !== undefined && leg.originStop?.id ? [leg.networkPatternId, leg.boardingIndex, leg.originStop.id, locale, routeStop].join(':') : '';
  const polling = useAutoRefresh(key, async signal => {
    const params = new URLSearchParams({ resource: 'departures', stop: leg.originStop!.id,
      pattern: leg.networkPatternId!, board: String(leg.boardingIndex), lang: locale });
    if (routeStop && leg.networkRouteId) { params.set('scope', 'route-stop'); params.set('route', leg.networkRouteId); }
    const response = await transportFetch('/api/network?' + params, { signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Departures unavailable');
    const payload = await response.json() as { data: (Omit<LiveDeparture, 'time' | 'minutes'> & { status: 'LIVE' | 'TIMETABLE' | 'UNVERIFIED' | 'NO_UPCOMING'; time: string | null; minutes: number | null })[] };
    if (signal.aborted) return;
    setDepartures(payload.data.filter(row => !isNonOperatingDeparture(row) && (row.status === 'LIVE' || row.status === 'TIMETABLE') && row.time !== null && row.minutes !== null) as LiveDeparture[]);
    setCancellations(payload.data.filter(row => isNonOperatingDeparture(row)).map(row => ({ departureType: row.departureType === 'MISSED' ? 'MISSED' : 'CANCELLED', operator: row.operator, remark: row.remark ?? '', time: row.time ?? undefined })));
  });
  return <div className="leg-arrivals">
    {laterConnection && <p className="connection-arrivals-note">{copy(locale, '請選可趕及的班次', 'Choose a reachable departure')}</p>}
    <JointArrivalBoard departures={departures} cancellations={cancellations} operator={legOperator(leg)} routeNumber={leg.routeNumber}
      stopName={leg.originStop?.name} locale={locale} scheduledTime={leg.departureTime} routeStop={routeStop}
      onSelectDeparture={onSelectDeparture} selectedDepartureKey={leg.selectedDepartureKey} earliestTime={earliestTime} selecting={selecting}
      timetableOnly={laterConnection || leg.serviceStatus === 'TIMETABLE'} historyQuery={leg.networkRouteId && leg.networkPatternId && leg.originStop?.id
        ? { route: leg.networkRouteId, pattern: leg.networkPatternId, board: leg.boardingIndex, stop: leg.originStop.id } : undefined} />
    <div className="leg-arrivals-actions"><button type="button" onClick={polling.refresh} disabled={polling.loading}>{polling.loading ? copy(locale, '更新中…', 'Updating…') : copy(locale, '更新', 'Refresh')}</button></div>
    <RefreshStatus {...polling} locale={locale} />
  </div>;
}
