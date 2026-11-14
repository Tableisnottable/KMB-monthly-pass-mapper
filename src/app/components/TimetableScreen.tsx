'use client';
import { useEffect, useState } from 'react';
import { TimetableBrowser } from './TimetableBrowser';

export function TimetableScreen() {
  const [query, setQuery] = useState<string | null>(null);
  useEffect(() => setQuery(window.location.search), []);
  const params = new URLSearchParams(query ?? '');
  const value = (key: string) => params.get(key) ?? '';
  const english = value('lang') === 'en';
  return <main className="timetables-page" lang={english ? 'en' : 'zh-HK'}>
    <header><a href={english ? '/en' : '/'}>← {english ? 'Back to planner' : '返回行程規劃'}</a>
      <a href={'/timetables?' + new URLSearchParams({ lang: english ? 'zh' : 'en', route: value('route'), pattern: value('pattern'), stop: value('stop'), operator: value('operator') })}>{english ? '繁體中文' : 'English'}</a></header>
    <h1>{english ? 'Companies & timetables' : '營辦商及班次時間表'}</h1>
    <p>{english ? 'Government transport data · full published departures and headways · Hong Kong time' : '政府交通資料 · 全部已公布班次及班距 · 香港時間'}</p>
    {query === null ? <p role="status">正在載入時間表… Loading timetables…</p>
      : <TimetableBrowser locale={english ? 'en' : 'zh'} initialRoute={value('route')} initialPattern={value('pattern')} initialStop={value('stop')} initialCompany={value('operator')} />}
  </main>;
}
