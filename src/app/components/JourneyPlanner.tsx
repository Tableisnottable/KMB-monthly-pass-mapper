'use client';

import { useState } from 'react';
import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';
import type { PlaceResult } from './PlaceAutocomplete';
import { JourneyPlaceSearch } from './JourneyPlaceSearch';
import { PlannerBoard } from './PlannerBoard';

interface JourneyMeta {
  source?: string;
  live?: boolean;
  candidates?: number;
  kmbCandidates?: number;
  citybusCandidates?: number;
  transfers?: number;
  durationMs?: number;
  tooCloseToRide?: boolean;
  fromStops?: { stop: string; name: string; walkMinutes: number }[];
  toStops?: { stop: string; name: string; walkMinutes: number }[];
}

export function JourneyPlanner({ initialRoutes }: { initialRoutes: ScoredRoute[] }) {
  const [routes, setRoutes] = useState<ScoredRoute[]>(initialRoutes);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<JourneyMeta | null>(null);
  const [searched, setSearched] = useState(false);

  // Every leg of every proposed journey has finished for the day.
  const allClosed =
    routes.length > 0 &&
    routes.every((route) => (route.legs ?? []).every((leg) => leg.serviceEnded));

  async function handleSearch(origin: PlaceResult, destination: PlaceResult) {
    setSearching(true);
    setError(null);
    setRoutes([]);
    setMeta(null);
    setSearched(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const params = new URLSearchParams({
        fromLat: String(origin.lat),
        fromLon: String(origin.lng),
        toLat: String(destination.lat),
        toLon: String(destination.lng),
      });
      const response = await fetch(`/api/journey?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        data?: ScoredRoute[];
        meta?: JourneyMeta;
        error?: string;
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? '路線規劃暫時未能使用');
      }
      setRoutes(payload.data);
      setMeta(payload.meta ?? null);
      setSearched(true);
      document.getElementById('routes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'AbortError'
          ? '官方路線搜尋超時，請稍後再試或縮小搜尋範圍。'
          : err instanceof Error
            ? err.message
            : '路線規劃失敗';
      setError(message);
    } finally {
      window.clearTimeout(timeout);
      setSearching(false);
    }
  }

  return (
    <>
      <div id="journey" />
      <JourneyPlaceSearch onSearch={handleSearch} searching={searching} />
      {searching && (
        <div className="flex items-center gap-3 rounded-2xl bg-cm-ink p-4 text-sm font-bold text-white shadow-card">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-cm-green" />
          <span>正在讀取 KMB、Citybus 官方路線、站點及實時班次…</span>
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}
      {searched && meta?.tooCloseToRide && (
        <div className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900 ring-1 ring-amber-200">
          起點與目的地相距很近，步行即可到達，不需要乘車。
        </div>
      )}
      {searched && allClosed && (
        <div className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-800 ring-1 ring-rose-200">
          此路線的所有班次今日已經結束。以下為最後可行的走法供參考，或可考慮其他交通方式。
        </div>
      )}
      {searched && meta && !meta.tooCloseToRide && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 text-xs text-cm-muted shadow-card ring-1 ring-cm-line">
          <span className="rounded-full bg-cm-green/10 px-2 py-0.5 font-extrabold text-cm-greenDark">
            {meta.live ? '實時路線' : '路線結果'}
          </span>
          <span>
            找到 {routes.length} 條路線
            {typeof meta.candidates === 'number' ? `（候選 ${meta.candidates} 條）` : ''}
          </span>
          {(typeof meta.kmbCandidates === 'number' ||
            typeof meta.citybusCandidates === 'number') && (
            <span>
              九巴 {meta.kmbCandidates ?? 0} · 城巴 {meta.citybusCandidates ?? 0}
            </span>
          )}
          {typeof meta.durationMs === 'number' && (
            <span>
              官方資料耗時{' '}
              {meta.durationMs >= 1000
                ? `${(meta.durationMs / 1000).toFixed(1)} 秒`
                : `${meta.durationMs} 毫秒`}
            </span>
          )}
          {meta.source && <span>{meta.source}</span>}
          {meta.fromStops?.[0] && (
            <span>
              上車：{meta.fromStops[0].name}（步行 {meta.fromStops[0].walkMinutes} 分）
            </span>
          )}
          {meta.toStops?.[0] && (
            <span>
              落車：{meta.toStops[0].name}（步行 {meta.toStops[0].walkMinutes} 分）
            </span>
          )}
        </div>
      )}
      <PlannerBoard
        emptyHint={
          meta?.tooCloseToRide
            ? '這段距離步行即可到達。'
            : '輸入起點和目的地，搜尋真實巴士路線。'
        }
        routes={routes}
      />
    </>
  );
}
