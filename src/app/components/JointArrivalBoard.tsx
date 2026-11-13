import React from 'react';
import type { LiveDeparture } from '../../data/networkTimetable';
import { hongKongTimeLabel } from '../../engine/journeyTime';
import { operatorName } from '../../data/transportOperators';
import { AddedDeparture } from './AddedDeparture';
import { copy, type PlannerLocale } from './plannerUi';

const shortNames: Record<string, string> = { KMB: '九巴', CTB: '城巴', LWB: '龍運' };

export function JointArrivalBoard({ departures, operator, routeNumber, stopName, locale }: {
  departures: LiveDeparture[]; operator: string; routeNumber?: string; stopName?: string; locale: PlannerLocale;
}) {
  const rows = departures.filter(row => Number.isFinite(Date.parse(row.time)) && Number.isFinite(row.minutes) && row.minutes >= 0)
    .slice().sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const companyLabel = (id?: string) => !id || id.includes('+') ? copy(locale, '營辦商未提供', 'Operator not supplied')
    : locale === 'zh' ? shortNames[id] ?? operatorName(id, locale) : id;
  const missing = operator.split('+').filter(id => !rows.some(row => row.operator === id));
  return <section className="joint-arrival-board" aria-label={(routeNumber ?? '') + ' ' + copy(locale, '聯營路線到站時間', 'Joint route arrivals')}>
    <header><strong>{[routeNumber, stopName].filter(Boolean).join(' · ')}</strong><span>{copy(locale, '即時到站 · 香港時間', 'Live arrivals · HKT')}</span></header>
    {rows.length ? <>
      <table><caption className="sr-only">{copy(locale, '到站時間、等候分鐘及營辦商', 'Arrival time, minutes and operator')}</caption>
        <tbody>{rows.map((row, index) => <tr key={row.time + ':' + row.operator + ':' + index}>
          <td><time dateTime={row.time}>{hongKongTimeLabel(row.time)}</time></td>
          <td><strong>{Math.ceil(row.minutes)}</strong> {copy(locale, '分鐘', 'min')}</td>
          <td aria-hidden="true">–</td><td>{companyLabel(row.operator)} <AddedDeparture departure={row} locale={locale} />
            {row.remark && <span className="joint-arrival-remark">{row.remark}</span>}</td>
        </tr>)}</tbody></table>
      {missing.length > 0 && <p className="joint-arrival-note">{missing.map(companyLabel).join(' / ')}{copy(locale, '：未有可顯示的即時班次。', ': no live predictions available.')}</p>}
    </> : <p className="joint-arrival-note">{copy(locale, '暫無可核實的即時班次，請查看時間表；不代表服務已結束。', 'No verified live predictions. Check the timetable; this does not mean service has ended.')}</p>}
  </section>;
}
