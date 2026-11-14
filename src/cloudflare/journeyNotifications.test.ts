import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { JourneyNotifications, notificationPredictions } from './journeyNotifications';
import { parseJourneyWatch, pushEndpointAllowed, targetUrl, type NotificationTarget } from '../domain/journeyNotifications';

class MemoryStorage {
  values = new Map<string, unknown>(); alarm: number | null = null;
  async get<T>(key: string) { return structuredClone(this.values.get(key)) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, structuredClone(value)); }
  async delete(key: string) { return this.values.delete(key); }
  async list<T>({ prefix, limit }: { prefix: string; limit: number }) { return new Map(Array.from(this.values).filter(([key]) => key.startsWith(prefix)).slice(0, limit)) as Map<string, T>; }
  async setAlarm(time: number) { this.alarm = time; } async getAlarm() { return this.alarm; } async deleteAlarm() { this.alarm = null; }
}
const target: NotificationTarget = { provider: 'KMB', route: '104', stop: 'AA123', direction: 'O', seq: 1 };
const journey = () => ({ targets: [target], route: '104', stopName: 'Test stop', destination: 'Test destination', plannedTime: new Date(Date.now() + 10 * 60000).toISOString(), locale: 'en' });
async function object() {
  const storage = new MemoryStorage(); let ready!: Promise<unknown>;
  const value = new JourneyNotifications({ storage, blockConcurrencyWhile: fn => { const result = fn(); ready = result; return result; } });
  await ready; return { value, storage };
}
async function subscription() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { endpoint: 'https://fcm.googleapis.com/fcm/send/test', expirationTime: null,
    keys: { p256dh: Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url'), auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url') } };
}
const request = (method: string, body?: unknown, headers?: Record<string, string>) => new Request('https://planner.example/api/notifications', { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Background boarding notifications', () => {
  it('allows only real push-service hosts and rejects endpoint SSRF', () => {
    expect(pushEndpointAllowed('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(pushEndpointAllowed('https://web.push.apple.com/token')).toBe(true);
    for (const endpoint of ['http://fcm.googleapis.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com.evil.example/x', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:444/x']) expect(pushEndpointAllowed(endpoint)).toBe(false);
  });
  it('validates the boarding window and reconstructs provider URLs from allowed fields', () => {
    expect(parseJourneyWatch(journey()).targets[0]).toMatchObject(target);
    expect(targetUrl(target)).toBe('https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/AA123');
    expect(() => parseJourneyWatch({ ...journey(), plannedTime: new Date(Date.now() + 3 * 3600_000).toISOString() })).toThrow();
    expect(() => targetUrl({ ...target, stop: '../private' })).toThrow();
    expect(() => parseJourneyWatch({ ...journey(), targets: [{ ...target, seq: -1 }] })).toThrow();
  });
  it('preserves independent live/scheduled and additional evidence while matching exact route/stop sequence', () => {
    const now = Date.now(), row = { route: '104', dir: 'O', seq: 1, eta: new Date(now + 5 * 60000).toISOString(), data_timestamp: new Date(now).toISOString() };
    const values = notificationPredictions(target, { data: [{ ...row, rmk_en: 'Additional Bus' }, { ...row, rmk_en: 'Additional Bus · Scheduled Bus' }, { ...row, seq: 2 }, { ...row, route: '106' }, { ...row, data_timestamp: new Date(now - 300_000).toISOString() }] }, now);
    expect(values).toHaveLength(2); expect(values[0]).toMatchObject({ extra: true, scheduled: false }); expect(values[1]).toMatchObject({ extra: true, scheduled: true });
    expect(notificationPredictions(target, { data: [] }, now)).toEqual([]);
  });
  it('matches MTR branch destinations and ignores stale rail feeds', () => {
    const now = Date.parse('2026-11-14T04:00:00Z');
    const payload = { status: 1, curr_time: '2026-11-14 12:00:00', data: { 'TWL-CSW': { DOWN: [{ dest: 'CEN', time: '2026-11-14 12:03:00' }, { dest: 'TSW', time: '2026-11-14 12:01:00' }] } } };
    const t: NotificationTarget = { provider: 'MTR', route: 'TWL', stop: 'CSW', destinations: ['CEN'] };
    expect(notificationPredictions(t, payload, now)).toHaveLength(1);
    expect(notificationPredictions(t, payload, now + 300_000)).toEqual([]);
  });
  it('creates a durable alarm and sends a real encrypted Web Push request, with private keys retained server-side', async () => {
    const send = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 201 })); vi.stubGlobal('fetch', send);
    const { value, storage } = await object();
    const config = await (await value.fetch(request('GET'))).json(); expect(config.publicKey).toHaveLength(87); expect(config.privateKey).toBeUndefined();
    const result = await value.fetch(request('POST', { journey: journey(), subscription: await subscription() }));
    expect(result.status).toBe(200); const active = await result.json(); expect(active.token).toHaveLength(43);
    const init = send.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get('Content-Encoding')).toBe('aes128gcm');
    expect(new Headers(init?.headers).get('Authorization')).toMatch(/^vapid /);
    expect(storage.alarm).toBeGreaterThan(Date.now()); expect((await storage.list({ prefix: 'watch:', limit: 20 })).size).toBe(1);
  });
  it('rejects a push-service refusal without showing the watch as enabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })));
    const { value, storage } = await object(); const result = await value.fetch(request('POST', { journey: journey(), subscription: await subscription() }));
    expect(result.status).toBe(502); expect(storage.alarm).toBeNull(); expect((await storage.list({ prefix: 'watch:', limit: 20 })).size).toBe(0);
  });
  it('requires the stop token and clears the alarm when the last watch stops', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 201 })));
    const { value, storage } = await object(); const active = await (await value.fetch(request('POST', { journey: journey(), subscription: await subscription() }))).json();
    expect((await value.fetch(request('DELETE', { id: active.id, token: 'wrong' }))).status).toBe(403);
    expect((await (await value.fetch(request('GET', undefined, { 'X-Watch-Id': active.id, 'X-Watch-Token': active.token }))).json()).active).toBe(true);
    expect((await value.fetch(request('DELETE', active))).status).toBe(200); expect(storage.alarm).toBeNull();
  });
  it('expires subscriptions and stops polling with no active boarding', async () => {
    const { value, storage } = await object();
    await storage.put('watch:expired', { expires: Date.now() - 1 });
    await value.alarm(); expect(storage.values.has('watch:expired')).toBe(false); expect(storage.alarm).toBeNull();
  });
  it('retries transient provider failure without losing the active watch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 201 })));
    const { value, storage } = await object(); await value.fetch(request('POST', { journey: journey(), subscription: await subscription() }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); })); await value.alarm();
    expect((await storage.list({ prefix: 'watch:', limit: 20 })).size).toBe(1); expect(storage.alarm).toBeGreaterThan(Date.now());
  });
});
