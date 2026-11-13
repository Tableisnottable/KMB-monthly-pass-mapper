'use client';

import { useEffect, useRef, useState } from 'react';
import { PlannerIcon } from './PlannerIcon';
import { copy, modeIcon, modeLabel, routeBadgeStyle, routeSignColours, type PlannerLocale } from './plannerUi';

interface Stop { id: string; nameTc: string; nameEn: string; mode: string }
interface Departure { id: string; operator: string; number: string; mode: string; destination: string;
  minutes: number | null; status: 'LIVE' | 'TIMETABLE' | 'UNVERIFIED' | 'NO_UPCOMING' }

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
  async function choose(stop: Stop) {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setSelected(stop); setDepartures([]); setLoading(true); setMessage('');
    try {
      const response = await fetch('/api/network?resource=departures&lang=' + locale + '&stop=' + encodeURIComponent(stop.id),
        { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      if (active.current !== controller) return;
      setDepartures(payload.data);
      if (!payload.data.length) setMessage(copy(locale, '時間表內暫無即將開出的班次。', 'No upcoming departures in the published timetable.'));
    } catch { if (!controller.signal.aborted) setMessage(copy(locale, '班次暫時無法載入。', 'Departures are temporarily unavailable.')); }
    finally { if (active.current === controller) setLoading(false); }
  }
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
      <div className="station-departures">{departures.map(row => <div key={row.id}>
        <span className="route-badge route-stop-plate" title={row.operator + (routeSignColours(row.operator, row.number).verified ? '' : ' · ' + copy(locale, '站牌顏色未核實', 'Stop-plate colour not verified'))} style={routeBadgeStyle(row.operator, row.number)}><span className="route-badge-icon"><PlannerIcon name={modeIcon(row.mode)} size={18} /></span><strong>{row.number || modeLabel(row.mode, locale)}</strong></span>
        <span>{row.destination}<small>{row.operator} · {row.status === 'LIVE' ? copy(locale, '即時', 'Live')
          : row.status === 'TIMETABLE' ? copy(locale, '時間表', 'Timetable') : copy(locale, '服務未能核實', 'Service unverified')}</small></span>
        <strong>{row.status === 'NO_UPCOMING' ? '—' : row.minutes === null ? '—' : row.minutes + ' min'}</strong>
      </div>)}</div>
      {!loading && <button type="button" className="all-results-button" onClick={() => void choose(selected)}>{copy(locale, '更新班次', 'Refresh departures')}</button>}
    </>}
    {loading && <p role="status">{copy(locale, '正在載入…', 'Loading…')}</p>}
    {message && <p role="status">{message}</p>}
    <p className="station-data-note">{copy(locale, '時間表不代表即時到站，未能核實的服務請向營辦商查詢。', 'Timetables are not live predictions. Confirm unverified services with the operator.')} <a href="/coverage">{copy(locale, '資料涵蓋範圍', 'Coverage')}</a></p>
  </div>;
}
