'use client';

import { useMemo, useState } from 'react';
import type { RouteUpdate, TrafficEvent } from '../../data/trafficAlerts';

const severityClass = {
  INFO: 'bg-slate-100 text-slate-700',
  MINOR: 'bg-amber-100 text-amber-800',
  MAJOR: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
} as const;

export function AlertList({
  updates,
  events,
  mode,
}: {
  updates: readonly RouteUpdate[];
  events: readonly TrafficEvent[];
  mode: 'updates' | 'events';
}) {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('ALL');
  const items = useMemo(() => {
    const source = mode === 'updates' ? updates : events;
    return source.filter((item) => {
      const text = JSON.stringify(item).toLowerCase();
      return (severity === 'ALL' || item.severity === severity) && text.includes(query.toLowerCase());
    });
  }, [events, mode, query, severity, updates]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input className="flex-1 rounded-xl border-0 bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200" onChange={(event) => setQuery(event.target.value)} placeholder="搜尋路線、地點或事件" value={query} />
        <select className="rounded-xl border-0 bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200" onChange={(event) => setSeverity(event.target.value)} value={severity}>
          <option value="ALL">全部嚴重程度</option><option value="INFO">資訊</option><option value="MINOR">輕微</option><option value="MAJOR">主要</option><option value="CRITICAL">嚴重</option>
        </select>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h2 className="font-bold text-slate-900">{item.title}</h2><p className="mt-1 text-sm text-slate-500">{'location' in item ? item.location : `${item.operator} · ${item.routeNumbers.join(', ')}`}</p></div>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${severityClass[item.severity]}`}>{item.severity}</span>
            </div>
            <p className="mt-3 text-sm text-slate-700">{item.summary}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">{item.details}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span>{'affectedRouteNumbers' in item ? `受影響：${item.affectedRouteNumbers.join(', ')}` : `生效：${new Date(item.effectiveFrom).toLocaleString('zh-HK')}`}</span>
              <a className="font-bold text-cm-greenDark underline" href={item.sourceUrl} rel="noreferrer" target="_blank">來源：{item.sourceName}</a>
            </div>
          </article>
        ))}
        {items.length === 0 && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">沒有符合條件的資料。</p>}
      </div>
    </div>
  );
}
