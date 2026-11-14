'use client';
import { useEffect, useState } from 'react';

export function useLiveLocation(enabled: boolean) {
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [status, setStatus] = useState<'off' | 'locating' | 'live' | 'paused' | 'denied' | 'unavailable'>('off');
  useEffect(() => {
    if (!enabled) { setStatus('off'); setPosition(null); return; }
    if (!navigator.geolocation) { setStatus('unavailable'); return; }
    let id: number | undefined, cancelled = false;
    const stop = () => { if (id !== undefined) navigator.geolocation.clearWatch(id); id = undefined; };
    const start = () => {
      stop();
      if (document.visibilityState === 'hidden') { setStatus('paused'); return; }
      setStatus('locating');
      id = navigator.geolocation.watchPosition(value => {
        if (cancelled) return;
        setPosition(value); setStatus('live');
      }, error => { if (!cancelled) { setStatus(error.code === 1 ? 'denied' : 'unavailable'); setPosition(null); } },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    };
    start(); document.addEventListener('visibilitychange', start);
    return () => { cancelled = true; stop(); document.removeEventListener('visibilitychange', start); };
  }, [enabled]);
  return { position, status };
}
