import React, { useEffect, useState } from 'react';
import type { CancellationNotice, LiveDeparture } from '../../data/networkTimetable';
import { hongKongTimeLabel } from '../../engine/journeyTime';
import { operatorName } from '../../data/transportOperators';
import { DepartureBadge, DepartureLegend } from './DepartureBadge';
import { copy, type PlannerLocale } from './plannerUi';
import { routeBadgeStyle } from './routeColours';
import { departureTimingType, departureType } from '../../domain/departureType';
import { TimetableDifference } from './TimetableDifference';

const shortNames: Record<string, string> = { KMB: '九巴', CTB: '城巴', LWB: '龍運' };

export function JointArrivalBoard({ departures, cancellations = [], operator, routeNumber, stopName, locale, scheduledTime, scheduledHeadway, timetableOnly = false }: {
  departures: LiveDeparture[]; operator: string; routeNumber?: string; stopName?: string; locale: PlannerLocale;
  cancellations?: CancellationNotice[];
  scheduledTime?: string; scheduledHeadway?: number; timetableOnly?: boolean;
}) {
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [clock, setClock] = useState(() => Date.now());
  const departureVersion = departures.map(row => row.time + ':' + row.minutes + ':' + row.operator).join('|');
  useEffect(() => { const now = Date.now(); setReceivedAt(now); setClock(now); }, [departureVersion]);
  useEffect(() => {
    const tick = window.setInterval(() => { if (document.visibilityState !== 'hidden') setClock(Date.now()); }, 1000);
    return () => window.clearInterval(tick);
  }, []);
  const remaining = (row: LiveDeparture) => Math.max(0, Math.ceil(row.minutes - Math.max(0, clock - receivedAt) / 60000));
  const rows = departures.filter(row => row.departureType !== 'CANCELLED' && Number.isFinite(Date.parse(row.time)) && Number.isFinite(row.minutes) && row.minutes >= 0 && row.minutes - Math.max(0, clock - receivedAt) / 60000 >= -1)
    .slice().sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const companyLabel = (id?: string) => !(id ?? (operator.includes('+') ? undefined : operator)) || id?.includes('+') ? copy(locale, '營辦商未提供', 'Operator not supplied')
    : locale === 'zh' ? shortNames[id ?? operator] ?? operatorName(id ?? operator, locale) : id ?? operator;
  const missing = operator.split('+').filter(id => !rows.some(row => row.operator === id));
  return <section className="joint-arrival-board" aria-label={(routeNumber ?? '') + ' ' + copy(locale, '路線到站及班次時間', 'Route arrivals and departures')}>
    <header><strong>{[routeNumber, stopName].filter(Boolean).join(' · ')}</strong><span>{rows.length ? copy(locale, '到站及班次 · 香港時間', 'Arrivals & departures · HKT') : copy(locale, '上車時間估算 · 香港時間', 'Boarding estimate · HKT')}</span></header>
    <DepartureLegend locale={locale} />
    {rows.length > 0 && scheduledHeadway !== undefined && scheduledHeadway > 0 && <p className="joint-arrival-note">{copy(locale, '公布時間表：班距約 ', 'Published timetable: about every ')}{scheduledHeadway} min</p>}
    {rows.length ? <>
      <table><caption className="sr-only">{copy(locale, '到站時間、等候分鐘、營辦商及班次類型', 'Arrival time, minutes, operator and departure type')}</caption>
        <tbody>{rows.map((row, index) => <tr data-departure-type={departureType(row)} data-timing-type={departureTimingType(row)} key={row.time + ':' + row.operator + ':' + index}>
          <td><time dateTime={row.time}>{hongKongTimeLabel(row.time)}</time></td>
          <td><strong>{remaining(row)}</strong> {copy(locale, '分鐘', 'min')}</td>
          <td aria-hidden="true">–</td><td><span className="arrival-company" style={routeBadgeStyle(row.operator ?? (operator.includes('+') ? '' : operator), routeNumber)}>{companyLabel(row.operator)}</span>
            <DepartureBadge departure={row} locale={locale} compact />
            <TimetableDifference departure={row} locale={locale} />
            {row.remark && <span className="joint-arrival-remark">{row.remark}</span>}</td>
        </tr>)}</tbody></table>
      {operator.includes('+') && missing.length > 0 && <p className="joint-arrival-note">{missing.map(companyLabel).join(' / ')}{copy(locale, '：未有可顯示的到站或班次。', ': no arrivals or departures available.')}</p>}
    </> : <>
      {scheduledTime && Number.isFinite(Date.parse(scheduledTime)) && <p className="joint-arrival-note">{timetableOnly && <DepartureBadge departure={{ status: 'TIMETABLE' }} locale={locale} />} <strong>{hongKongTimeLabel(scheduledTime)}</strong> · {copy(locale, '此行程預計上車時間（非即時）', 'Estimated boarding time for this journey (not live)')}</p>}
      {scheduledHeadway !== undefined && scheduledHeadway > 0 && <p className="joint-arrival-note">{copy(locale, '公布班距約 ', 'Published headway about ')}{Math.ceil(scheduledHeadway)} {copy(locale, '分鐘；並非確定開車時間。', 'min; not exact departure slots.')}</p>}
      <p className="joint-arrival-note">{timetableOnly ? copy(locale, '此路段採用時間表估算，未套用現在的即時到站預測。', 'This leg uses a timetable estimate; current live arrivals are not applied.') : copy(locale, '暫無可核實的即時班次，請查看時間表；不代表服務已結束。', 'No verified live predictions. Check the timetable; this does not mean service has ended.')}</p>
    </>}
    {cancellations.map((notice, index) => <p className="cancelled-departure" key={index}><DepartureBadge departure={notice} locale={locale} compact /> {notice.time && hongKongTimeLabel(notice.time)} {companyLabel(notice.operator)} · {notice.remark}</p>)}
  </section>;
}
