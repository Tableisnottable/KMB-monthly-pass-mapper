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
  fromStops?: { stop: string; name: string; walkMinutes: number }[];
  toStops?: { stop: string; name: string; walkMinutes: number }[];
}

export function JourneyPlanner({ initialRoutes }: { initialRoutes: ScoredRoute[] }) {
  const [routes, setRoutes] = useState<ScoredRoute[]>(initialRoutes);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<JourneyMeta | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(origin: PlaceResult, destination: PlaceResult) {
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        fromLat: String(origin.lat),
        fromLon: String(origin.lng),
        toLat: String(destination.lat),
        toLon: String(destination.lng),
      });
      const response = await fetch(`/api/journey?${params.toString()}`, {
        cache: 'no-store',
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
      setError(err instanceof Error ? err.message : '路線規劃失敗');
    } finally {
      setSearching(false);
    }
  }

  return (
    <>
      <JourneyPlaceSearch onSearch={handleSearch} searching={searching} />
      {error && (
        <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}
      {searched && meta && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 text-xs text-cm-muted shadow-card ring-1 ring-cm-line">
          <span className="rounded-full bg-cm-green/10 px-2 py-0.5 font-extrabold text-cm-greenDark">
            {meta.live ? '實時路線' : '路線結果'}
          </span>
          <span>
            找到 {routes.length} 條路線
            {typeof meta.candidates === 'number' ? `（候選 ${meta.candidates} 條）` : ''}
          </span>
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
      <PlannerBoard routes={routes} emptyHint="輸入起點和目的地，搜尋真實巴士路線。" />
    </>
  );
}
