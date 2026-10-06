import { scoreRoutes, type RouteOption, type TransitLeg } from '../engine/UpgradedScoringEngine';
import { getMonthlyPassInsight } from '../domain/monthlyPass';
import MonthlySavingsCounter from './components/MonthlySavingsCounter';
import { CalendarAndPlaces } from './components/CalendarAndPlaces';
import TrafficHeatmap from './components/TrafficHeatmap';
import { GoogleMapPanel } from './components/GoogleMapPanel';
import { getTrafficSourceCatalog } from '../data/hkTrafficSources';
import { getAlertsForRoutes } from '../data/trafficAlerts';
import { LiveTransitSearch } from './components/LiveTransitSearch';
import { JourneyPlaceSearch } from './components/JourneyPlaceSearch';

const stop = (
  id: string,
  name: string,
  lat: number,
  lng: number,
): { id: string; name: string; lat: number; lng: number } => ({
  id,
  name,
  lat,
  lng,
});

const makeLeg = (
  id: string,
  operator: RouteOption['legs'][number]['operator'],
  mode: RouteOption['legs'][number]['mode'],
  routeNumber: string,
  from: { id: string; name: string; lat: number; lng: number },
  to: { id: string; name: string; lat: number; lng: number },
  journeyTimeMinutes: number,
  scheduledIntervalMinutes: number,
  fare: number,
  eta: number | null,
): TransitLeg => ({
  id,
  operator,
  mode,
  routeNumber,
  originStop: from,
  destinationStop: to,
  journeyTimeMinutes,
  scheduledIntervalMinutes,
  realtimeEta: null,
  fare,
});

const routes: RouteOption[] = [
  {
    id: 'route-best',
    walkTransferTimeMinutes: 4,
    transferCount: 1,
    legs: [
      makeLeg(
        'leg-1',
        'KMB',
        'BUS',
        '5',
        stop('s1', 'Jordan', 22.3044, 114.1718),
        stop('s2', 'Central', 22.2819, 114.1581),
        18,
        9,
        18.5,
        7,
      ),
      makeLeg(
        'leg-2',
        'MTR',
        'SUBWAY',
        'Island Line',
        stop('s3', 'Central', 22.2819, 114.1581),
        stop('s4', 'Tsim Sha Tsui', 22.2971, 114.1742),
        13,
        6,
        20,
        6,
      ),
    ],
  },
  {
    id: 'route-faster',
    walkTransferTimeMinutes: 2,
    transferCount: 0,
    legs: [
      makeLeg(
        'leg-3',
        'MTR',
        'SUBWAY',
        'Tsuen Wan Line',
        stop('s5', 'Jordan', 22.3044, 114.1718),
        stop('s6', 'Tsim Sha Tsui', 22.2971, 114.1742),
        27,
        5,
        22.5,
        11,
      ),
    ],
  },
  {
    id: 'route-cheap',
    walkTransferTimeMinutes: 8,
    transferCount: 2,
    legs: [
      makeLeg(
        'leg-4',
        'CTB',
        'BUS',
        '970',
        stop('s7', 'Jordan', 22.3044, 114.1718),
        stop('s8', 'Causeway Bay', 22.2795, 114.1839),
        23,
        12,
        19.5,
        10,
      ),
      makeLeg(
        'leg-5',
        'CTB',
        'BUS',
        '37A',
        stop('s9', 'Causeway Bay', 22.2795, 114.1839),
        stop('s10', 'Tsim Sha Tsui', 22.2971, 114.1742),
        16,
        10,
        17,
        null,
      ),
    ],
  },
];

const scoredRoutes = scoreRoutes(routes, new Date('2026-09-13T18:25:00+08:00')).sort(
  (a, b) => a.finalScore - b.finalScore,
);

const bestRoute = scoredRoutes[0];
const bestPassInsight = getMonthlyPassInsight(bestRoute);
const trafficSources = getTrafficSourceCatalog();

const operatorClasses: Record<string, string> = {
  KMB: 'bg-amber-100 text-amber-700',
  LWB: 'bg-sky-100 text-sky-700',
  MTR: 'bg-blue-100 text-blue-700',
  CTB: 'bg-emerald-100 text-emerald-700',
};

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) {
    return `${mins} min`;
  }
  return `${hours}h ${mins}m`;
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#eef1f4] text-slate-900">
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 text-slate-900 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#176b2c] text-white shadow-sm" aria-label="Transit Compass HK">
              <svg aria-hidden="true" className="h-7 w-7" viewBox="0 0 32 32" fill="none">
                <path d="M8 23.5 12.5 9h7L24 23.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="8" cy="23.5" r="3" fill="#f97316" />
                <circle cx="24" cy="23.5" r="3" fill="#2e8b57" />
                <circle cx="16" cy="9" r="3" fill="#176b2c" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                Transit Compass HK
              </p>
              <h1 className="text-lg font-bold">香港出行</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:inline-flex" href="/updates">路線更新</a>
            <a className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:inline-flex" href="/traffic">交通事件</a>
            <a className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100" href="/en">
              English 版
            </a>
            <button className="rounded-xl bg-[#176b2c] px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#0f5422]">
              定位
            </button>
          </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6 lg:px-8">
        <div className="grid gap-3 lg:grid-cols-[minmax(380px,0.86fr)_minmax(0,1.14fr)] lg:items-start">
          <div className="space-y-3">
            <JourneyPlaceSearch />
            <section id="live-search" className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="mb-3 flex flex-wrap gap-2">
                {['全部', '巴士', '港鐵', '最快', '最平'].map((chip, index) => (
                  <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${index === 0 ? 'bg-[#176b2c] text-white' : 'bg-slate-100 text-slate-600'}`} key={chip}>{chip}</span>
                ))}
              </div>
              <LiveTransitSearch />
            </section>
          </div>
          <div className="overflow-hidden rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200 lg:sticky lg:top-[76px]">
            <div className="mb-2 flex items-center justify-between px-2 pt-1">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">地圖</p>
                <h2 className="text-base font-bold text-slate-800">附近交通網絡</h2>
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">香港</span>
            </div>
            <GoogleMapPanel />
          </div>
        </div>

        <div className="my-3 grid grid-cols-2 gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200 sm:grid-cols-4">
          {[
            ['🚌', '巴士', '按資料比較'],
            ['🚶', '步行', '附近車站'],
            ['🚇', '港鐵', '比較車費'],
            ['⛴', '渡輪', '即將推出'],
          ].map(([icon, label, caption]) => (
            <button key={label} className="rounded-xl px-3 py-3 text-left transition hover:bg-green-50">
              <div className="text-xl">{icon}</div>
              <div className="mt-1 text-sm font-bold text-slate-800">{label}</div>
              <div className="text-[11px] text-slate-500">{caption}</div>
            </button>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(360px,1.12fr)]">
          <section id="routes" className="space-y-4">
            <MonthlySavingsCounter
              savingPerTrip={bestPassInsight.savingThisTrip}
            />

            <div className="rounded-[28px] bg-gradient-to-br from-[#176b2c] to-[#2e8b57] p-5 text-white shadow-soft">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-100">
                  交通票價分析
                  </p>
                  <h2 className="mt-2 max-w-xl text-2xl font-bold">
                    比較不同交通選項的實際成本
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-green-50">
                    This route uses {bestPassInsight.coveredLegCount} pass-covered leg
                    {bestPassInsight.coveredLegCount === 1 ? '' : 's'} and saves an
                    estimated HK$ {bestPassInsight.savingThisTrip.toFixed(2)} versus
                    paying those fares separately.
                  </p>
                </div>
                <div className="rounded-2xl bg-white/15 p-4 sm:min-w-44">
                  <div className="text-xs uppercase tracking-[0.15em] text-green-100">
                    月票價格
                  </div>
                  <div className="mt-1 text-3xl font-bold">
                    HK$ {bestPassInsight.passPrice}
                  </div>
                  <div className="mt-1 text-xs text-green-100">
                    回本：{bestPassInsight.breakEvenTrips} 程
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-[24px] bg-white px-5 py-4 shadow-soft ring-1 ring-slate-200">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">推薦路線</p>
                <h2 className="text-2xl font-semibold text-slate-900">{bestRoute.legs.length > 1 ? '最佳路線' : '直達路線'}</h2>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-slate-900">{bestRoute.legs.reduce((total, leg) => total + (leg.journeyTimeMinutes ?? 0), 0) + bestRoute.walkTransferTimeMinutes} min</div>
                <div className="text-sm text-slate-500">{bestRoute.transferCount} 次轉乘</div>
              </div>
            </div>

            {scoredRoutes.map((route, index) => {
              const isBest = index === 0;
              const routeAlerts = getAlertsForRoutes(
                route.legs.flatMap((leg) => (leg.routeNumber ? [leg.routeNumber] : [])),
              );
              const totalMinutes = route.legs.reduce((total, leg) => total + (leg.journeyTimeMinutes ?? 0), 0) + route.walkTransferTimeMinutes;
              return (
                <article
                  key={route.id}
                  className={`rounded-[28px] border p-4 shadow-soft transition ${
                    isBest
                      ? 'border-sky-200 bg-sky-50/80'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {isBest && (
                        <span className="rounded-full bg-sky-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                          推薦
                        </span>
                      )}
                      <div>
                        <div className="text-3xl font-bold text-slate-900">{totalMinutes} min</div>
                        <div className="text-sm text-slate-500">{route.legs.length} leg{route.legs.length > 1 ? 's' : ''}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-600">評分</div>
                      <div className="text-2xl font-bold text-slate-900">{route.finalScore.toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {route.legs.map((leg) => (
                      <div key={leg.id} className="flex items-start gap-3 rounded-2xl bg-white/60 p-3 ring-1 ring-slate-200">
                        <span
                          className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold ${operatorClasses[leg.operator] ?? 'bg-slate-100 text-slate-700'}`}
                        >
                          {leg.operator}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-semibold text-slate-900">{leg.routeNumber}</div>
                            <div className="text-sm text-slate-500">{leg.mode === 'SUBWAY' ? '港鐵' : leg.mode === 'BUS' ? '巴士' : leg.mode === 'WALK' ? '步行' : '渡輪'}</div>
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {leg.originStop?.name ?? '起點'} → {leg.destinationStop?.name ?? '目的地'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-slate-900">{leg.journeyTimeMinutes ?? 0} min</div>
                          <div className="text-xs text-slate-500">
                            {leg.realtimeEta ? `${leg.realtimeEta.etaMinutes} min live` : `${leg.scheduledIntervalMinutes} min scheduled`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                        HK$ {route.discountedFare.toFixed(2)}
                      </span>
                      <span className="text-slate-500">轉乘優惠減 HK$ {route.bbiDiscountApplied.toFixed(2)}</span>
                    </div>
                    <div className="font-medium text-slate-800">步行 {route.walkTransferTimeMinutes} 分鐘</div>
                  </div>
                  {routeAlerts.length > 0 && (
                    <div className="mt-3 rounded-2xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">⚠ {routeAlerts.length} 項服務／交通影響</span>
                        <a className="font-semibold underline" href="/traffic">查看詳情</a>
                      </div>
                      <p className="mt-1">{routeAlerts[0].title}：{routeAlerts[0].summary}</p>
                    </div>
                  )}
                  {(() => {
                    const passInsight = getMonthlyPassInsight(route);
                    return (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-orange-50 px-3 py-2 text-xs text-orange-800">
                        <span className="font-semibold">
                          {passInsight.isFullyCovered
                            ? '參考通票全程涵蓋'
                            : `${passInsight.coveredLegCount} 段通票涵蓋路程`}
                        </span>
                        <span>
                          本程節省 HK$ {passInsight.savingThisTrip.toFixed(2)}
                        </span>
                      </div>
                    );
                  })()}
                </article>
              );
            })}
          </section>

          <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
            <div className="grid grid-cols-2 gap-2">
              <a className="rounded-2xl bg-white p-3 text-center text-sm font-semibold text-[#176b2c] shadow-sm ring-1 ring-[#176b2c]/15 hover:bg-green-50" href="/updates">路線更新<br /><span className="text-xs font-normal text-slate-500">公告及改道</span></a>
              <a className="rounded-2xl bg-white p-3 text-center text-sm font-semibold text-[#176b2c] shadow-sm ring-1 ring-[#176b2c]/15 hover:bg-green-50" href="/traffic">交通事件<br /><span className="text-xs font-normal text-slate-500">事故及擠塞</span></a>
            </div>
            <CalendarAndPlaces />
            <div id="map" className="overflow-hidden rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <TrafficHeatmap />
            </div>

            <div className="rounded-[28px] bg-[#176b2c] p-5 text-white shadow-soft">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300">行程摘要</p>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">總時間</span>
                  <strong>{formatDuration(bestRoute.legs.reduce((total, leg) => total + (leg.journeyTimeMinutes ?? 0), 0) + bestRoute.walkTransferTimeMinutes)}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">最低車費</span>
                  <strong>HK$ {bestRoute.discountedFare.toFixed(2)}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">月票節省</span>
                  <strong className="text-orange-300">
                    HK$ {bestPassInsight.savingThisTrip.toFixed(2)}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">班次間隔</span>
                  <strong>{bestRoute.legs[0].scheduledIntervalMinutes ?? 0} min</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">營辦商組合</span>
                  <strong>{bestRoute.legs.map((leg) => leg.operator).join(' + ')}</strong>
                </div>
              </div>
            </div>
            <div className="rounded-[28px] bg-white p-5 shadow-soft ring-1 ring-[#176b2c]/15">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#176b2c]">快速入口</p>
                  <h3 className="mt-1 text-xl font-bold">我的地點</h3>
                </div>
                <button className="text-sm font-semibold text-[#2e8b57]">編輯</button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <p className="col-span-2 rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">
                  尚未有快速入口；搜尋並選擇地點後才會顯示。
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <footer className="mx-auto mt-6 max-w-7xl border-t border-slate-200 px-4 py-6 text-xs text-slate-500 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-semibold text-slate-700">資料來源與鳴謝</p>
            <p className="mt-1 max-w-2xl leading-5">
              路線、ETA、交通及鐵路資料只會在接通並驗證官方 endpoint 後顯示為即時資料。
              本網站不是政府或交通營辦商的官方網站。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:max-w-xl">
            {trafficSources.map((source) => (
              <a
                key={source.id}
                className="underline decoration-slate-300 underline-offset-2 hover:text-[#176b2c]"
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
      <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-xl backdrop-blur sm:hidden">
        {[
          ['⌕', '搜尋', '#live-search'],
          ['⌖', '地圖', '#map'],
          ['⚠', '交通', '/traffic'],
          ['☰', '更多', '/updates'],
        ].map(([icon, label, href]) => (
          <a className="flex flex-col items-center rounded-xl px-2 py-2 text-[10px] font-semibold text-slate-600 hover:bg-green-50 hover:text-[#176b2c]" href={href} key={label}>
            <span className="text-base leading-4">{icon}</span>
            <span className="mt-1">{label}</span>
          </a>
        ))}
      </nav>
    </main>
  );
}
