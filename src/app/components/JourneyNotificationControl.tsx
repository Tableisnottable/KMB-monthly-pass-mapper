'use client';
import { useEffect, useState } from 'react';
import type { Segment } from '../../engine/UpgradedScoringEngine';
import type { NotificationTarget } from '../../domain/journeyNotifications';
import { transportFetch } from '../../browser/transportClient';
import { copy, type PlannerLocale } from './plannerUi';

type SavedWatch = { id: string; token: string; expires: number; route: string; stop: string };
const storageKey = 'compass-boarding-watch-v1';
function readWatch(): SavedWatch | null {
  try { const v = JSON.parse(localStorage.getItem(storageKey) ?? 'null'); return v && typeof v.id === 'string' && typeof v.token === 'string' && v.expires > Date.now() ? v : null; } catch { return null; }
}
export function JourneyNotificationControl({ leg, locale }: { leg: Segment; locale: PlannerLocale }) {
  const [active, setActive] = useState<SavedWatch | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
    const saved = readWatch(); setActive(saved);
    if (saved) void window.fetch('/api/notifications', { headers: { 'X-Watch-Id': saved.id, 'X-Watch-Token': saved.token }, cache: 'no-store' })
      .then(async response => { if (response.ok && !(await response.json()).active) { localStorage.removeItem(storageKey); setActive(null); } }).catch(() => undefined);
    const update = () => setActive(readWatch());
    const stopped = (event: MessageEvent) => { if (event.data?.type === 'boarding-watch-stopped') { localStorage.removeItem(storageKey); setActive(null); } };
    window.addEventListener('storage', update); navigator.serviceWorker?.addEventListener('message', stopped); const tick = setInterval(update, 15000);
    return () => { window.removeEventListener('storage', update); navigator.serviceWorker?.removeEventListener('message', stopped); clearInterval(tick); };
  }, []);
  const available = !!leg.networkPatternId && leg.boardingIndex !== undefined && leg.alightingIndex !== undefined && !!leg.departureTime
    && Date.parse(leg.departureTime) >= Date.now() - 60_000 && Date.parse(leg.departureTime) <= Date.now() + 2 * 3600_000;
  async function stop() {
    if (!active) return; setBusy(true); setError('');
    try {
      const result = await window.fetch('/api/notifications', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: active.id, token: active.token }) });
      if (!result.ok) throw new Error();
      localStorage.removeItem(storageKey); setActive(null);
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;
      await (await registration.pushManager.getSubscription())?.unsubscribe();
    } catch { setError(copy(locale, '未能停止伺服器通知，請連線後再試。通知最遲兩小時後自動停止。', 'Could not stop server updates. Reconnect and try again; updates expire within two hours.')); }
    finally { setBusy(false); }
  }
  async function enable() {
    setBusy(true); setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error(copy(locale, '請在瀏覽器／手機設定允許通知。', 'Allow notifications in your browser or phone settings.'));
      const configResponse = await window.fetch('/api/notifications', { cache: 'no-store' });
      const config = await configResponse.json(); if (!configResponse.ok) throw new Error(config.error);
      const registration = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(copy(locale, 'App 通知服務未就緒，請重新整理後再試。', 'App notification service is not ready. Refresh and try again.'))), 15000))]);
      const key = Uint8Array.from(atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const params = new URLSearchParams({ resource: 'notification-target', pattern: leg.networkPatternId!, board: String(leg.boardingIndex), alight: String(leg.alightingIndex) });
      const lookup = await transportFetch('/api/network?' + params); if (!lookup.ok) throw new Error(copy(locale, '未能核實通知車站，請稍後再試。', 'Could not verify the notification stop. Please try again.'));
      const targets = (await lookup.json()).data as NotificationTarget[];
      const result = await window.fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON(), journey: { targets,
        route: leg.routeNumber || leg.mode, stopName: leg.originStop?.name, destination: leg.destinationStop?.name, plannedTime: leg.departureTime, locale } }) });
      const payload = await result.json(); if (!result.ok) throw new Error(payload.error);
      const saved = { ...payload, route: leg.routeNumber ?? '', stop: leg.originStop?.name ?? '' };
      setActive(saved); try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch { /* Updates can still be stopped from the phone notification. */ }
    } catch (e) { setError(e instanceof Error ? e.message : copy(locale, '通知設定失敗，請再試。', 'Could not enable notifications. Please try again.')); }
    finally { setBusy(false); }
  }
  return <section className="journey-notifications" aria-label={copy(locale, '手機候車通知', 'Phone boarding notifications')}>
    <strong>{copy(locale, '手機候車通知', 'Phone boarding notifications')}</strong>
    {active ? <><p role="status">{copy(locale, '已開啟：', 'Watching: ')}{active.route} · {active.stop}</p><button type="button" disabled={busy} onClick={() => void stop()}>{busy ? copy(locale, '處理中…', 'Working…') : copy(locale, '停止通知', 'Stop notifications')}</button></>
      : <button type="button" disabled={busy || !supported || !available} onClick={() => void enable()}>{busy ? copy(locale, '正在設定…', 'Enabling…') : copy(locale, '開啟此程候車通知', 'Notify me about this boarding')}</button>}
    <p>{!supported ? copy(locale, '此瀏覽器未提供 Web Push。iPhone 請先加入主畫面，再從 App 開啟。', 'This browser does not offer Web Push. On iPhone, add to Home Screen and open the installed app first.')
      : !available && !active ? copy(locale, '請選擇未來兩小時內可上車的行程。', 'Choose a journey boarding within the next two hours.')
        : copy(locale, '約每分鐘更新第一程候車資料，App 在背景時亦可接收。非持續導航；手機省電、網絡或通知設定可能延遲送達。最遲兩小時後停止。', 'Updates the first boarding about once a minute, including in the background. This is not continuous navigation. Battery, network and notification settings can delay delivery. Stops within two hours.')}</p>
    <small>{copy(locale, 'iPhone／iPad：先加入主畫面（iOS 16.4 或以上）。伺服器只短暫保留通知訂閱及此程上車站，停止或到期後刪除；不會上傳 GPS。', 'iPhone/iPad: add to Home Screen first (iOS 16.4+). The server temporarily keeps the push subscription and this boarding stop, then deletes them when stopped or expired. GPS is not uploaded.')}</small>
    {error && <p role="alert">{error}</p>}
  </section>;
}
