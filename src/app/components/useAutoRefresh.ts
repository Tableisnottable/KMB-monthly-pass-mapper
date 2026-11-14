'use client';

import { useEffect, useRef, useState } from 'react';

/** Sequential, visible-page polling with cancellation and bounded retry backoff. */
export function useAutoRefresh(key: string, request: (signal: AbortSignal) => Promise<void>, interval = 30_000, immediate = true) {
  const current = useRef(request); current.current = request;
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ key: '', loading: false, failed: false, updatedAt: 0 });
  useEffect(() => {
    if (!key) return;
    let stopped = false, running = false, failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
    async function run() {
      if (stopped || running) return;
      clearTimeout(timer);
      if (document.visibilityState === 'hidden' || !navigator.onLine) { timer = setTimeout(run, interval); return; }
      running = true; controller = new AbortController();
      setState(previous => ({ key, loading: true, failed: previous.key === key && previous.failed, updatedAt: previous.key === key ? previous.updatedAt : 0 }));
      try {
        await current.current(controller.signal);
        if (!stopped) { failures = 0; setState({ key, loading: false, failed: false, updatedAt: Date.now() }); }
      } catch {
        if (!stopped) { if (!controller?.signal.aborted) failures++; setState(previous => ({ ...previous, loading: false, failed: !controller?.signal.aborted || previous.failed })); }
      } finally {
        running = false;
        if (!stopped) timer = setTimeout(run, Math.min(120_000, interval * 2 ** Math.min(failures, 3)));
      }
    }
    function resume() {
      if (document.visibilityState !== 'hidden' && navigator.onLine) void run();
      else controller?.abort();
    }
    if (immediate) void run(); else timer = setTimeout(run, interval);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', resume);
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); window.removeEventListener('offline', resume); };
  }, [key, interval, version, immediate]);
  return { ...(state.key === key ? state : { loading: false, failed: false, updatedAt: 0 }), refresh: () => setVersion(value => value + 1) };
}
