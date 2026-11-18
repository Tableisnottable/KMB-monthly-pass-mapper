import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: unknown }) => void; onerror?: () => void;
  messages: { id: number; url: string; cancel?: boolean }[] = []; terminated = false;
  constructor(public url: string, public options?: WorkerOptions) { FakeWorker.instances.push(this); }
  postMessage(message: { id: number; url: string; cancel?: boolean }) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  reply(call = this.messages.length - 1, body: unknown = { data: [] }) { const message = this.messages[call]; this.onmessage?.({ data: { id: message.id, status: 200, headers: [['Content-Type', 'application/json']], body: JSON.stringify(body) } }); }
}
beforeEach(() => { vi.resetModules(); FakeWorker.instances = []; vi.stubGlobal('Worker', FakeWorker); vi.stubGlobal('window', { location: { origin: 'https://planner.example' }, setTimeout, clearTimeout }); });
afterEach(() => vi.unstubAllGlobals());
describe('Warm and cancellable background calculators', () => {
  it('reuses a completed journey worker instead of downloading and rebuilding its data again', async () => {
    const { transportFetch } = await import('./transportClient');
    const first = transportFetch('/api/journey?a=1'); FakeWorker.instances[0].reply(); expect((await first).status).toBe(200);
    const second = transportFetch('/api/journey?a=2'); FakeWorker.instances[0].reply(); await second;
    expect(FakeWorker.instances).toHaveLength(1); expect(FakeWorker.instances[0].terminated).toBe(false); expect(FakeWorker.instances[0].options?.type).toBe('module');
  });
  it('keeps place lookup separate and terminates cancelled journey computation', async () => {
    const { transportFetch } = await import('./transportClient'); const controller = new AbortController();
    const journey = transportFetch('/api/journey', { signal: controller.signal }); const rejected = expect(journey).rejects.toMatchObject({ name: 'AbortError' });
    const place = transportFetch('/api/places?q=Central'); FakeWorker.instances[1].reply(); await place;
    controller.abort(); await rejected; expect(FakeWorker.instances[0].terminated).toBe(true); expect(FakeWorker.instances[1].terminated).toBe(false);
    const retry = transportFetch('/api/journey'); FakeWorker.instances[2].reply(); await retry;
  });
  it('matches concurrent catalogue replies by request ID', async () => {
    const { transportFetch } = await import('./transportClient');
    const first = transportFetch('/api/network?resource=routes'), second = transportFetch('/api/places?q=airport');
    expect(FakeWorker.instances).toHaveLength(1);
    FakeWorker.instances[0].reply(1, { data: ['airport'] }); FakeWorker.instances[0].reply(0, { data: ['104'] });
    expect(await (await first).json()).toEqual({ data: ['104'] }); expect(await (await second).json()).toEqual({ data: ['airport'] });
  });
  it('can cancel a departure selection without interrupting the full journey search', async () => {
    const { transportFetch } = await import('./transportClient'); const controller = new AbortController();
    const journey = transportFetch('/api/journey');
    const selection = transportFetch('/api/journey?operation=retime', { signal: controller.signal });
    const rejected = expect(selection).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejected;
    expect(FakeWorker.instances[0].terminated).toBe(false);
    FakeWorker.instances[0].reply(); expect((await journey).status).toBe(200);
  });
  it('rejects failed loads and creates a fresh worker on retry', async () => {
    const { transportFetch } = await import('./transportClient');
    const first = transportFetch('/api/network?resource=routes'); const failed = expect(first).rejects.toThrow('Could not load');
    FakeWorker.instances[0].onerror?.(); await failed;
    const retry = transportFetch('/api/network?resource=routes'); expect(FakeWorker.instances).toHaveLength(2);
    FakeWorker.instances[1].reply(); await retry;
  });
});
