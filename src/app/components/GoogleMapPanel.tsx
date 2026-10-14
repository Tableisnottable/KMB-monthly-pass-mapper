'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type LocateStatus = 'idle' | 'locating' | 'located' | 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'error';

interface UserPosition {
  lat: number;
  lon: number;
  accuracy: number;
}

// Default Hong Kong view used before the user shares a location.
const HK_MARKER = { lat: 22.3193, lon: 114.1694 };
const HK_BBOX = '113.85,22.20,114.45,22.60';

function mapUrl(lat: number, lon: number): string {
  const dLat = 0.012;
  const dLon = 0.012;
  const bbox = `${(lon - dLon).toFixed(5)},${(lat - dLat).toFixed(5)},${(lon + dLon).toFixed(5)},${(lat + dLat).toFixed(5)}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)},${lon.toFixed(5)}`;
}

const STATUS_MESSAGE: Record<LocateStatus, string | null> = {
  idle: '按「定位」在地圖上找到你目前的位置，位置只會留在你的瀏覽器。',
  locating: '正在取得你的位置...',
  located: null,
  denied: '已拒絕位置權限。你可以在瀏覽器設定中允許位置存取後再試。',
  unavailable: '無法取得位置資料（可能沒有訊號或定位服務被關閉）。',
  timeout: '定位逾時，請再試一次。',
  unsupported: '此瀏覽器不支援定位功能。',
  error: '定位時發生錯誤，請再試一次。',
};

export function GoogleMapPanel() {
  const embedUrl = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_URL;
  const [status, setStatus] = useState<LocateStatus>('idle');
  const [position, setPosition] = useState<UserPosition | null>(null);

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (result) => {
        setPosition({
          lat: result.coords.latitude,
          lon: result.coords.longitude,
          accuracy: result.coords.accuracy,
        });
        setStatus('located');
      },
      (error) => {
        // GeolocationPositionError codes per spec: 1=denied, 2=unavailable, 3=timeout
        if (error.code === 1) setStatus('denied');
        else if (error.code === 2) setStatus('unavailable');
        else if (error.code === 3) setStatus('timeout');
        else setStatus('error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  useEffect(() => {
    window.addEventListener('tc:locate', locate);
    return () => window.removeEventListener('tc:locate', locate);
  }, [locate]);

  const src = useMemo(() => {
    if (position) return mapUrl(position.lat, position.lon);
    // Google embed (configured via env) cannot be recentered without an API
    // key, so once the user is located we switch to the OSM embed centered
    // on them.
    if (embedUrl) return embedUrl;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${HK_BBOX}&layer=mapnik&marker=${HK_MARKER.lat},${HK_MARKER.lon}`;
  }, [embedUrl, position]);

  const usingGoogle = Boolean(embedUrl) && !position;
  const googleMapsUrl = position
    ? `https://www.google.com/maps/search/?api=1&query=${position.lat},${position.lon}`
    : 'https://www.google.com/maps/search/?api=1&query=Hong+Kong';
  const message = STATUS_MESSAGE[status];

  return (
    <div className="space-y-2">
      <div className="relative h-[420px] overflow-hidden rounded-[22px] bg-slate-100">
        <iframe
          className="h-full w-full border-0"
          key={src}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={src}
          title={usingGoogle ? 'Google Maps Hong Kong transit map' : 'OpenStreetMap Hong Kong transit map'}
        />
        {position && status === 'located' && (
          <div className="absolute top-3 left-3 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs font-bold text-cm-ink shadow">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cm-green opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cm-green" />
            </span>
            你在此
            <span className="font-normal text-cm-muted">±{Math.round(position.accuracy)} 米</span>
          </div>
        )}
        <div className="absolute right-3 bottom-3 flex items-center gap-2">
          <button
            className="rounded-xl bg-cm-ink px-3 py-2 text-xs font-bold text-white shadow hover:bg-black disabled:opacity-60"
            disabled={status === 'locating'}
            onClick={locate}
            type="button"
          >
            {status === 'locating' ? '定位中...' : position ? '重新定位' : '📍 在地圖上找到我'}
          </button>
          {position && (
            <button
              className="rounded-xl bg-white/95 px-3 py-2 text-xs font-bold text-cm-ink shadow hover:bg-cm-paper"
              onClick={() => {
                setPosition(null);
                setStatus('idle');
              }}
              type="button"
            >
              返回香港全境
            </button>
          )}
        </div>
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow">
          <span>{usingGoogle ? 'Google Maps · 路線及地圖資料由 Google 提供' : 'OpenStreetMap · 地圖資料由貢獻者提供'}</span>
          <a
            className="font-bold text-cm-greenDark underline"
            href={googleMapsUrl}
            rel="noreferrer"
            target="_blank"
          >
            在 Google Maps 開啟
          </a>
        </div>
      </div>
      {message && (
        <p className="px-1 text-xs text-cm-muted" role="status">
          {message}
        </p>
      )}
      {status === 'located' && position && (
        <p className="px-1 text-xs text-cm-muted" role="status">
          已定位：{position.lat.toFixed(5)}, {position.lon.toFixed(5)} · 位置僅用於本機地圖顯示，不會上傳。
        </p>
      )}
    </div>
  );
}
