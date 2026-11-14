'use client';

import { transportFetch as fetch } from '../../browser/transportClient';

import { useEffect, useState } from 'react';
import { copy, modeIcon, routeBadgeStyle, type PlannerLocale } from './plannerUi';
import { PlannerIcon } from './PlannerIcon';
import { hongKongInputValue, hongKongTimeLabel } from '../../engine/journeyTime';
import type { routeTimetable } from '../../data/networkTimetable';
import type { residentsRoutes, residentsDirectoryMeta } from '../../data/residentsServices';

interface Company { id: string; nameEn: string; nameTc: string; urls: string[]; routeCount: number; timetablePatterns: number; scheduleRecords: number; liveArrivals: boolean; officialDocuments?: boolean }
interface RouteResult { id: string; operator: string; number: string; nameTc: string; nameEn: string; mode: string }
type Timetable = ReturnType<typeof routeTimetable> & { company?: Company; residentDocument?: typeof residentsRoutes[number]; meta: { importedOn: string; source: string } };
type ResidentsData = { resident: typeof residentsRoutes[number]; meta: typeof residentsDirectoryMeta };

export function TimetableBrowser({ locale = 'zh', initialRoute = '', initialPattern = '', initialStop = '', initialCompany = '' }:
  { locale?: PlannerLocale; initialRoute?: string; initialPattern?: string; initialStop?: string; initialCompany?: string }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState(initialCompany);
  const [query, setQuery] = useState('');
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [routeId, setRouteId] = useState(initialRoute);
  const [date, setDate] = useState(hongKongInputValue().slice(0, 10));
  const [pattern, setPattern] = useState(initialPattern);
  const [stop, setStop] = useState(initialStop);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [residentsData, setResidentsData] = useState<ResidentsData | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [routeError, setRouteError] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/network?resource=operators', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const payload = await response.json(); setCompanies(payload.data);
    }).catch(() => { if (!controller.signal.aborted) setRouteError(copy(locale, '無法載入營辦商。', 'Could not load companies.')); });
    return () => controller.abort();
  }, [locale]);

  useEffect(() => {
    const controller = new AbortController();
    setRouteLoading(true); setRouteError('');
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ resource: 'routes', operator: company, q: query, limit: '100', offset: String(offset) });
      fetch('/api/network?' + params, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error();
        const payload = await response.json();
        if (controller.signal.aborted) return;
        setRoutes(previous => offset ? [...previous, ...payload.data] : payload.data); setTotal(payload.total);
      }).catch(() => { if (!controller.signal.aborted) setRouteError(copy(locale, '無法載入路線，請重試。', 'Could not load routes. Please try again.')); })
        .finally(() => { if (!controller.signal.aborted) setRouteLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [company, query, offset, locale]);

  useEffect(() => {
    if (!routeId || !date) { setTimetable(null); setResidentsData(null); setLoading(false); setError(''); return; }
    const controller = new AbortController();
    setLoading(true); setError(''); setTimetable(null); setResidentsData(null);
    const params = new URLSearchParams({ resource: routeId.startsWith('residents:') ? 'residents' : 'timetable', route: routeId, date });
    if (pattern) params.set('pattern', pattern);
    if (stop) params.set('stop', stop);
    fetch('/api/network?' + params, { signal: controller.signal }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      if (!controller.signal.aborted) {
        if (payload.resident) setResidentsData(payload); else setTimetable(payload);
      }
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : copy(locale, '時間表載入失敗。', 'Could not load timetable.')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [routeId, date, pattern, stop, locale]);

  const selectedVariant = timetable?.variants.find(variant => variant.id === timetable.selectedPattern);
  const name = (company: Pick<Company, 'nameEn' | 'nameTc'>) => company[locale === 'en' ? 'nameEn' : 'nameTc'];
  const stopName = (tuple: (string | number)[]) => String(tuple[locale === 'en' ? 2 : 1]);
  return <div className="timetable-browser">
    <section className="timetable-company-summary" aria-label={copy(locale, '政府資料營辦商', 'Companies in government data')}>
      <h2>{copy(locale, '政府資料提供的營辦商及網絡', 'Companies and networks in government data')}</h2>
      <p>{copy(locale, '小巴、渡輪、跨境及居民服務在來源中可能以服務組別列出，並非每家公司的獨立名單。', 'Minibus, ferry, cross-boundary and residents’ services may be grouped by the source rather than listed as individual companies.')}</p>
      <details><summary>{copy(locale, '查看全部 ', 'View all ')}{companies.length}{copy(locale, ' 個營辦商／網絡', ' companies / networks')}</summary>
        <div className="timetable-company-list">{companies.map(item => <div key={item.id}>
          <strong>{name(item)}</strong><span>{item.routeCount} {copy(locale, '條路線／變體', 'routes / variants')}</span>
          <small>{item.officialDocuments ? copy(locale, '官方班次、車費及服務條件文件', 'Official schedule, fare and service condition documents') : item.timetablePatterns ? item.scheduleRecords.toLocaleString() + ' ' + copy(locale, '筆時間表／班距記錄', 'schedule / headway records') : copy(locale, '未提供完整班次表', 'Full timetable not published')}
            {item.liveArrivals ? ' · ' + copy(locale, '可用即時到站', 'Available live arrivals') : ''}</small>
          <a href={item.urls[0]} target="_blank" rel="noreferrer">{copy(locale, '官方營辦商／服務資料', 'Official company / service information')}</a>
        </div>)}</div>
      </details>
    </section>
    <div className="timetable-layout">
      <section className="timetable-route-picker" aria-label={copy(locale, '選擇路線', 'Choose route')}>
        <label>{copy(locale, '公司／網絡', 'Company / network')}<select aria-label={copy(locale, '公司／網絡', 'Company / network')} value={company}
          onChange={event => { setCompany(event.target.value); setOffset(0); setRoutes([]); }}>
          <option value="">{copy(locale, '全部營辦商', 'All companies')}</option>{companies.map(item => <option key={item.id} value={item.id}>{name(item)} ({item.routeCount})</option>)}
        </select></label>
        <label>{copy(locale, '路線號碼或目的地', 'Route number or destination')}<input aria-label={copy(locale, '路線號碼或目的地', 'Route number or destination')} value={query}
          placeholder={copy(locale, '例如 A23、44、NR331、機場', 'e.g. A23, 44, NR331, Airport')} onChange={event => { setQuery(event.target.value); setOffset(0); setRoutes([]); }} /></label>
        <p className="timetable-count">{total.toLocaleString()} {copy(locale, '條符合路線', 'matching routes')}</p>
        <p className="timetable-note">{copy(locale, '按路線號碼排序：1、2、2A…10…A10、A11…NR2、NR10', 'Route number order: 1, 2, 2A…10…A10, A11…NR2, NR10')}</p>
        {routeError && <p role="alert">{routeError}</p>}
        <div className="timetable-route-list">{routes.map(route => <button type="button" key={route.id} aria-pressed={route.id === routeId}
          onClick={() => { setRouteId(route.id); setPattern(''); setStop(''); }}>
          <span className="route-badge route-stop-plate" style={routeBadgeStyle(route.operator, route.number)}><span className="route-badge-icon"><PlannerIcon name={modeIcon(route.mode)} size={18} /></span><strong>{route.number || route.operator}</strong></span>
          <span>{locale === 'en' ? route.nameEn : route.nameTc}<small>{name(companies.find(item => item.id === route.operator) ?? { nameEn: route.operator, nameTc: route.operator })}</small></span>
        </button>)}</div>
        {routeLoading && <p role="status">{copy(locale, '正在載入路線…', 'Loading routes…')}</p>}
        {!routeLoading && routes.length < total && <button className="all-results-button" type="button" onClick={() => setOffset(routes.length)}>{copy(locale, '載入更多路線', 'Load more routes')}</button>}
      </section>
      <section className="timetable-panel" aria-label={copy(locale, '完整班次時間表', 'Full service timetable')}>
        <label>{copy(locale, '服務日期（香港時間）', 'Service date (Hong Kong time)')}<input type="date" aria-label={copy(locale, '服務日期', 'Service date')} value={date} disabled={routeId.startsWith('residents:')} onInput={event => setDate(event.currentTarget.value)} onChange={event => setDate(event.target.value)} /></label>
        {!routeId && <p>{copy(locale, '選擇路線，查看全部已公布班次及班距。', 'Choose a route to see all published departures and frequency windows.')}</p>}
        {loading && <p role="status">{copy(locale, '正在載入時間表…', 'Loading timetable…')}</p>}
        {error && <p role="alert">{error}</p>}
        {residentsData && <>
          <h2><span className="route-badge route-stop-plate" style={routeBadgeStyle('RESIDENTS', residentsData.resident.number)}><span className="route-badge-icon"><PlannerIcon name="bus" size={18} /></span><strong>{residentsData.resident.number}</strong></span> {copy(locale, '居民巴士服務', 'Residents’ service')}</h2>
          <h3>{residentsData.resident[locale === 'en' ? 'nameEn' : 'nameTc']}</h3>
          <p>{copy(locale, '地區：', 'District: ')}{residentsData.resident[locale === 'en' ? 'districtEn' : 'districtTc']}</p>
          <p className="timetable-note">{copy(locale, '此服務以運輸署官方文件列出班次、車費、營辦商及乘搭條件；日期及適用乘客以文件為準。未有可核實的逐站座標及機讀日曆，因此暫不納入自動行程規劃或即時到站。', 'The TD document lists schedules, fares, operator and boarding conditions. Check the document for applicable dates and passenger eligibility. Verified stop coordinates and machine-readable calendars are not available in this directory, so these services are not yet used for automatic journey planning or live arrivals.')}</p>
          <p><a className="residents-document-link" href={residentsData.resident[locale === 'en' ? 'documentUrlEn' : 'documentUrlTc']} target="_blank" rel="noreferrer">{copy(locale, '開啟官方班次、車費及服務詳情（PDF） ↗', 'Open official timetable, fares and service details (PDF) ↗')}</a></p>
          <div className="residents-documents"><strong>{copy(locale, '官方服務文件', 'Official service documents')}</strong><p>{copy(locale, '查看完整班次、車費及乘搭條件：', 'View full schedules, fares and boarding conditions:')}</p>
            <a href={residentsData.resident.documentUrlTc} target="_blank" rel="noreferrer">中文 PDF ↗</a>
            <a href={residentsData.resident.documentUrlEn} target="_blank" rel="noreferrer">English PDF ↗</a>
          </div>
          <p className="timetable-note">{copy(locale, '目錄匯入日期：', 'Directory imported: ')}{residentsData.meta.importedOn} · <a href={residentsData.resident[locale === 'en' ? 'sourceUrlEn' : 'sourceUrlTc']} target="_blank" rel="noreferrer">{copy(locale, '運輸署核准路線目錄', 'TD approved service directory')}</a></p>
        </>}
        {timetable && <>
          <h2><span className="route-badge route-stop-plate" style={routeBadgeStyle(timetable.route[1], timetable.route[2])}><span className="route-badge-icon"><PlannerIcon name={modeIcon(timetable.route[5])} size={18} /></span><strong>{timetable.route[2] || timetable.route[1]}</strong></span> {timetable.company ? name(timetable.company) : timetable.route[1]}</h2>
          {timetable.residentDocument && <p className="timetable-note"><a href={timetable.residentDocument[locale === 'en' ? 'documentUrlEn' : 'documentUrlTc']} target="_blank" rel="noreferrer">{copy(locale, '運輸署官方班次、車費及乘搭條件（PDF） ↗', 'TD official schedule, fares and boarding conditions (PDF) ↗')}</a></p>}
          <label>{copy(locale, '方向／服務變體', 'Direction / service variant')}<select aria-label={copy(locale, '方向／服務變體', 'Direction / service variant')} value={timetable.selectedPattern}
            onChange={event => { setPattern(event.target.value); setStop(''); }}>
            {timetable.variants.map((variant, index) => <option key={variant.id} value={variant.id}>{stopName(variant.origin)} → {stopName(variant.destination)} · {index + 1}</option>)}
          </select></label>
          <label>{copy(locale, '上車站', 'Boarding stop')}<select aria-label={copy(locale, '上車站', 'Boarding stop')} value={selectedVariant?.stops[timetable.boardingIndex]?.id ?? ''} onChange={event => setStop(event.target.value)}>
            {selectedVariant?.stops.filter(item => item.canBoard).map(item => <option key={item.position} value={item.id}>{item.position + 1}. {locale === 'en' ? item.nameEn : item.nameTc}</option>)}
          </select></label>
          <p className="timetable-note">{copy(locale, '列出所選服務日的全部記錄，包括翌日凌晨。班距區間終點不包括在內；中途站時間可能按距離推算。', 'All records for the selected service day, including after midnight. Frequency window ends are exclusive; intermediate stop times may be interpolated.')}</p>
          {!timetable.timetablePublished ? <p role="status">{copy(locale, '此來源未提供完整班次時間表，請查閱營辦商資料或即時到站。', 'This source does not publish a full timetable. Check operator information or live arrivals.')}</p>
            : !timetable.calendarCovered ? <p role="status">{copy(locale, '此日期超出已匯入的服務日曆範圍。', 'This date is outside the imported service calendar coverage.')}</p>
              : !timetable.entries.length ? <p role="status">{copy(locale, '所選服務日沒有已公布班次。', 'No published service on this service date.')}</p> : <>
                <p>{timetable.entries.length.toLocaleString()} {copy(locale, '筆班次／班距記錄', 'departure / frequency records')}</p>
                <table className="timetable-table"><thead><tr><th>{copy(locale, '出發（HKT）', 'Departure (HKT)')}</th><th>{copy(locale, '班次資料', 'Service')}</th></tr></thead>
                  <tbody>{timetable.entries.map(entry => <tr key={entry.id}>
                    <td>{hongKongTimeLabel(entry.start)}{entry.startMinute >= 1440 && <small> +{Math.floor(entry.startMinute / 1440)}d</small>}
                      {entry.kind === 'FREQUENCY' && <> – {hongKongTimeLabel(entry.end)}{entry.endMinute >= 1440 && <small> +{Math.floor(entry.endMinute / 1440)}d</small>}</>}</td>
                    <td>{entry.kind === 'FREQUENCY' ? copy(locale, '每 ', 'Every ') + entry.headwayMinutes + ' min' : copy(locale, '指定班次', 'Scheduled departure')}
                      {entry.estimatedStopTime && <small>{copy(locale, '中途站時間估算', 'Estimated intermediate stop time')}</small>}
                      {entry.calendarAdded && <span className="added-departure">{copy(locale, '（新增）', '(Added)')}</span>}</td>
                  </tr>)}</tbody></table>
              </>}
          <p className="timetable-note">{copy(locale, '運輸署時間表匯入日期：', 'TD timetable imported: ')}{timetable.meta.importedOn} · <a href={timetable.meta.source}>{copy(locale, '政府原始資料', 'Government source')}</a></p>
        </>}
      </section>
    </div>
  </div>;
}
