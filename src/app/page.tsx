import { scoreRoutes, type RouteOption, type TransitLeg } from '../engine/UpgradedScoringEngine';
import { getMonthlyPassInsight } from '../domain/monthlyPass';
import MonthlySavingsCounter from './components/MonthlySavingsCounter';
import { CalendarAndPlaces } from './components/CalendarAndPlaces';
import { RouteMinimap } from './components/RouteMinimap';
import { GoogleMapPanel } from './components/GoogleMapPanel';
import { getTrafficSourceCatalog } from '../data/hkTrafficSources';
import { getAlertsForRoutes } from '../data/trafficAlerts';
import { LiveTransitSearch } from './components/LiveTransitSearch';
import { JourneyPlaceSearch } from './components/JourneyPlaceSearch';

const DEMO_AS_OF = new Date('2026-09-13T18:25:00+08:00');

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
  realtimeEta:
    eta === null
      ? null
      : {
          etaMinutes: eta,
          dataTime: DEMO_AS_OF.toISOString(),
          isLive: true,
          source: 'DATAGOVHK',
        },
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

const scoredRoutes = scoreRoutes(routes, DEMO_AS_OF).sort(
  (a, b) => a.finalScore - b.finalScore,
);

const bestRoute = scoredRoutes[0];
const bestPassInsight = getMonthlyPassInsight(bestRoute);
const trafficSources = getTrafficSourceCatalog();

const operatorPillClasses: Record<string, string> = {
  KMB: 'bg-cm-kmb text-white',
  LWB: 'bg-cm-lwb text-white',
  MTR: 'bg-cm-mtr text-white',
  CTB: 'bg-cm-ctb text-cm-ink',
};

const operatorDotColors: Record<string, string> = {
  KMB: '#e4002b',
  LWB: '#ff6a00',
  MTR: '#a6192e',
  CTB: '#f7b500',
};

const modeLabel: Record<string, string> = {
  SUBWAY: '港鐵',
  BUS: '巴士',
  WALK: '步行',
  FERRY: '渡輪',
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
            <button className="rounded-full bg-cm-ink px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-black">
              定位
            </button>
          </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6 lg:px-8">
        <div className="grid gap-3 lg:grid-cols-[minmax(380px,0.86fr)_minmax(0,1.14fr)] lg:items-start">
          <div className="space-y-3">
            <JourneyPlaceSearch />
            <section id="live-search" className="cm-card p-3">
              <div className="mb-3 flex flex-wrap gap-2">
                {['全部', '巴士', '港鐵', '最快', '最平'].map((chip, index) => (
                  <span className={`cm-chip ${index === 0 ? 'bg-cm-green text-white' : 'bg-cm-paper text-cm-muted'}`} key={chip}>{chip}</span>
                ))}
              </div>
              <LiveTransitSearch />
            </section>
          </div>
          <div className="overflow-hidden rounded-3xl bg-white p-2 shadow-card ring-1 ring-cm-line lg:sticky lg:top-[68px]">
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

        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(360px,1.12fr)]">
          <section id="routes" className="space-y-4">
            <MonthlySavingsCounter
              savingPerTrip={bestPassInsight.savingThisTrip}
            />

            <div className="rounded-3xl bg-gradient-to-br from-cm-green to-cm-greenDeep p-5 text-white shadow-card">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-white/70">
                  交通票價分析
                  </p>
                  <h2 className="mt-2 max-w-xl text-2xl font-extrabold">
                    比較不同交通選項的實際成本
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-white/85">
                    This route uses {bestPassInsight.coveredLegCount} pass-covered leg
                    {bestPassInsight.coveredLegCount === 1 ? '' : 's'} and saves an
                    estimated HK$ {bestPassInsight.savingThisTrip.toFixed(2)} versus
                    paying those fares separately.
                  </p>
                </div>
                <div className="rounded-2xl bg-white/15 p-4 sm:min-w-44">
                  <div className="text-xs font-bold uppercase tracking-[0.15em] text-white/70">
                    月票價格
                  </div>
                  <div className="mt-1 text-3xl font-extrabold">
                    HK$ {bestPassInsight.passPrice}
                  </div>
                  <div className="mt-1 text-xs font-bold text-white/70">
                    回本：{bestPassInsight.breakEvenTrips === null ? '—' : `${bestPassInsight.breakEvenTrips} 程`}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-3xl bg-cm-ink px-5 py-4 text-white shadow-card">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">推薦路線</p>
                <h2 className="text-xl font-extrabold">{bestRoute.legs.length > 1 ? '最佳路線' : '直達路線'}</h2>
              </div>
              <div className="text-right">
                <div className="text-3xl font-extrabold tracking-tight">{bestRoute.legs.reduce((total, leg) => total + (leg.journeyTimeMinutes ?? 0), 0) + bestRoute.walkTransferTimeMinutes} <span className="text-sm font-bold text-white/60">min</span></div>
                <div className="text-xs font-bold text-white/60">{bestRoute.transferCount} 次轉乘</div>
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
                  className={`overflow-hidden rounded-3xl bg-white shadow-card ring-1 transition ${
                    isBest ? 'ring-2 ring-cm-green' : 'ring-cm-line'
                  }`}
                >
                  <div className="flex items-stretch">
                    <div className={`flex w-[104px] shrink-0 flex-col justify-between px-4 py-4 ${isBest ? 'bg-cm-green text-white' : 'bg-cm-paper text-cm-ink'}`}>
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-extrabold leading-none tracking-tight">{totalMinutes}</span>
                          <span className={`text-xs font-bold ${isBest ? 'text-white/80' : 'text-cm-muted'}`}>min</span>
                        </div>
                        <div className={`mt-1 text-[11px] font-bold ${isBest ? 'text-white/80' : 'text-cm-muted'}`}>
                          {route.transferCount === 0 ? '直達' : `${route.transferCount} 次轉乘`}
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="text-lg font-extrabold leading-none">HK$ {route.discountedFare.toFixed(1)}</div>
                        {route.bbiDiscountApplied > 0 && (
                          <div className={`mt-0.5 text-[10px] font-bold ${isBest ? 'text-white/80' : 'text-cm-greenDark'}`}>
                            轉乘減 {route.bbiDiscountApplied.toFixed(1)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 px-4 py-3">
                      {isBest && (
                        <div className="mb-2 inline-flex rounded-full bg-cm-green/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-cm-greenDark">
                          最佳推薦
                        </div>
                      )}
                      <div className="relative">
                        {route.legs.map((leg, legIndex) => {
                          const dotColor = operatorDotColors[leg.operator] ?? '#6b7280';
                          const isLast = legIndex === route.legs.length - 1;
                          return (
                            <div key={leg.id} className="relative flex gap-3 pb-3 last:pb-0">
                              <div className="relative flex w-5 shrink-0 flex-col items-center">
                                <span
                                  className="z-10 mt-0.5 flex h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white ring-1 ring-black/10"
                                  style={{ backgroundColor: dotColor }}
                                />
                                {!isLast && (
                                  <span className="absolute top-4 bottom-0 w-[3px] rounded-full" style={{ backgroundColor: dotColor }} />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className={`cm-pill ${operatorPillClasses[leg.operator] ?? 'bg-slate-500 text-white'}`}>
                                    {leg.routeNumber}
                                  </span>
                                  <span className="truncate text-xs font-bold text-cm-muted">
                                    {leg.operator} · {modeLabel[leg.mode ?? ''] ?? leg.mode ?? '交通'}
                                  </span>
                                </div>
                                <div className="mt-0.5 truncate text-[13px] font-semibold text-cm-ink">
                                  {leg.originStop?.name ?? '起點'} → {leg.destinationStop?.name ?? '目的地'}
                                </div>
                                <div className="mt-0.5 flex items-center gap-2 text-[11px] font-bold text-cm-muted">
                                  <span>{leg.journeyTimeMinutes ?? 0} 分鐘</span>
                                  <span className={leg.realtimeEta ? 'text-cm-greenDark' : ''}>
                                    {leg.realtimeEta ? `· ${leg.realtimeEta.etaMinutes} 分到站` : `· 每 ${leg.scheduledIntervalMinutes} 分一班`}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex items-center gap-3 pt-1">
                          <div className="flex w-5 shrink-0 justify-center">
                            <span className="text-[13px] leading-none">📍</span>
                          </div>
                          <div className="text-[12px] font-bold text-cm-ink">
                            {route.legs[route.legs.length - 1]?.destinationStop?.name ?? '目的地'}
                            {route.walkTransferTimeMinutes > 0 && (
                              <span className="ml-2 font-semibold text-cm-muted">步行 {route.walkTransferTimeMinutes} 分</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-cm-line pt-2.5">
                        <div className="flex items-center gap-2 text-[11px] font-bold text-cm-muted">
                          <span>評分 {route.finalScore.toFixed(1)}</span>
                          {route.legs.some((leg) => leg.realtimeEta) && (
                            <span className="rounded-full bg-cm-green/10 px-1.5 py-0.5 text-cm-greenDark">LIVE</span>
                          )}
                        </div>
                        <button
                          className={`rounded-full px-4 py-1.5 text-xs font-extrabold shadow-sm transition ${
                            isBest
                              ? 'bg-cm-green text-white hover:bg-cm-greenDark'
                              : 'bg-cm-ink/5 text-cm-ink hover:bg-cm-ink/10'
                          }`}
                          type="button"
                        >
                          GO
                        </button>
                      </div>
                    </div>
                  </div>

                  {routeAlerts.length > 0 && (
                    <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">⚠ {routeAlerts.length} 項服務／交通影響</span>
                        <a className="font-semibold underline" href="/traffic">查看詳情</a>
                      </div>
                      <p className="mt-0.5">{routeAlerts[0].title}：{routeAlerts[0].summary}</p>
                    </div>
                  )}
                  {(() => {
                    const passInsight = getMonthlyPassInsight(route);
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cm-line bg-cm-paper/60 px-4 py-2 text-xs text-cm-muted">
                        <span className="font-bold">
                          {passInsight.isFullyCovered
                            ? '✓ 月票全程涵蓋'
                            : `${passInsight.coveredLegCount} 段月票涵蓋`}
                        </span>
                        <span>
                          本程節省 <strong className="text-cm-greenDark">HK$ {passInsight.savingThisTrip.toFixed(2)}</strong>
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
              <a className="rounded-3xl bg-white p-3 text-center text-sm font-extrabold text-cm-ink shadow-card ring-1 ring-cm-line hover:bg-cm-paper" href="/updates">路線更新<br /><span className="text-xs font-semibold text-cm-muted">公告及改道</span></a>
              <a className="rounded-3xl bg-white p-3 text-center text-sm font-extrabold text-cm-ink shadow-card ring-1 ring-cm-line hover:bg-cm-paper" href="/traffic">交通事件<br /><span className="text-xs font-semibold text-cm-muted">事故及擠塞</span></a>
            </div>
            <CalendarAndPlaces />
            <div id="map" className="cm-card p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-xs font-extrabold text-cm-ink">推薦路線圖</p>
                <span className="rounded-full bg-cm-green/10 px-2 py-0.5 text-[10px] font-extrabold text-cm-greenDark">
                  {bestRoute.legs.length} 段
                </span>
              </div>
              <RouteMinimap route={bestRoute} />
            </div>

            <div className="rounded-3xl bg-cm-ink p-5 text-white shadow-card">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">行程摘要</p>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/60">總時間</span>
                  <strong>{formatDuration(bestRoute.legs.reduce((total, leg) => total + (leg.journeyTimeMinutes ?? 0), 0) + bestRoute.walkTransferTimeMinutes)}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">最低車費</span>
                  <strong>HK$ {bestRoute.discountedFare.toFixed(2)}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">月票節省</span>
                  <strong className="text-cm-green">
                    HK$ {bestPassInsight.savingThisTrip.toFixed(2)}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">班次間隔</span>
                  <strong>{bestRoute.legs[0].scheduledIntervalMinutes ?? 0} min</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">營辦商組合</span>
                  <strong>{bestRoute.legs.map((leg) => leg.operator).join(' + ')}</strong>
                </div>
              </div>
            </div>
            <div className="cm-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-cm-greenDark">快速入口</p>
                  <h3 className="mt-1 text-xl font-extrabold">我的地點</h3>
                </div>
                <button className="text-sm font-bold text-cm-greenDark">編輯</button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <p className="col-span-2 rounded-2xl bg-cm-paper p-3 text-sm text-cm-muted">
                  尚未有快速入口；搜尋並選擇地點後才會顯示。
                </p>
              </div>
            </div>
          </aside>
        </div>
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
