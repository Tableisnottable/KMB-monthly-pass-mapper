'use client';

import { useEffect, useMemo, useState } from 'react';
import { operatorNoticeLinks, TRAFFIC_NEWS_URL, type TrafficFeed } from '../../data/trafficAlerts';

const hkTime = (value: string) => new Date(value).toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong', hour12: false });
export function AlertList({ mode }: { mode: 'updates' | 'events' }) {
  const [query, setQuery] = useState('');
  const [feed, setFeed] = useState<TrafficFeed | null>(null);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const fetchNews = async () => {
      try {
        const response = await fetch(mode === 'updates' ? '/api/updates' : '/api/traffic', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error();
        const result = await response.json() as TrafficFeed;
        if (!controller.signal.aborted) {
          if (result.meta.status === 'AVAILABLE') setFeed(result);
          setError(result.meta.status !== 'AVAILABLE');
        }
      } catch { if (!controller.signal.aborted) setError(true); }
    };
    void fetchNews();
    const interval = window.setInterval(fetchNews, 60000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [mode, refresh]);
  const items = useMemo(() => (feed?.data ?? []).filter(item => (item.textTc + ' ' + item.textEn).toLowerCase().includes(query.trim().toLowerCase())), [feed, query]);
  return <div>
    <aside className="mb-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
      <p>資料來源：<a className="underline" href={TRAFFIC_NEWS_URL} target="_blank" rel="noreferrer">運輸署特別交通消息</a>。每分鐘重新查詢；所有時間以香港時間顯示。來源參考時間並非事件開始或公告生效時間。</p>
      {mode === 'updates' && <><p className="mt-2">此頁只篩選運輸署消息中提及公共交通的內容，並非所有營辦商的路線公告。營辦商公告尚未直接接入，請另查官方網站：</p>
        <div className="mt-2 flex flex-wrap gap-4">{operatorNoticeLinks.map(item => <a key={item.name} className="underline" href={item.url} target="_blank" rel="noreferrer">{item.name} ↗</a>)}</div></>}
      {feed?.meta.fetchedAt && <p className="mt-2">最近成功擷取：{hkTime(feed.meta.fetchedAt)}（HKT）</p>}
    </aside>
    <div className="mb-4 flex gap-2"><input aria-label="搜尋交通消息" className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200" onChange={event => setQuery(event.target.value)} placeholder="搜尋路線、地點或事件" value={query} />
      <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" onClick={() => setRefresh(value => value + 1)}>重新整理</button></div>
    {error && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">暫時無法核實最新交通消息，不能據此判斷服務正常。{feed?.data.length ? '下方保留上次成功擷取的資料，可能已過時。' : '請查看官方消息來源。'}</p>}
    {!feed && !error && <p role="status">正在載入官方交通消息…</p>}
    <div className="space-y-3">{items.map(item => <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" key={item.id}>
      <div className="mb-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>運輸署特別交通消息 · {item.id}</span><span>{item.publicTransport ? '提及公共交通' : '道路交通'}</span></div>
      <p className="whitespace-pre-line text-sm leading-7 text-slate-800">{item.textTc || item.textEn}</p>
      {item.textTc && item.textEn && <details className="mt-3 text-sm text-slate-600"><summary className="cursor-pointer">English original</summary><p lang="en" className="mt-2 whitespace-pre-line leading-6">{item.textEn}</p></details>}
      <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>來源參考時間：{item.sourceReferenceAt ? hkTime(item.sourceReferenceAt) + '（HKT）' : item.sourceReference || '來源未提供'}</span>
        <a className="font-bold text-cm-greenDark underline" href={item.sourceUrl} target="_blank" rel="noreferrer">官方原始消息 ↗</a>
      </div>
    </article>)}</div>
    {!error && feed?.meta.status === 'AVAILABLE' && !items.length && <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">{query.trim() ? '沒有符合搜尋條件的消息。' : '官方來源此次未列出此類消息；不代表所有路線服務正常。'}</p>}
  </div>;
}
