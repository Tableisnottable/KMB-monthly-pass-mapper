'use client';

import { transportFetch as fetch } from '../../browser/transportClient';

import { useMemo, useState } from 'react';
import { operatorNoticeLinks, TRAFFIC_NEWS_URL, type TrafficFeed } from '../../data/trafficAlerts';
import { useAutoRefresh } from './useAutoRefresh';

const hkTime = (value: string) => new Date(value).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong', hour12: false });
export function AlertList({ mode }: { mode: 'updates' | 'events' }) {
  const [query, setQuery] = useState('');
  const [feed, setFeed] = useState<TrafficFeed | null>(null);
  const [error, setError] = useState(false);
  const polling = useAutoRefresh(mode, async signal => {
        const response = await fetch(mode === 'updates' ? '/api/updates' : '/api/traffic', { signal, cache: 'no-store' });
        if (!response.ok) throw new Error();
        const result = await response.json() as TrafficFeed;
        if (result.meta.status !== 'AVAILABLE') { setError(true); throw new Error('Source unavailable'); }
        if (!signal.aborted) { setFeed(result); setError(false); }
  }, 60_000);
  const items = useMemo(() => (feed?.data ?? []).filter(item => (item.textTc + ' ' + item.textEn).toLowerCase().includes(query.trim().toLowerCase())), [feed, query]);
  return <div>
    <aside className="mb-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
      <p>資料來源：<a className="underline" href={TRAFFIC_NEWS_URL} target="_blank" rel="noreferrer">運輸署特別交通消息</a>。每分鐘重新查詢；所有時間以香港時間顯示。來源參考時間並非事件開始或公告生效時間。</p>
      {mode === 'updates' ? <><p className="mt-2">只列出巴士及小巴服務消息。同時涉及道路及巴士的消息只放在本頁，不會在道路交通頁重複。此來源並非所有營辦商的完整公告，請另查官方網站：</p>
        <div className="mt-2 flex flex-wrap gap-4">{operatorNoticeLinks.map(item => <a key={item.name} className="underline" href={item.url} target="_blank" rel="noreferrer">{item.name} ↗</a>)}</div></>
        : <p className="mt-2">只列出道路事故、工程、封路及擠塞消息。巴士服務消息另列於巴士服務頁；鐵路及渡輪服務公告不列入這兩頁。</p>}
      {feed?.meta.fetchedAt && <p className="mt-2">最近成功擷取：{hkTime(feed.meta.fetchedAt)}（HKT）</p>}
    </aside>
    <div className="mb-4 flex gap-2"><input aria-label={mode === 'updates' ? '搜尋巴士消息' : '搜尋道路消息'} className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200" onChange={event => setQuery(event.target.value)} placeholder={mode === 'updates' ? '搜尋巴士路線、站點或服務' : '搜尋道路、地點或交通事件'} value={query} />
      <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" disabled={polling.loading} onClick={polling.refresh}>重新整理</button></div>
    {(error || polling.failed) && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">暫時無法核實最新交通消息，不能據此判斷服務正常。{feed?.data.length ? '下方保留上次成功擷取的資料，可能已過時。' : '請查看官方消息來源。'}</p>}
    {!feed && !error && <p role="status">正在載入官方交通消息…</p>}
    <div className="space-y-3">{items.map(item => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" key={item.id}>
      <div className="mb-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>運輸署特別交通消息 · {item.id}</span><span>{item.category === 'BUS' ? '巴士／小巴服務' : '道路交通'}</span></div>
      <p className="whitespace-pre-line text-sm leading-7 text-slate-800">{item.textTc || item.textEn}</p>
      {item.textTc && item.textEn && <details className="mt-3 text-sm text-slate-600"><summary className="cursor-pointer">English original</summary><p lang="en" className="mt-2 whitespace-pre-line leading-6">{item.textEn}</p></details>}
      <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>來源參考時間：{item.sourceReferenceAt ? hkTime(item.sourceReferenceAt) + '（HKT）' : item.sourceReference || '來源未提供'}</span>
        <a className="font-bold text-cm-greenDark underline" href={item.sourceUrl} target="_blank" rel="noreferrer">官方原始消息 ↗</a>
      </div>
    </article>)}</div>
    {!error && feed?.meta.status === 'AVAILABLE' && !items.length && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">{query.trim() ? '沒有符合搜尋條件的消息。' : mode === 'updates' ? '官方來源此次未列出巴士服務消息；不代表所有巴士服務正常。' : '官方來源此次未列出道路交通消息；不代表所有道路暢通。'}</p>}
  </div>;
}
