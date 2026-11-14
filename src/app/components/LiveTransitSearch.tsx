'use client';

import { transportFetch as fetch } from '../../browser/transportClient';

import { useEffect, useRef, useState } from 'react';
import { PlannerIcon } from './PlannerIcon';
import { copy, modeIcon, modeLabel, routeBadgeStyle, routeSignColours, type PlannerLocale } from './plannerUi';
import { operatorName } from '../../data/transportOperators';
import { hongKongTimeLabel } from '../../engine/journeyTime';
import { DepartureBadge } from './DepartureBadge';
import type { LiveDeparture } from '../../data/networkTimetable';
import { JointArrivalBoard } from './JointArrivalBoard';
import { groupStationDepartures } from './jointArrivals';
import { useAutoRefresh } from './useAutoRefresh';
import { RefreshStatus } from './RefreshStatus';

interface Stop { id: string; nameTc: string; nameEn: string; mode: string }
interface Departure extends Pick<LiveDeparture, 'scheduleMatch' | 'addedReason' | 'changedReason' | 'departureType' | 'timingType' | 'timetableTime' | 'deviationMinutes' | 'comparisonBasis' | 'timetableEstimate'> { id: string; operator: string; networkOperator?: string; number: string; mode: string; destination: string;
  minutes: number | null; time: string | null; routeId: string; patternId: string; stopId: string; remark?: string;
  publishedHeadwayMinutes?: number;
  status: 'LIVE' | 'TIMETABLE' | 'UNVERIFIED' | 'NO_UPCOMING' }

export function LiveTransitSearch({ locale = 'zh' }: { locale?: PlannerLocale }) {
  const [query, setQuery] = useState('');
  const [stops, setStops] = useState<Stop[]>([]);
  const [selected, setSelected] = useState<Stop | null>(null);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function search() {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setLoading(true); setSelected(null); setDepartures([]); setMessage('');
    try {
      const response = await fetch('/api/network?resource=stops&limit=12&q=' + encodeURIComponent(query), { signal: controller.signal });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      if (active.current !== controller) return;
      setStops(payload.data);
      if (!payload.data.length) setMessage(copy(locale, '找不到車站，請試另一個名稱。', 'No stops found. Try another name.'));
    } catch { if (!controller.signal.aborted) setMessage(copy(locale, '搜尋失敗，請再試一次。', 'Search failed. Please try again.')); }
    finally { if (active.current === controller) setLoading(false); }
  }
  function choose(stop: Stop) {
    active.current?.abort(); setLoading(false);
    setSelected(stop); setDepartures([]); setMessage('');
  }
  const polling = useAutoRefresh(selected ? selected.id + ':' + locale : '', async signal => {
    const response = await fetch('/api/network?resource=departures&lang=' + locale + '&stop=' + encodeURIComponent(selected!.id), { cache: 'no-store', signal });
    if (!response.ok) throw new Error('Departures unavailable');
    const payload = await response.json();
    if (!signal.aborted) { setDepartures(payload.data); setMessage(payload.data.length ? '' : copy(locale, '時間表內暫無即將開出的班次。', 'No upcoming departures in the published timetable.')); }
  });
  return <div className="station-lookup">
    <p>{copy(locale, '搜尋所有交通網絡的車站、鐵路站或碼頭。', 'Search stops, stations and piers across all supported networks.')}</p>
    <form className="station-search" onSubmit={event => { event.preventDefault(); void search(); }}>
      <input aria-label={copy(locale, '車站名稱', 'Stop or station name')} value={query} placeholder={copy(locale, '例如：屯門、中環、梅窩', 'Try Tuen Mun, Central or Mui Wo')}
        onChange={event => setQuery(event.target.value)} />
      <button type="submit" disabled={loading || query.trim().length < 2}>{copy(locale, '搜尋', 'Search')}</button>
    </form>
    {!selected ? <div className="station-matches">{stops.map(stop => <button type="button" key={stop.id} onClick={() => void choose(stop)}>
      <PlannerIcon name={modeIcon(stop.mode)} size={19} /><span>{locale === 'en' ? stop.nameEn : stop.nameTc}<small>{locale === 'en' ? stop.nameTc : stop.nameEn}</small></span><PlannerIcon name="chevron" size={14} />
    </button>)}</div> : <>
      <button type="button" className="all-results-button" onClick={() => { active.current?.abort(); setLoading(false); setSelected(null); setMessage(''); }}>{copy(locale, '← 所有站點', '← All stops')}</button>
      <h3>{locale === 'en' ? selected.nameEn : selected.nameTc}</h3>
      <div className="station-departures">{groupStationDepartures(departures).map(group => {
        const row = group.first, displayOperator = group.jointOperator ?? row.operator;
        return <div key={group.id}>
        <span className="route-badge route-stop-plate" title={operatorName(displayOperator, locale) + (routeSignColours(displayOperator, row.number).verified ? '' : ' · ' + copy(locale, '公司顏色未核實', 'Company colour not verified'))} style={routeBadgeStyle(displayOperator, row.number)}><span className="route-badge-icon"><PlannerIcon name={modeIcon(row.mode)} size={18} /></span><strong>{row.number || modeLabel(row.mode, locale)}</strong></span>
        <span>{row.destination}<small>{operatorName(displayOperator, locale)} · {row.departureType === 'CANCELLED' ? <DepartureBadge departure={row} locale={locale} /> : row.status === 'NO_UPCOMING' ? copy(locale, '暫無已公布班次', 'No upcoming published service') : row.status === 'UNVERIFIED' ? copy(locale, '服務未能核實', 'Service unverified') : <DepartureBadge departure={row} locale={locale} />}</small>
          <a className="departure-timetable-link" href={'/timetables?' + new URLSearchParams({ lang: locale, route: row.routeId, pattern: row.patternId, stop: row.stopId })}>{copy(locale, '完整班次時間表', 'Full timetable')}</a></span>
        <strong>{row.status === 'NO_UPCOMING' ? '—' : row.minutes === null ? '—' : row.minutes + ' min'}{row.time && <small>{hongKongTimeLabel(row.time)} HKT</small>}</strong>
        <JointArrivalBoard operator={group.jointOperator ?? row.networkOperator ?? row.operator} routeNumber={row.number}
          stopName={locale === 'en' ? selected.nameEn : selected.nameTc} locale={locale}
          cancellations={group.rows.filter(item => item.departureType === 'CANCELLED').map(item => ({ departureType: 'CANCELLED', operator: item.operator, remark: item.remark ?? '', time: item.time ?? undefined }))}
          departures={group.rows.flatMap(item => item.departureType !== 'CANCELLED' && (item.status === 'LIVE' || item.status === 'TIMETABLE') && item.time !== null && item.minutes !== null
            ? [{ time: item.time, minutes: item.minutes, operator: item.operator, remark: item.remark,
                timetableTime: item.timetableTime, deviationMinutes: item.deviationMinutes, comparisonBasis: item.comparisonBasis, timetableEstimate: item.timetableEstimate,
                scheduleMatch: item.scheduleMatch, addedReason: item.addedReason, changedReason: item.changedReason, timingType: item.timingType ?? (item.status === 'TIMETABLE' ? 'SCHEDULED' : 'LIVE'), departureType: item.departureType ?? (item.status === 'TIMETABLE' ? 'SCHEDULED' : undefined) }] : [])} scheduledTime={row.status === 'TIMETABLE' ? row.time ?? undefined : undefined} />
      </div>;
      })}</div>
      <button type="button" className="all-results-button" disabled={polling.loading} onClick={polling.refresh}>{polling.loading ? copy(locale, '更新中…', 'Updating…') : copy(locale, '更新班次', 'Refresh departures')}</button>
      <RefreshStatus {...polling} locale={locale} />
    </>}
    {(loading || polling.loading) && <p role="status">{copy(locale, '正在載入…', 'Loading…')}</p>}
    {message && <p role="status">{message}</p>}
    <p className="station-data-note">{copy(locale, '即時／時間表預報與時間表內／加班分開顯示，可同時為即時及加班。即時預測本身不能確認車輛已開出。取消只按營辦商明確標示；時間差以最近時間表參考估算，並非確認同一班車提早或延誤。', 'Live/timetable timing is separate from timetabled/additional service, so a departure can be both Live and Additional. A live prediction alone cannot confirm the vehicle has started. Cancellations require explicit provider evidence. Time differences use the nearest timetable reference, not a confirmed early/late identified trip.')} <a href="/coverage">{copy(locale, '資料涵蓋範圍', 'Coverage')}</a></p>
    <p className="station-data-note">{copy(locale, '即時＝營辦商到站預測；時間表＝營辦商預定班次；時間表估算＝按匯入資料推算往後三小時。加班以營辦商標示為準。班次調整?＝附近時間表班次可能改早或改遲，未能確認對應班次；班距變疏亦可標示為推斷調整。時間表不符亦可能是加班、延誤或資料更新。', 'Live = operator arrival prediction. Scheduled = provider-scheduled departure. Timetable estimate = imported schedule preview for the next three hours. Provider-marked extras remain Additional. Changed? = a nearby slot may have moved earlier/later, without a confirmed trip match. Less frequent patterns can also be marked as inferred changes. Mismatches may be extras, delays or data updates.')} <a href={'/timetables?lang=' + locale}>{copy(locale, '所有營辦商及時間表', 'All companies and timetables')}</a></p>
  </div>;
}
