import React, { useEffect, useState } from 'react';
import type { CancellationNotice, LiveDeparture } from '../../data/networkTimetable';
import { hongKongTimeLabel } from '../../engine/journeyTime';
import { operatorName } from '../../data/transportOperators';
import { DepartureBadge, DepartureLegend } from './DepartureBadge';
import { copy, type PlannerLocale } from './plannerUi';
import { routeBadgeStyle } from './routeColours';
import { departureTimingType, departureType } from '../../domain/departureType';
import { TimetableDifference } from './TimetableDifference';
import { arrivalRemark } from './jointArrivals';

const shortNames: Record<string, string> = { KMB: '九巴', CTB: '城巴', LWB: '龍運' };

export function JointArrivalBoard({ departures, cancellations = [], operator, routeNumber, stopName, locale, scheduledTime, timetableOnly = false }: {
  departures: LiveDeparture[]; operator: string; routeNumber?: string; stopName?: string; locale: PlannerLocale;
  cancellations?: CancellationNotice[];
  scheduledTime?: string; timetableOnly?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
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
    {rows.length ? <>
      <div className={showAll ? 'arrival-board-scroll' : undefined}>
      <table><caption className="sr-only">{copy(locale, '到站時間、等候分鐘、營辦商及班次類型', 'Arrival time, minutes, operator and departure type')}</caption>
        <tbody>{(showAll ? rows : rows.slice(0, 3)).map((row, index) => <tr data-departure-type={departureType(row)} data-timing-type={departureTimingType(row)} key={row.time + ':' + row.operator + ':' + index}>
          <td><time dateTime={row.time}>{hongKongTimeLabel(row.time)}</time></td>
          <td><strong>{remaining(row)}</strong> {copy(locale, '分鐘', 'min')}</td>
          <td><span className="arrival-company" style={routeBadgeStyle(row.operator ?? (operator.includes('+') ? '' : operator), routeNumber)}>{companyLabel(row.operator)}</span>
            <DepartureBadge departure={row} locale={locale} compact />
            <TimetableDifference departure={row} locale={locale} compact />
            {arrivalRemark(row.remark) && <span className="joint-arrival-remark">{arrivalRemark(row.remark)}</span>}</td>
        </tr>)}</tbody></table>
      </div>
      {rows.length > 3 && <button type="button" className="arrival-more-button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? copy(locale, '收起班次', 'Show fewer') : copy(locale, '更多班次', 'More departures') + ` (+${rows.length - 3})`}</button>}
      {operator.includes('+') && missing.length > 0 && <p className="joint-arrival-note">{missing.map(companyLabel).join(' / ')}{copy(locale, '：未有可顯示的到站或班次。', ': no arrivals or departures available.')}</p>}
    </> : <>
      {scheduledTime && Number.isFinite(Date.parse(scheduledTime)) && <p className="joint-arrival-note">{timetableOnly && <DepartureBadge departure={{ status: 'TIMETABLE' }} locale={locale} />} <strong>{hongKongTimeLabel(scheduledTime)}</strong> · {copy(locale, '此行程預計上車時間（非即時）', 'Estimated boarding time for this journey (not live)')}</p>}
      <p className="joint-arrival-note">{timetableOnly ? copy(locale, '此路段採用時間表估算，未套用現在的即時到站預測。', 'This leg uses a timetable estimate; current live arrivals are not applied.') : copy(locale, '暫無可核實的即時班次，請查看時間表；不代表服務已結束。', 'No verified live predictions. Check the timetable; this does not mean service has ended.')}</p>
    </>}
    {cancellations.map((notice, index) => <p className="cancelled-departure" key={index}><DepartureBadge departure={notice} locale={locale} compact /> {notice.time && hongKongTimeLabel(notice.time)} {companyLabel(notice.operator)} · {notice.remark}</p>)}
    <details className="arrival-help"><summary>{copy(locale, '班次說明', 'Help')}</summary><DepartureLegend locale={locale} /><p>{copy(locale, '時間表內＝符合公布時間；加班＝營辦商確認額外班次；班次調整＝原班次改時；取消＝營辦商確認取消。? 代表推斷，未確認對應班次。往後班次按時間表估算，沒有即時資料不等於取消。', 'Timetabled = matches the published schedule; Additional = provider-confirmed extra; Changed = a revised departure; Cancelled = provider-confirmed cancellation. ? means inferred, without a confirmed trip match. Later times are timetable estimates; a missing prediction does not mean cancelled.')}</p></details>
  </section>;
}
