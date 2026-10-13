'use client';

import { useMemo } from 'react';
import type { ScoredRoute } from '../../engine/UpgradedScoringEngine';

const OPERATOR_COLORS: Record<string, string> = {
  KMB: '#e4002b',
  LWB: '#ff6a00',
  MTR: '#a6192e',
  CTB: '#f7b500',
};

function operatorColor(operator: string): string {
  return OPERATOR_COLORS[operator] ?? '#6b7280';
}

interface Point {
  x: number;
  y: number;
  name: string;
  color: string;
}

export function RouteMinimap({ route }: { route: ScoredRoute }) {
  const { points, segments } = useMemo(() => {
    const stops = route.legs.flatMap((leg, index) => {
      const list = [];
      if (index === 0 && leg.originStop) {
        list.push({ stop: leg.originStop, color: operatorColor(leg.operator) });
      }
      if (leg.destinationStop) {
        list.push({ stop: leg.destinationStop, color: operatorColor(leg.operator) });
      }
      return list;
    });

    if (stops.length < 2) {
      return { points: [] as Point[], segments: [] as { x1: number; y1: number; x2: number; y2: number; color: string }[] };
    }

    const lats = stops.map((s) => s.stop.lat ?? 0);
    const lngs = stops.map((s) => s.stop.lng ?? 0);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const W = 320;
    const H = 200;
    const PAD = 28;
    const latSpan = Math.max(maxLat - minLat, 0.0001);
    const lngSpan = Math.max(maxLng - minLng, 0.0001);

    const project = (lat: number, lng: number) => ({
      x: PAD + ((lng - minLng) / lngSpan) * (W - PAD * 2),
      y: PAD + ((maxLat - lat) / latSpan) * (H - PAD * 2),
    });

    const points: Point[] = stops.map((s) => ({
      ...project(s.stop.lat ?? 0, s.stop.lng ?? 0),
      name: s.stop.name,
      color: s.color,
    }));

    const segments = points.slice(1).map((p, i) => ({
      x1: points[i].x,
      y1: points[i].y,
      x2: p.x,
      y2: p.y,
      color: p.color,
    }));

    return { points, segments };
  }, [route]);

  if (points.length < 2) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-2xl bg-cm-paper text-xs text-cm-muted">
        未有路線資料
      </div>
    );
  }

  const origin = points[0];
  const destination = points[points.length - 1];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#e8efe9]">
      <svg viewBox="0 0 320 200" className="block h-[200px] w-full" role="img" aria-label="路線迷你地圖">
        <g stroke="#ffffff" strokeWidth="10" opacity="0.9">
          <line x1="0" y1="60" x2="320" y2="40" />
          <line x1="40" y1="0" x2="90" y2="200" />
          <line x1="0" y1="150" x2="320" y2="170" />
          <line x1="220" y1="0" x2="200" y2="200" />
        </g>
        <g stroke="#d3dcd5" strokeWidth="2">
          <line x1="0" y1="60" x2="320" y2="40" />
          <line x1="40" y1="0" x2="90" y2="200" />
          <line x1="0" y1="150" x2="320" y2="170" />
          <line x1="220" y1="0" x2="200" y2="200" />
        </g>
        {segments.map((s, i) => (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={s.color}
            strokeWidth="5"
            strokeLinecap="round"
          />
        ))}
        {points.slice(1, -1).map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="7" fill="#ffffff" />
            <circle cx={p.x} cy={p.y} r="4" fill={p.color} />
          </g>
        ))}
        <g>
          <circle cx={origin.x} cy={origin.y} r="9" fill="#00d563" stroke="#ffffff" strokeWidth="3" />
        </g>
        <g>
          <path
            d={`M ${destination.x} ${destination.y - 22} c -7 0 -12 5 -12 11 c 0 8 12 18 12 18 s 12 -10 12 -18 c 0 -6 -5 -11 -12 -11 z`}
            fill="#1a1a1a"
            stroke="#ffffff"
            strokeWidth="2"
          />
          <circle cx={destination.x} cy={destination.y - 11} r="3.5" fill="#ffffff" />
        </g>
      </svg>
      <div className="absolute bottom-2 left-2 max-w-[70%] truncate rounded-lg bg-white/95 px-2 py-1 text-[11px] font-bold text-cm-ink shadow">
        {origin.name} → {destination.name}
      </div>
      <div className="absolute right-2 top-2 rounded-lg bg-white/95 px-2 py-1 text-[11px] font-bold text-cm-ink shadow">
        {route.legs.length} 段 · HK$ {route.discountedFare.toFixed(2)}
      </div>
    </div>
  );
}
