import { buildPushPayload, type PushSubscription, type VapidKeys } from '@block65/webcrypto-web-push';
import { parseJourneyWatch, pushEndpointAllowed, targetUrl, type JourneyWatch, type NotificationTarget } from '../domain/journeyNotifications';

type StoredWatch = { id: string; token: string; subscription: PushSubscription; journey: JourneyWatch; expires: number; lastBody?: string };
interface Storage {
  get<T>(key: string): Promise<T | undefined>; put<T>(key: string, value: T): Promise<void>; delete(key: string): Promise<boolean>;
  list<T>(options: { prefix: string; limit: number }): Promise<Map<string, T>>;
  setAlarm(time: number): Promise<void>; getAlarm(): Promise<number | null>; deleteAlarm(): Promise<void>;
}
interface State { storage: Storage; blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> }
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...Array.from(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const hkTime = (time: string) => new Date(time).toLocaleTimeString('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit' });

/** Provider predictions only; an absent trip never proves cancellation. */
export function notificationPredictions(target: NotificationTarget, payload: any, now: number): { time: number; scheduled: boolean; extra: boolean; cancelled: boolean }[] {
  let rows: { time: string; remark?: string }[] = [];
  if (target.provider === 'KMB' || target.provider === 'CTB') {
    rows = (Array.isArray(payload.data) ? payload.data : []).filter((row: any) => row.route === target.route && row.dir === target.direction
      && (target.provider === 'CTB' || Number(row.seq) === target.seq) && (!row.data_timestamp || Math.abs(Date.parse(row.data_timestamp) - now) <= 120_000))
      .map((row: any) => ({ time: row.eta, remark: [row.rmk_tc, row.rmk_en, row.remarks_tc, row.remarks_en].filter(Boolean).join(' ') }));
  } else if (target.provider === 'MTR') {
    if (payload.status !== 1 || !payload.curr_time || Math.abs(Date.parse(payload.curr_time.replace(' ', 'T') + '+08:00') - now) > 120_000) return [];
    const station = payload.data?.[target.route + '-' + target.stop];
    rows = [...(station?.UP ?? []), ...(station?.DOWN ?? [])].filter(row => row.valid !== 'N' && target.destinations?.includes(row.dest))
      .map(row => ({ time: row.time.replace(' ', 'T') + '+08:00' }));
  } else if (target.provider === 'LRT') {
    if (payload.status !== 1 || !payload.system_time || Math.abs(Date.parse(payload.system_time.replace(' ', 'T') + '+08:00') - now) > 120_000) return [];
    rows = (payload.platform_list ?? []).flatMap((platform: any) => platform.route_list ?? []).filter((row: any) => row.route_no === target.route && row.stop === 0
      && target.destinations?.some(name => name === row.dest_ch || name.toLowerCase() === row.dest_en?.toLowerCase()))
      .map((row: any) => ({ time: new Date(now + (/arriving|departing/i.test(row.time_en) ? 0 : Number.parseInt(row.time_en, 10)) * 60000).toISOString() }));
  } else if (target.provider === 'GMB') {
    if (String(payload.data?.stop_id) !== target.stop || Math.abs(Date.parse(payload.generated_timestamp) - now) > 120_000) return [];
    rows = (payload.data?.eta ?? []).map((row: any) => ({ time: row.timestamp }));
  }
  return rows.map(row => ({ time: Date.parse(row.time), scheduled: /scheduled|原定|預定/i.test(row.remark ?? ''),
    extra: /additional|extra|加班|特別加開/i.test(row.remark ?? ''), cancelled: /cancelled|canceled|取消/i.test(row.remark ?? '') }))
    .filter(row => Number.isFinite(row.time) && row.time >= now - 30_000 && row.time < now + 2 * 3600_000).sort((a, b) => a.time - b.time);
}

// One small SQLite-backed object bounds work and retains alarms while the app
// is asleep. No GPS coordinates, card details or route history are stored.
export class JourneyNotifications {
  private keys!: VapidKeys;
  constructor(private ctx: State) {
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<VapidKeys>('vapid');
      if (saved) { this.keys = saved; return; }
      const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const privateKey = await crypto.subtle.exportKey('jwk', pair.privateKey);
      this.keys = { subject: 'https://kmb-monthly-pass-mapper.tableisnottable.workers.dev',
        publicKey: base64(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), privateKey: privateKey.d! };
      await ctx.storage.put('vapid', this.keys);
    });
  }
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      const id = request.headers.get('X-Watch-Id'), token = request.headers.get('X-Watch-Token');
      if (id && /^[a-f0-9-]{36}$/.test(id)) {
        const watch = await this.ctx.storage.get<StoredWatch>('watch:' + id);
        return response({ active: !!watch && watch.token === token && watch.expires > Date.now() });
      }
      return response({ publicKey: this.keys.publicKey, intervalSeconds: 60, maxMinutes: 120 });
    }
    if (Number(request.headers.get('Content-Length')) > 12_000) return response({ error: 'Request too large' }, 413);
    try {
      const text = await request.text(); if (text.length > 12_000) return response({ error: 'Request too large' }, 413);
      const input = JSON.parse(text);
      if (request.method === 'DELETE') {
        if (typeof input.id !== 'string' || !/^[a-f0-9-]{36}$/.test(input.id)) return response({ error: 'Invalid watch' }, 400);
        const record = await this.ctx.storage.get<StoredWatch>('watch:' + input.id);
        if (record && record.token !== input.token) return response({ error: 'Invalid watch token' }, 403);
        await this.ctx.storage.delete('watch:' + input.id);
        if (!(await this.ctx.storage.list({ prefix: 'watch:', limit: 1 })).size) await this.ctx.storage.deleteAlarm();
        return response({ stopped: true });
      }
      if (request.method !== 'POST') return response({ error: 'Unsupported method' }, 405);
      const journey = parseJourneyWatch(input.journey);
      const subscription = input.subscription as PushSubscription;
      if (!subscription || !pushEndpointAllowed(subscription.endpoint) || subscription.endpoint.length > 2048
        || !/^[A-Za-z0-9_-]{87}$/.test(subscription.keys?.p256dh ?? '') || !/^[A-Za-z0-9_-]{22}$/.test(subscription.keys?.auth ?? '')) return response({ error: 'Invalid push subscription' }, 400);
      const entries = await this.ctx.storage.list<StoredWatch>({ prefix: 'watch:', limit: 16 });
      for (const [key, record] of Array.from(entries)) if (record.expires <= Date.now() || record.subscription.endpoint === subscription.endpoint) { await this.ctx.storage.delete(key); entries.delete(key); }
      if (entries.size >= 15) return response({ error: 'Notification capacity is full. Please try again later.' }, 503);
      const record: StoredWatch = { id: crypto.randomUUID(), token: base64(crypto.getRandomValues(new Uint8Array(32))), subscription, journey,
        expires: Math.min(Date.now() + 2 * 3600_000, Date.parse(journey.plannedTime) + 20 * 60000) };
      const body = journey.locale === 'en' ? `Watching ${journey.route} at ${journey.stopName}. Updates about once a minute; planned boarding ${hkTime(journey.plannedTime)} HKT.`
        : `已開啟 ${journey.route}（${journey.stopName}）候車通知；約每分鐘更新。行程預計 ${hkTime(journey.plannedTime)} 上車。`;
      if (!await this.send(record, body)) return response({ error: 'The phone push service rejected the subscription. Please enable notifications and try again.' }, 502);
      record.lastBody = body; await this.ctx.storage.put('watch:' + record.id, record);
      if (!await this.ctx.storage.getAlarm()) await this.ctx.storage.setAlarm(Date.now() + 60_000);
      return response({ id: record.id, token: record.token, expires: record.expires });
    } catch { return response({ error: 'Invalid notification request' }, 400); }
  }
  private async send(record: StoredWatch, body: string): Promise<boolean> {
    const payload = await buildPushPayload({ data: JSON.stringify({ title: `Transit Compass · ${record.journey.route}`, body,
      tag: 'transit-compass-boarding', url: record.journey.locale === 'en' ? '/en' : '/', id: record.id, token: record.token,
      stopLabel: record.journey.locale === 'en' ? 'Stop updates' : '停止通知' }), options: { ttl: 120 } }, record.subscription, this.keys);
    const result = await fetch(record.subscription.endpoint, { ...payload, redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (result.status === 404 || result.status === 410) await this.ctx.storage.delete('watch:' + record.id);
    return result.ok;
  }
  async alarm(): Promise<void> {
    const now = Date.now(), entries = await this.ctx.storage.list<StoredWatch>({ prefix: 'watch:', limit: 15 });
    const requests = new Map<string, Promise<unknown>>();
    const read = (target: NotificationTarget) => {
      const url = targetUrl(target);
      if (!requests.has(url)) requests.set(url, fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error', headers: { Accept: 'application/json' } }).then(r => { if (!r.ok) throw new Error('Unavailable'); return r.json(); }));
      return requests.get(url)!;
    };
    try {
      for (const [key, record] of Array.from(entries)) {
        if (record.expires <= now) { await this.ctx.storage.delete(key); continue; }
        try {
          const { journey } = record, en = journey.locale === 'en';
          const replies = await Promise.allSettled(journey.targets.map(async target => notificationPredictions(target, await read(target), now)));
          const predictions = replies.flatMap(result => result.status === 'fulfilled' ? result.value : []).sort((a, b) => a.time - b.time);
          const next = predictions.find(row => !row.cancelled), cancelled = predictions.some(row => row.cancelled);
          let body = next ? `${journey.stopName} → ${journey.destination}: ${Math.max(0, Math.ceil((next.time - now) / 60000))} ${en ? 'min' : '分鐘'} · ${next.scheduled ? en ? 'Provider scheduled' : '營辦商預定班次' : en ? 'Live prediction' : '即時預測'}${next.extra ? en ? ' · Additional' : ' · 加班' : ''}`
            : `${journey.stopName}: ${en ? 'Live prediction unavailable. Planned boarding' : '暫無可核實即時預測；行程預計上車'} ${hkTime(journey.plannedTime)} HKT. ${en ? 'Check the stop display.' : '請查看車站顯示。'}`;
          if (cancelled) body += en ? ' · Provider cancellation notice' : ' · 營辦商取消班次通知';
          body += ` · ${hkTime(new Date(now).toISOString())} HKT`;
          if (body !== record.lastBody && (await this.ctx.storage.get<StoredWatch>(key))?.token === record.token && await this.send(record, body)) {
            // A Stop request may arrive while the push service is responding.
            // Never recreate a watch that was removed during that request.
            if ((await this.ctx.storage.get<StoredWatch>(key))?.token === record.token) { record.lastBody = body; await this.ctx.storage.put(key, record); }
          }
        } catch { /* Retry at the next alarm; never invent a live prediction. */ }
      }
    } finally {
      if ((await this.ctx.storage.list({ prefix: 'watch:', limit: 1 })).size) await this.ctx.storage.setAlarm(Date.now() + 60_000);
      else await this.ctx.storage.deleteAlarm();
    }
  }
}
