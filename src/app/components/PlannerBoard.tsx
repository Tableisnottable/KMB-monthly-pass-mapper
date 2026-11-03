'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ScoredRoute, Segment, TransitLeg } from '../../engine/UpgradedScoringEngine';
import { getMonthlyPassInsight } from '../../domain/monthlyPass';
import { getAlertsForRoutes } from '../../data/trafficAlerts';
import { CalendarAndPlaces } from './CalendarAndPlaces';
import MonthlySavingsCounter from './MonthlySavingsCounter';
import { RouteMinimap } from './RouteMinimap';

type SortKey = 'all' | 'bus' | 'rail' | 'fastest' | 'cheapest';

const SORT_CHIPS: { key: SortKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'bus', label: '巴士' },
  { key: 'rail', label: '港鐵' },
  { key: 'fastest', label: '最快' },
  { key: 'cheapest', label: '最平' },
];

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

function legColor(operator: string): string {
  return operatorDotColors[operator] ?? '#6b7280';
}

function modeName(leg: Segment): string {
  return modeLabel[leg.mode ?? ''] ?? leg.mode ?? '交通';
}

/**
 * Compute the next few departure times for a leg, based on a live ETA
 * (when present) or the scheduled headway. Returns "HH:MM" strings.
 */
function nextDepartures(
  leg: Segment,
  now: Date,
  count = 5,
): { time: string; isLive: boolean }[] {
  const headway = leg.scheduledIntervalMinutes ?? 12;
  const baseMinutes = leg.realtimeEta?.isLive
    ? leg.realtimeEta.etaMinutes
    : undefined;
  const results: { time: string; isLive: boolean }[] = [];
  if (baseMinutes !== undefined) {
    for (let i = 0; i < count; i += 1) {
      const d = new Date(now.getTime() + (baseMinutes + i * headway) * 60000);
      results.push({
        time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        isLive: i === 0,
      });
    }
    return results;
  }
  // No live ETA: estimate departures from the next whole headway slot
  const nextSlot = Math.ceil(now.getMinutes() / headway) * headway;
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now);
    d.setMinutes(nextSlot + i * headway, 0, 0);
    results.push({ time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, isLive: false });
  }
  return results;
}

function totalMinutes(route: ScoredRoute): number {
  return (
    route.legs.reduce((total, leg) => total + (leg.journeyTimeMinutes ?? 0), 0) +
    route.walkTransferTimeMinutes
  );
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours === 0 ? `${mins} min` : `${hours}h ${mins}m`;
}

interface DirectionStep {
  key: string;
  kind: 'walk' | 'ride' | 'arrive';
  icon: string;
  title: string;
  detail: string;
  color: string;
}

function buildDirections(route: ScoredRoute, transferWalkMinutes: number): DirectionStep[] {
  const steps: DirectionStep[] = [];
  const first = route.legs[0];
  const last = route.legs[route.legs.length - 1];

  if (first) {
    steps.push({
      key: `${route.id}-start`,
      kind: 'walk',
      icon: '🚶',
      title: `步行至 ${first.originStop?.name ?? '起點'}`,
      detail: `約 ${Math.max(transferWalkMinutes, 1)} 分鐘`,
      color: '#9aa3ad',
    });
  }

  route.legs.forEach((leg, index) => {
    steps.push({
      key: `${route.id}-leg-${index}`,
      kind: 'ride',
      icon: leg.mode === 'SUBWAY' ? '🚇' : leg.mode === 'FERRY' ? '⛴' : '🚌',
      title: `乘搭 ${leg.routeNumber}（${modeName(leg)}）`,
      detail: `${leg.originStop?.name ?? '上車站'} → ${leg.destinationStop?.name ?? '下車站'} · ${leg.journeyTimeMinutes ?? 0} 分鐘${
        leg.realtimeEta ? ` · ${leg.realtimeEta.etaMinutes} 分到站` : ` · 每 ${leg.scheduledIntervalMinutes} 分一班`
      } · ${leg.realtimeEta ? '實時班次' : '班表班次'} ${nextDepartures(leg, new Date())
        .map((d) => d.time)
        .join(' / ')}`,
      color: legColor(leg.operator),
    });
    if (index < route.legs.length - 1) {
      steps.push({
        key: `${route.id}-transfer-${index}`,
        kind: 'walk',
        icon: '🔁',
        title: `於 ${leg.destinationStop?.name ?? '轉車站'} 轉乘`,
        detail: '跟隨站內指示轉乘下一程',
        color: '#9aa3ad',
      });
    }
  });

  if (last) {
    steps.push({
      key: `${route.id}-arrive`,
      kind: 'arrive',
      icon: '📍',
      title: `抵達 ${last.destinationStop?.name ?? '目的地'}`,
      detail: `全程車費 HK$ ${route.discountedFare.toFixed(2)}`,
      color: '#1a1a1a',
    });
  }

  return steps;
}

export function PlannerBoard({ routes, emptyHint }: { routes: ScoredRoute[]; emptyHint?: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('all');
  const [selectedId, setSelectedId] = useState<string>(routes[0]?.id ?? '');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);

  const hasBus = useMemo(() => routes.some((route) => route.legs.some((leg) => leg.mode === 'BUS')), [routes]);
  const hasRail = useMemo(
    () => routes.some((route) => route.legs.some((leg) => leg.mode === 'SUBWAY')),
    [routes],
  );

  // Only offer mode chips for modes that actually appear in the results;
  // a "港鐵" filter that always yields nothing just looks broken.
  const availableChips = useMemo(
    () =>
      SORT_CHIPS.filter((chip) => {
        if (chip.key === 'bus') return hasBus;
        if (chip.key === 'rail') return hasRail;
        return true;
      }),
    [hasBus, hasRail],
  );

  useEffect(() => {
    if (!availableChips.some((chip) => chip.key === sortKey)) {
      setSortKey('all');
    }
  }, [availableChips, sortKey]);

  const visibleRoutes = useMemo(() => {
    let list = [...routes];
    if (sortKey === 'bus') {
      list = list.filter((route) => route.legs.some((leg) => leg.mode === 'BUS'));
    } else if (sortKey === 'rail') {
      list = list.filter((route) => route.legs.some((leg) => leg.mode === 'SUBWAY'));
    } else if (sortKey === 'fastest') {
      list = [...list].sort((a, b) => totalMinutes(a) - totalMinutes(b));
    } else if (sortKey === 'cheapest') {
      list = [...list].sort((a, b) => a.discountedFare - b.discountedFare);
    }
    return list;
  }, [routes, sortKey]);

  const rankedIds = useMemo(() => routes.map((route) => route.id), [routes]);

  useEffect(() => {
    setSelectedId(routes[0]?.id ?? '');
    setExpandedId(null);
    setNavigating(false);
  }, [routes]);

  const selected =
    routes.find((route) => route.id === selectedId) ?? visibleRoutes[0] ?? routes[0];
  const passInsight = selected ? getMonthlyPassInsight(selected) : null;
  const directions = selected
    ? buildDirections(selected, selected.walkTransferTimeMinutes)
    : [];
  const navigationRoute = navigating ? selected : null;

  return (
    <div className="grid gap-5 pb-24 sm:pb-20 xl:grid-cols-[minmax(0,0.88fr)_minmax(360px,1.12fr)]">
      <section id="routes" className="space-y-4">
        {routes.length === 0 ? (
          <div className="rounded-3xl bg-white p-6 text-center shadow-card ring-1 ring-cm-line">
            <p className="text-lg font-extrabold text-cm-ink">{
              emptyHint ?? '找不到直達路線'
            }</p>
            {!emptyHint && (
              <p className="mt-2 text-sm text-cm-muted">
                這兩個地點之間沒有一程直達的九巴路線。試試選擇較近主要道路的地點，或使用上方的官方交通搜尋查看轉乘組合。
              </p>
            )}
          </div>
        ) : (
          <>
            <MonthlySavingsCounter savingPerTrip={passInsight?.savingThisTrip ?? 0} routes={routes} />

        {selected && passInsight && (
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
                  所選路線有 {passInsight.coveredLegCount} 段由月票涵蓋，較逐程付費節省約 HK${' '}
                  {passInsight.savingThisTrip.toFixed(2)}。
                </p>
              </div>
              <div className="rounded-2xl bg-white/15 p-4 sm:min-w-44">
                <div className="text-xs font-bold uppercase tracking-[0.15em] text-white/70">
                  月票價格
                </div>
                <div className="mt-1 text-3xl font-extrabold">HK$ {passInsight.passPrice}</div>
                <div className="mt-1 text-xs font-bold text-white/70">
                  回本：{passInsight.breakEvenTrips === null ? '—' : `${passInsight.breakEvenTrips} 程`}
                </div>
              </div>
            </div>
          </div>
        )}

        {selected && (
          <div className="flex items-center justify-between rounded-3xl bg-cm-ink px-5 py-4 text-white shadow-card">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                {selected.id === routes[0]?.id ? '推薦路線' : '所選路線'}
              </p>
              <h2 className="text-xl font-extrabold">
                {selected.legs.length > 1 ? '最佳路線' : '直達路線'}
              </h2>
            </div>
            <div className="text-right">
              <div className="text-3xl font-extrabold tracking-tight">
                {totalMinutes(selected)}{' '}
                <span className="text-sm font-bold text-white/60">min</span>
              </div>
              <div className="text-xs font-bold text-white/60">
                {selected.transferCount} 次轉乘
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {availableChips.map((chip) => (
            <button
              className={`cm-chip transition ${
                sortKey === chip.key
                  ? 'bg-cm-ink text-white'
                  : 'bg-white text-cm-muted ring-1 ring-cm-line hover:bg-cm-paper'
              }`}
              key={chip.key}
              onClick={() => setSortKey(chip.key)}
              type="button"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {visibleRoutes.length === 0 && (
          <p className="rounded-3xl bg-white p-5 text-sm text-cm-muted shadow-card ring-1 ring-cm-line">
            沒有符合條件的路線，請選擇其他篩選。
          </p>
        )}

        {visibleRoutes.map((route) => {
          const isSelected = selected?.id === route.id;
          const isBest = route.id === rankedIds[0];
          const isExpanded = expandedId === route.id;
          const routeAlerts = getAlertsForRoutes(
            route.legs.flatMap((leg) => (leg.routeNumber ? [leg.routeNumber] : [])),
          );
          const routePassInsight = getMonthlyPassInsight(route);
          const stepDirections = isExpanded ? buildDirections(route, route.walkTransferTimeMinutes) : [];

          return (
            <article
              className={`cursor-pointer overflow-hidden rounded-3xl bg-white shadow-card ring-1 transition ${
                isSelected
                  ? 'ring-2 ring-cm-ink'
                  : isBest
                    ? 'ring-2 ring-cm-green'
                    : 'ring-cm-line'
              }`}
              key={route.id}
              onClick={() => setSelectedId(route.id)}
            >
              <div className="flex items-stretch">
                <div
                  className={`flex w-[104px] shrink-0 flex-col justify-between px-4 py-4 ${
                    isBest ? 'bg-cm-green text-white' : 'bg-cm-paper text-cm-ink'
                  }`}
                >
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold leading-none tracking-tight">
                        {totalMinutes(route)}
                      </span>
                      <span className={`text-xs font-bold ${isBest ? 'text-white/80' : 'text-cm-muted'}`}>
                        min
                      </span>
                    </div>
                    <div className={`mt-1 text-[11px] font-bold ${isBest ? 'text-white/80' : 'text-cm-muted'}`}>
                      {route.transferCount === 0 ? '直達' : `${route.transferCount} 次轉乘`}
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-lg font-extrabold leading-none">
                      HK$ {route.discountedFare.toFixed(1)}
                    </div>
                    {route.bbiDiscountApplied > 0 && (
                      <div className={`mt-0.5 text-[10px] font-bold ${isBest ? 'text-white/80' : 'text-cm-greenDark'}`}>
                        轉乘減 {route.bbiDiscountApplied.toFixed(1)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-w-0 flex-1 px-4 py-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    {isBest && (
                      <span className="inline-flex rounded-full bg-cm-green/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-cm-greenDark">
                        最佳推薦
                      </span>
                    )}
                    {isSelected && (
                      <span className="inline-flex rounded-full bg-cm-ink px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                        已在地圖顯示
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    {route.legs.map((leg, legIndex) => {
                      const dotColor = legColor(leg.operator);
                      const isLast = legIndex === route.legs.length - 1;
                      return (
                        <div key={leg.id} className="relative flex gap-3 pb-3 last:pb-0">
                          <div className="relative flex w-5 shrink-0 flex-col items-center">
                            <span
                              className="z-10 mt-0.5 flex h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white ring-1 ring-black/10"
                              style={{ backgroundColor: dotColor }}
                            />
                            {!isLast && (
                              <span
                                className="absolute top-4 bottom-0 w-[3px] rounded-full"
                                style={{ backgroundColor: dotColor }}
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`cm-pill ${operatorPillClasses[leg.operator] ?? 'bg-slate-500 text-white'}`}>
                                {leg.routeNumber}
                              </span>
                              <span className="truncate text-xs font-bold text-cm-muted">
                                {leg.operator} · {modeName(leg)}
                              </span>
                            </div>
                            <div className="mt-0.5 truncate text-[13px] font-semibold text-cm-ink">
                              {leg.originStop?.name ?? '起點'} → {leg.destinationStop?.name ?? '目的地'}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] font-bold text-cm-muted">
                              <span>{leg.journeyTimeMinutes ?? 0} 分鐘</span>
                              {leg.serviceEnded ? (
                                <span className="text-rose-700">· 今日服務已結束</span>
                              ) : leg.realtimeEta ? (
                                <span className="text-cm-greenDark">· {leg.realtimeEta.etaMinutes} 分到站</span>
                              ) : (
                                <span>· 每 {leg.scheduledIntervalMinutes} 分一班</span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {!leg.serviceEnded &&
                                nextDepartures(leg, new Date()).map((dep, i) => (
                                  <span
                                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums ${
                                      dep.isLive
                                        ? 'bg-cm-green text-white'
                                        : 'border border-dashed border-amber-500 bg-amber-50 text-amber-800'
                                    }`}
                                    key={`${leg.id}-dep-${i}`}
                                  >
                                    {dep.time}
                                  </span>
                                ))}
                              <span
                                className={`rounded px-1 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${
                                  leg.serviceEnded
                                    ? 'bg-rose-100 text-rose-700'
                                    : leg.realtimeEta
                                      ? 'bg-cm-green/10 text-cm-greenDark'
                                      : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {leg.serviceEnded ? '已收班' : leg.realtimeEta ? '實時' : '班表'}
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
                          <span className="ml-2 font-semibold text-cm-muted">
                            步行 {route.walkTransferTimeMinutes} 分
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-cm-line pt-2.5">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-cm-muted">
                      <span>評分 {route.finalScore.toFixed(1)}</span>
                      {route.legs.some((leg) => leg.serviceEnded) && (
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-rose-700">
                          部分已收班
                        </span>
                      )}
                      {route.legs.some((leg) => leg.realtimeEta) && (
                        <span className="rounded-full bg-cm-green/10 px-1.5 py-0.5 text-cm-greenDark">
                          LIVE
                        </span>
                      )}
                    </div>
                    <button
                      className={`rounded-full px-4 py-1.5 text-xs font-extrabold shadow-sm transition ${
                        isExpanded
                          ? 'bg-cm-ink text-white hover:bg-black'
                          : 'bg-cm-green text-white hover:bg-cm-greenDark'
                      }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(route.id);
                        setExpandedId(isExpanded ? null : route.id);
                      }}
                      type="button"
                    >
                      {isExpanded ? '收起' : 'GO'}
                    </button>
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-cm-line bg-cm-paper/60 px-4 py-3" onClick={(event) => event.stopPropagation()}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-cm-muted">
                      逐段指示
                    </p>
                    <span className="rounded-full bg-cm-ink px-2.5 py-0.5 text-[10px] font-extrabold text-white">
                      前往 {selected?.legs[selected.legs.length - 1]?.destinationStop?.name ?? '目的地'}
                    </span>
                  </div>
                  <ol className="space-y-2">
                    {stepDirections.map((step, index) => (
                      <li className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-cm-line" key={step.key}>
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm text-white"
                          style={{ backgroundColor: step.color }}
                        >
                          {step.kind === 'ride' ? index : step.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-extrabold text-cm-ink">{step.title}</div>
                          <div className="mt-0.5 text-[11px] font-semibold text-cm-muted">{step.detail}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-3 flex items-center justify-between rounded-2xl bg-cm-ink px-4 py-3 text-white">
                    <div className="text-xs font-bold text-white/60">
                      全程 {formatDuration(totalMinutes(route))} · {route.transferCount} 次轉乘
                    </div>
                    <button
                      className="rounded-full bg-cm-green px-5 py-2 text-sm font-extrabold text-white hover:bg-cm-greenDark"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(route.id);
                        setExpandedId(null);
                        setNavigating(true);
                      }}
                      type="button"
                    >
                      開始導航
                    </button>
                  </div>
                </div>
              )}

              {routeAlerts.length > 0 && (
                <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">⚠ {routeAlerts.length} 項服務／交通影響</span>
                    <a className="font-semibold underline" href="/traffic" onClick={(event) => event.stopPropagation()}>
                      查看詳情
                    </a>
                  </div>
                  <p className="mt-0.5">
                    {routeAlerts[0].title}：{routeAlerts[0].summary}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cm-line bg-cm-paper/60 px-4 py-2 text-xs text-cm-muted">
                <span className="font-bold">
                  {routePassInsight.isFullyCovered
                    ? '✓ 月票全程涵蓋'
                    : `${routePassInsight.coveredLegCount} 段月票涵蓋`}
                </span>
                <span>
                  本程節省{' '}
                  <strong className="text-cm-greenDark">
                    HK$ {routePassInsight.savingThisTrip.toFixed(2)}
                  </strong>
                </span>
              </div>
            </article>
          );
        })}
          </>
        )}
      </section>

      <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
        <div className="grid grid-cols-2 gap-2">
          <a className="rounded-3xl bg-white p-3 text-center text-sm font-extrabold text-cm-ink shadow-card ring-1 ring-cm-line hover:bg-cm-paper" href="/updates">
            路線更新<br />
            <span className="text-xs font-semibold text-cm-muted">公告及改道</span>
          </a>
          <a className="rounded-3xl bg-white p-3 text-center text-sm font-extrabold text-cm-ink shadow-card ring-1 ring-cm-line hover:bg-cm-paper" href="/traffic">
            交通事件<br />
            <span className="text-xs font-semibold text-cm-muted">事故及擠塞</span>
          </a>
        </div>
        <CalendarAndPlaces />
        <div id="map" className="cm-card p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-extrabold text-cm-ink">
              {selected?.id === routes[0]?.id ? '推薦路線圖' : '所選路線圖'}
            </p>
            <span className="rounded-full bg-cm-green/10 px-2 py-0.5 text-[10px] font-extrabold text-cm-greenDark">
              {selected ? `${selected.legs.length} 段` : '0 段'}
            </span>
          </div>
          {selected ? (
            <RouteMinimap route={selected} />
          ) : (
            <div className="flex h-[200px] items-center justify-center rounded-2xl bg-cm-paper text-xs text-cm-muted">
              未有路線資料
            </div>
          )}
          <p className="mt-2 px-1 text-[11px] font-semibold text-cm-muted">
            點選左側任何路線即可在地圖上顯示。
          </p>
        </div>

        {selected && passInsight && (
          <div className="rounded-3xl bg-cm-ink p-5 text-white shadow-card">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">行程摘要</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-white/60">總時間</span>
                <strong>{formatDuration(totalMinutes(selected))}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60">最低車費</span>
                <strong>HK$ {selected.discountedFare.toFixed(2)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60">月票節省</span>
                <strong className="text-cm-green">HK$ {passInsight.savingThisTrip.toFixed(2)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60">班次間隔</span>
                <strong>{selected.legs[0]?.scheduledIntervalMinutes ?? 0} min</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60">營辦商組合</span>
                <strong>{selected.legs.map((leg) => leg.operator).join(' + ')}</strong>
              </div>
            </div>
          </div>
        )}
        <div className="cm-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-cm-greenDark">快速入口</p>
              <h3 className="mt-1 text-xl font-extrabold">我的地點</h3>
            </div>
            <button className="text-sm font-bold text-cm-greenDark" type="button">
              編輯
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <p className="col-span-2 rounded-2xl bg-cm-paper p-3 text-sm text-cm-muted">
              尚未有快速入口；搜尋並選擇地點後才會顯示。
            </p>
          </div>
        </div>
      </aside>

      {selected && (
        <div className="fixed inset-x-3 bottom-20 z-40 sm:bottom-3 lg:inset-x-auto lg:right-[max(1.5rem,calc((100vw-80rem)/2))] lg:max-w-md">
          <div className="flex items-center justify-between gap-3 rounded-3xl bg-cm-ink px-4 py-3 text-white shadow-pop">
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => setNavigating(true)}
              type="button"
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                {selected.id === routes[0]?.id ? '推薦路線' : '所選路線'}
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold leading-none">
                  {totalMinutes(selected)}
                </span>
                <span className="text-xs font-bold text-white/60">min</span>
                <span className="text-sm font-bold text-cm-green">
                  HK$ {selected.discountedFare.toFixed(1)}
                </span>
              </div>
            </button>
            <button
              className="shrink-0 rounded-full bg-cm-green px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-cm-greenDark"
              onClick={() => setNavigating(true)}
              type="button"
            >
              出發
            </button>
          </div>
        </div>
      )}

      {navigationRoute && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-cm-paper">
          <header className="flex items-center gap-3 border-b border-cm-line bg-cm-ink px-4 py-3 text-white">
            <button
              aria-label="結束導航"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg hover:bg-white/20"
              onClick={() => setNavigating(false)}
              type="button"
            >
              ✕
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                導航中
              </div>
              <div className="truncate text-sm font-extrabold">
                {navigationRoute.legs[0]?.originStop?.name ?? '起點'} →{' '}
                {navigationRoute.legs[navigationRoute.legs.length - 1]?.destinationStop?.name ?? '目的地'}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xl font-extrabold leading-none">
                {formatDuration(totalMinutes(navigationRoute))}
              </div>
              <div className="text-[10px] font-bold text-cm-green">
                HK$ {navigationRoute.discountedFare.toFixed(2)}
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <ol className="mx-auto max-w-xl space-y-2.5">
              {buildDirections(navigationRoute, navigationRoute.walkTransferTimeMinutes).map(
                (step, index, all) => (
                  <li
                    className={`flex gap-3 rounded-2xl p-4 shadow-card ring-1 ${
                      index === 0 ? 'bg-cm-ink text-white ring-cm-ink' : 'bg-white ring-cm-line'
                    }`}
                    key={step.key}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                      style={{
                        backgroundColor: index === 0 ? '#00d563' : step.color,
                        color: '#ffffff',
                      }}
                    >
                      {step.kind === 'ride' ? index : step.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm font-extrabold ${
                          index === 0 ? 'text-white' : 'text-cm-ink'
                        }`}
                      >
                        {step.title}
                      </div>
                      <div
                        className={`mt-1 text-xs font-semibold ${
                          index === 0 ? 'text-white/70' : 'text-cm-muted'
                        }`}
                      >
                        {step.detail}
                      </div>
                    </div>
                    {index === 0 && (
                      <span className="shrink-0 self-center rounded-full bg-cm-green px-2.5 py-1 text-[10px] font-extrabold text-white">
                        現在
                      </span>
                    )}
                    {index === all.length - 1 && (
                      <span className="shrink-0 self-center rounded-full bg-cm-ink/10 px-2.5 py-1 text-[10px] font-extrabold text-cm-ink">
                        終點
                      </span>
                    )}
                  </li>
                ),
              )}
            </ol>

            <div className="mx-auto mt-4 max-w-xl rounded-2xl bg-white p-4 shadow-card ring-1 ring-cm-line">
              <div className="flex items-center justify-between text-xs font-bold text-cm-muted">
                <span>行程摘要</span>
                <span>
                  {navigationRoute.transferCount} 次轉乘 · 步行{' '}
                  {navigationRoute.walkTransferTimeMinutes} 分鐘
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {navigationRoute.legs.map((leg) => (
                  <span
                    className={`cm-pill ${operatorPillClasses[leg.operator] ?? 'bg-slate-500 text-white'}`}
                    key={leg.id}
                  >
                    {leg.routeNumber}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <footer className="border-t border-cm-line bg-white px-4 py-3">
            <button
              className="mx-auto block w-full max-w-xl rounded-2xl bg-cm-ink py-3 text-sm font-extrabold text-white transition hover:bg-black"
              onClick={() => setNavigating(false)}
              type="button"
            >
              結束導航
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
