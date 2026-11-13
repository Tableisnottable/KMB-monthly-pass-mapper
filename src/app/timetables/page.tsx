import Link from 'next/link';
import { TimetableBrowser } from '../components/TimetableBrowser';

export default async function TimetablesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === 'string' ? params[key] as string : '';
  const english = value('lang') === 'en';
  return <main className="timetables-page" lang={english ? 'en' : 'zh-HK'}>
    <header><Link href={english ? '/en' : '/'}>← {english ? 'Back to planner' : '返回行程規劃'}</Link>
      <Link href={'/timetables?' + new URLSearchParams({ lang: english ? 'zh' : 'en', route: value('route'), pattern: value('pattern'), stop: value('stop') })}>{english ? '繁體中文' : 'English'}</Link></header>
    <h1>{english ? 'Companies & timetables' : '營辦商及班次時間表'}</h1>
    <p>{english ? 'Government transport data · full published departures and headways · Hong Kong time' : '政府交通資料 · 全部已公布班次及班距 · 香港時間'}</p>
    <TimetableBrowser locale={english ? 'en' : 'zh'} initialRoute={value('route')} initialPattern={value('pattern')} initialStop={value('stop')} />
  </main>;
}
