import React, { useEffect, useState } from 'react';
import { transportFetch } from '../../browser/transportClient';
import type { CancellationNotice, LiveDeparture } from '../../data/networkTimetable';
import { hongKongTimeLabel } from '../../engine/journeyTime';
import { operatorName } from '../../data/transportOperators';
import { DepartureBadge, DepartureLegend } from './DepartureBadge';
import { copy, type PlannerLocale } from './plannerUi';
import { routeBadgeStyle } from './routeColours';
import { departureTimingType, departureType, isNonOperatingDeparture } from '../../domain/departureType';
import { TimetableDifference } from './TimetableDifference';
import { arrivalRemark } from './jointArrivals';

const shortNames: Record<string, string> = { KMB: '九巴', CTB: '城巴', LWB: '龍運' };

export function JointArrivalBoard({ departures, cancellations = [], operator, routeNumber, stopName, locale, scheduledTime, timetableOnly = false, onSelectDeparture, selectedDepartureKey, earliestTime, selecting = false, historyQuery }: {
  departures: LiveDeparture[]; operator: string; routeNumber?: string; stopName?: string; locale: PlannerLocale;
  cancellations?: CancellationNotice[];
  scheduledTime?: string; timetableOnly?: boolean;
  onSelectDeparture?: (departure: LiveDeparture, key: string) => void;
  selectedDepartureKey?: string;
  earliestTime?: string;
  selecting?: boolean;
  historyQuery?: { stop: string; route: string; pattern?: string; board?: number; terminal?: boolean };
}) {
  const [showAll, setShowAll] = useState(false);
  const [showDeparted, setShowDeparted] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [departedRows, setDepartedRows] = useState<(LiveDeparture & { destination?: string })[]>([]);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [clock, setClock] = useState(() => Date.now());
  const departureVersion = departures.map(row => row.time + ':' + row.minutes + ':' + row.operator).join('|');
  useEffect(() => { const now = Date.now(); setReceivedAt(now); setClock(now); }, [departureVersion]);
  useEffect(() => {
    const tick = window.setInterval(() => { if (document.visibilityState !== 'hidden') setClock(Date.now()); }, 1000);
    return () => window.clearInterval(tick);
  }, []);
  const remaining = (row: LiveDeparture) => Math.max(0, Math.ceil(row.minutes - Math.max(0, clock - receivedAt) / 60000));
  const rows = departures.filter(row => !isNonOperatingDeparture(row) && !row.pastSchedule && Number.isFinite(Date.parse(row.time)) && Number.isFinite(row.minutes)
    && row.minutes >= 0 && row.minutes - Math.max(0, clock - receivedAt) / 60000 >= -1)
    .slice().sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const companyLabel = (id?: string) => !(id ?? (operator.includes('+') ? undefined : operator)) || id?.includes('+') ? copy(locale, '營辦商未提供', 'Operator not supplied')
    : locale === 'zh' ? shortNames[id ?? operator] ?? operatorName(id ?? operator, locale) : id ?? operator;
  const missing = operator.split('+').filter(id => !rows.some(row => row.operator === id));
  async function toggleDeparted() {
    if (showDeparted) { setShowDeparted(false); return; }
    setShowDeparted(true);
    if (historyLoaded || !historyQuery || historyLoading) return;
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ resource: 'departures', stop: historyQuery.stop, route: historyQuery.route, history: 'true', lang: locale });
      if (historyQuery.pattern) params.set('pattern', historyQuery.pattern);
      if (historyQuery.board !== undefined) params.set('board', String(historyQuery.board));
      if (historyQuery.terminal) params.set('terminal', 'true');
      const response = await transportFetch('/api/network?' + params, { cache: 'no-store' });
      if (!response.ok) throw new Error('Departed shifts unavailable');
      const payload = await response.json() as { data?: (LiveDeparture & { pastSchedule?: boolean; destination?: string })[] };
      setDepartedRows((payload.data ?? []).filter(row => row.pastSchedule && !isNonOperatingDeparture(row)
        && Number.isFinite(Date.parse(row.time)) && Number.isFinite(row.minutes)).sort((a, b) => Date.parse(b.time) - Date.parse(a.time)));
      setHistoryLoaded(true);
    } catch { setHistoryLoaded(false); }
    finally { setHistoryLoading(false); }
  }
  return <section className="joint-arrival-board" aria-label={(routeNumber ?? '') + ' ' + copy(locale, '路線到站及班次時間', 'Route arrivals and departures')}>
    <header><strong>{[routeNumber, stopName].filter(Boolean).join(' · ')}</strong><span>{rows.length ? copy(locale, '選擇班次', 'Departures') : historyQuery ? copy(locale, '班次時間', 'Schedule') : copy(locale, '上車時間估算 · 香港時間', 'Boarding estimate · HKT')}</span></header>
    {rows.length ? <>
      <div className={showAll ? 'arrival-board-scroll' : undefined}>
      <div className="departure-choices" role={onSelectDeparture ? 'radiogroup' : 'list'} aria-label={copy(locale, '選擇班次', 'Choose departure')} aria-busy={selecting}>
        {(showAll ? rows : rows.slice(0, 3)).map((row, index) => {
          const key = departureChoiceKey(row, index);
          const chosen = selectedDepartureKey ? selectedDepartureKey === key : row.time === scheduledTime && index === rows.findIndex(item => item.time === scheduledTime);
          const unreachable = earliestTime ? Date.parse(row.time) < Date.parse(earliestTime) - 1000 : false;
          const contents = <>
          <span className="departure-choice-time"><time dateTime={row.time}>{hongKongTimeLabel(row.time)}</time>
              <span className="arrival-company" style={routeBadgeStyle(row.operator ?? (operator.includes('+') ? '' : operator), routeNumber)}>{companyLabel(row.operator)}</span>
            </span>
            <span className="departure-choice-status"><DepartureBadge departure={row} locale={locale} compact /><TimetableDifference departure={row} locale={locale} compact />
              {arrivalRemark(row.remark) && <span className="joint-arrival-remark">{arrivalRemark(row.remark)}</span>}</span>
            <span className="departure-choice-wait"><strong>{remaining(row)}</strong> {copy(locale, '分', 'min')}
              {onSelectDeparture && <small>{unreachable ? copy(locale, '趕不及', 'Too early') : chosen ? copy(locale, '已選', 'Selected') : <span aria-hidden="true">○</span>}</small>}
            </span>
          </>;
          return onSelectDeparture ? <button type="button" role="radio" aria-checked={chosen} disabled={unreachable || selecting}
            className={'departure-choice' + (chosen ? ' is-selected' : '')} key={key} onClick={() => onSelectDeparture(row, key)}
            data-departure-type={departureType(row)} data-timing-type={departureTimingType(row)}>{contents}</button>
            : <div role="listitem" className="departure-choice" key={key} data-departure-type={departureType(row)} data-timing-type={departureTimingType(row)}>{contents}</div>;
        })}
      </div>
      </div>
      {rows.length > 3 && <button type="button" className="arrival-more-button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? copy(locale, '收起班次', 'Show fewer') : copy(locale, '更多班次', 'More departures') + ` (+${rows.length - 3})`}</button>}
      {operator.includes('+') && missing.length > 0 && <p className="joint-arrival-note">{missing.map(companyLabel).join(' / ')}{copy(locale, '：未有可顯示的到站或班次。', ': no arrivals or departures available.')}</p>}
    </> : <>
      {scheduledTime && Number.isFinite(Date.parse(scheduledTime)) && <p className="joint-arrival-note">{timetableOnly && <DepartureBadge departure={{ status: 'TIMETABLE' }} locale={locale} />} <strong>{hongKongTimeLabel(scheduledTime)}</strong> · {copy(locale, '此行程預計上車時間（非即時）', 'Estimated boarding time for this journey (not live)')}</p>}
      {!historyQuery && <p className="joint-arrival-note">{timetableOnly ? copy(locale, '此路段採用時間表估算，未套用現在的即時到站預測。', 'This leg uses a timetable estimate; current live arrivals are not applied.') : copy(locale, '暫無可核實的即時班次，請查看時間表；不代表服務已結束。', 'No verified live predictions. Check the timetable; this does not mean service has ended.')}</p>}
    </>}
    {historyQuery && <>
      <button type="button" className="arrival-history-button" aria-expanded={showDeparted} onClick={() => void toggleDeparted()} disabled={historyLoading}>
        {historyLoading ? copy(locale, '載入已過班次…', 'Loading past departures…') : showDeparted ? copy(locale, '收起已過班次', 'Hide past departures') : copy(locale, '查看已過班次', 'View past departures')}
      </button>
      {showDeparted && <div className="departure-history" aria-busy={historyLoading}>
        {departedRows.length ? <>
          <div className="departure-history-list" role="list" aria-label={copy(locale, '過去24小時班次', 'Departures in the past 24 hours')}>
            {departedRows.map((row, index) => <div role="listitem" className="departure-choice departure-history-row" key={row.time + ':' + row.operator + ':' + index}>
              <span className="departure-choice-time"><time dateTime={row.time}>{hongKongTimeLabel(row.time)}</time>
                <span className="arrival-company" style={routeBadgeStyle(row.operator ?? (operator.includes('+') ? '' : operator), routeNumber)}>{companyLabel(row.operator)}</span>
              </span>
              <span className="departure-choice-status"><DepartureBadge departure={row} locale={locale} compact />{row.destination && <small className="departure-history-destination">{row.destination}</small>}</span>
              <span className="departure-choice-wait departure-already-left"><strong>{copy(locale, '已過', 'Past')}</strong></span>
            </div>)}
          </div>
          <small className="departure-history-note">{departedRows.some(row => row.comparisonBasis === 'FREQUENCY' || row.comparisonBasis === 'INTERPOLATED')
            ? copy(locale, '按公布時間表計算；班距及中途站時間為估算，並非實際開車紀錄。', 'Calculated from published schedules; headway and intermediate-stop times are estimates, not observed departures.')
            : copy(locale, '只表示原定時間已過，並非實際開車紀錄。', 'Scheduled times only; this does not confirm the buses actually departed.')}</small>
        </> : <p className="joint-arrival-note">{historyLoading ? copy(locale, '載入中…', 'Loading…') : historyLoaded ? copy(locale, '過去24小時沒有可計算的已公布班次。', 'No published departures could be calculated for the past 24 hours.') : copy(locale, '無法載入已過班次，請再試。', 'Could not load past departures. Try again.')}</p>}
      </div>}
    </>}
    {cancellations.map((notice, index) => <p className="cancelled-departure" key={index}><DepartureBadge departure={notice} locale={locale} compact /> {notice.time && hongKongTimeLabel(notice.time)} {companyLabel(notice.operator)} · {notice.remark}</p>)}
    <details className="arrival-help"><summary>{copy(locale, '班次說明', 'Help')}</summary><DepartureLegend locale={locale} /><p>{copy(locale, '即時／時間表為預測來源；加班、取消、脫班為營辦商狀態。? 表示未確認。沒有預測不代表取消或脫班。', 'Live / Scheduled is the timing source. Additional, Cancelled and Missed are service statuses. ? means unconfirmed. Missing predictions alone do not indicate cancellation or a missed service.')}</p></details>
  </section>;
}

/** The occurrence keeps separate buses with an identical time and company selectable. */
export const departureChoiceKey = (row: LiveDeparture, occurrence: number) => row.time + ':' + (row.operator ?? '') + ':' + occurrence;
