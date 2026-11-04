'use client';

import { useMemo } from 'react';
import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';

function toCalendarDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function rideMinutes(route: ScoredRoute): number {
  return route.legs.reduce((total, leg) => total + (leg.journeyTimeMinutes ?? 0), 0);
}

export function NextTripPanel({ route }: { route: ScoredRoute | null }) {
  const summary = useMemo(() => {
    if (!route) return null;
    const first = route.legs[0];
    const last = route.legs[route.legs.length - 1];
    const waitMinutes = first && !first.serviceEnded ? first.realtimeEta?.etaMinutes ?? 0 : 0;
    const total =
      rideMinutes(route) +
      (route.walkTransferTimeMinutes ?? 0) +
      waitMinutes;
    return {
      from: first?.originStop?.name ?? '起點',
      to: last?.destinationStop?.name ?? '目的地',
      routes: route.legs.map((leg) => leg.routeNumber).join(' → '),
      total,
      fare: route.discountedFare,
      transfers: route.transferCount ?? Math.max(0, route.legs.length - 1),
      hasEndedService: route.legs.some((leg) => leg.serviceEnded),
    };
  }, [route]);

  const calendarUrl = useMemo(() => {
    if (!summary) return null;
    const start = new Date();
    start.setMinutes(start.getMinutes() + summary.total);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 45);
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `${summary.from} → ${summary.to}（${summary.routes}）`,
      dates: `${toCalendarDate(start)}/${toCalendarDate(end)}`,
      location: summary.to,
      details: `Transit Compass HK 建議路線：${summary.routes}，約 ${summary.total} 分鐘，車費 HK$${summary.fare.toFixed(2)}。`,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }, [summary]);

  if (!summary) {
    return (
      <div className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-cm-line sm:p-5">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-cm-greenDark">行程摘要</p>
        <h3 className="mt-1 text-xl font-extrabold">尚未選擇路線</h3>
        <p className="mt-3 rounded-2xl bg-cm-paper p-3 text-sm text-cm-muted">
          搜尋並點選一條路線後，這裡會顯示摘要和行程提醒。
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-cm-line sm:p-5">
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-cm-greenDark">行程摘要</p>
      <h3 className="mt-1 text-xl font-extrabold">下一個行程</h3>

      <div className="mt-3 space-y-1.5 rounded-2xl bg-cm-paper p-3 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-cm-muted">路線</span>
          <span className="font-extrabold text-cm-ink">{summary.routes}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-cm-muted">上車 → 落車</span>
          <span className="text-right font-bold text-cm-ink">
            {summary.from} → {summary.to}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-cm-muted">全程</span>
          <span className="font-extrabold text-cm-ink">{summary.total} 分鐘</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-cm-muted">轉乘</span>
          <span className="font-bold text-cm-ink">{summary.transfers} 次</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-cm-muted">車費</span>
          <span className="font-extrabold text-cm-ink">HK$ {summary.fare.toFixed(2)}</span>
        </div>
      </div>

      {summary.hasEndedService && (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 ring-1 ring-rose-200">
          此路線今日已收班，提醒時間僅供參考。
        </p>
      )}

      {calendarUrl && (
        <a
          className="mt-3 flex items-center justify-center rounded-2xl bg-cm-green px-4 py-3 text-sm font-extrabold text-white transition hover:bg-cm-greenDark"
          href={calendarUrl}
          rel="noreferrer"
          target="_blank"
        >
          加入 Google Calendar
        </a>
      )}
      <p className="mt-2 text-center text-xs text-cm-muted">
        提醒時間以現時加全程時間計算。
      </p>
    </div>
  );
}
