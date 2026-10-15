import { getTrafficSourceCatalog } from '../data/hkTrafficSources';
import { GoogleMapPanel } from './components/GoogleMapPanel';
import { LiveTransitSearch } from './components/LiveTransitSearch';
import { LocateButton } from './components/LocateButton';
import { JourneyPlanner } from './components/JourneyPlanner';

const trafficSources = getTrafficSourceCatalog();

export default function Home() {
  return (
    <main className="min-h-screen bg-cm-paper font-cm text-cm-ink">
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-cm-line bg-white/95 text-cm-ink backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cm-green text-white shadow-sm" aria-label="Transit Compass HK">
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 32 32" fill="none">
                <path d="M8 23.5 12.5 9h7L24 23.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="8" cy="23.5" r="3.2" fill="#fff" />
                <circle cx="24" cy="23.5" r="3.2" fill="#fff" />
                <circle cx="16" cy="9" r="3.2" fill="#fff" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">Transit Compass HK</h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <a className="hidden rounded-full px-3 py-2 text-sm font-bold text-cm-muted hover:bg-cm-paper hover:text-cm-ink sm:inline-flex" href="/updates">路線更新</a>
            <a className="hidden rounded-full px-3 py-2 text-sm font-bold text-cm-muted hover:bg-cm-paper hover:text-cm-ink sm:inline-flex" href="/traffic">交通事件</a>
            <a className="rounded-full px-3 py-2 text-sm font-bold text-cm-muted hover:bg-cm-paper hover:text-cm-ink" href="/en">
              EN
            </a>
            <LocateButton />
          </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6 lg:px-8">
        <div className="grid gap-3 lg:grid-cols-[minmax(380px,0.86fr)_minmax(0,1.14fr)] lg:items-start">
          <div className="space-y-3">
            <section id="live-search" className="cm-card p-3">
              <LiveTransitSearch />
            </section>
          </div>
          <div className="overflow-hidden rounded-3xl bg-white p-2 shadow-card ring-1 ring-cm-line lg:sticky lg:top-[68px]" id="map">
            <div className="mb-2 flex items-center justify-between px-2 pt-1">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cm-muted">地圖</p>
                <h2 className="text-base font-extrabold text-cm-ink">附近交通網絡</h2>
              </div>
              <span className="rounded-full bg-cm-green/10 px-2 py-1 text-[10px] font-bold text-cm-greenDark">香港</span>
            </div>
            <GoogleMapPanel />
          </div>
        </div>

        <div className="my-3 grid grid-cols-2 gap-2 rounded-3xl bg-white p-2 shadow-card ring-1 ring-cm-line sm:grid-cols-4">
          {[
            ['🚌', '巴士', '按資料比較'],
            ['🚶', '步行', '附近車站'],
            ['🚇', '港鐵', '比較車費'],
            ['⛴', '渡輪', '即將推出'],
          ].map(([icon, label, caption]) => (
            <button key={label} className="rounded-2xl px-3 py-3 text-left transition hover:bg-cm-paper">
              <div className="text-xl">{icon}</div>
              <div className="mt-1 text-sm font-extrabold text-cm-ink">{label}</div>
              <div className="text-[11px] text-cm-muted">{caption}</div>
            </button>
          ))}
        </div>

        <JourneyPlanner initialRoutes={[]} />
        </div>

      <footer className="mx-auto mt-6 max-w-7xl border-t border-cm-line px-4 py-6 text-xs text-cm-muted sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-extrabold text-cm-ink">資料來源與鳴謝</p>
            <p className="mt-1 max-w-2xl leading-5">
              路線、ETA、交通及鐵路資料只會在接通並驗證官方 endpoint 後顯示為即時資料。
              本網站不是政府或交通營辦商的官方網站。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:max-w-xl">
            {trafficSources.map((source) => (
              <a
                key={source.id}
                className="underline decoration-cm-line underline-offset-2 hover:text-cm-greenDark"
                href={source.officialUrl}
                rel="noreferrer"
                target="_blank"
              >
                {source.provider} - {source.category}
              </a>
            ))}
          </div>
        </div>
      </footer>
      </div>
      <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 rounded-2xl border border-cm-line bg-white/95 p-1 shadow-pop backdrop-blur sm:hidden">
        {[
          ['⌕', '搜尋', '#live-search'],
          ['⌖', '地圖', '#map'],
          ['⚠', '交通', '/traffic'],
          ['☰', '更多', '/updates'],
        ].map(([icon, label, href]) => (
          <a className="flex flex-col items-center rounded-xl px-2 py-2 text-[10px] font-bold text-cm-muted hover:bg-cm-green/10 hover:text-cm-greenDark" href={href} key={label}>
            <span className="text-base leading-4">{icon}</span>
            <span className="mt-1">{label}</span>
          </a>
        ))}
      </nav>
    </main>
  );
}
