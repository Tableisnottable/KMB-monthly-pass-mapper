import Link from 'next/link';
import { AlertList } from '../components/AlertList';

export default function TrafficPage() {
  return <main className="min-h-screen bg-cm-paper font-cm text-cm-ink"><div className="mx-auto max-w-4xl px-4 py-6 sm:px-6"><Link className="text-sm font-extrabold text-cm-greenDark" href="/">← 返回路線搜尋</Link><div className="mt-5 rounded-3xl bg-white p-5 shadow-card ring-1 ring-cm-line"><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-cm-greenDark">Road traffic</p><h1 className="mt-1 text-3xl font-extrabold">道路交通消息</h1><p className="mt-2 text-sm text-cm-muted">道路事故、工程、封路及擠塞；巴士服務消息另列。</p><div className="mt-5"><AlertList mode="events" /></div></div></div></main>;
}
