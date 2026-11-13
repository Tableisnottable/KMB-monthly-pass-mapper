import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
class TestWorker {
  static instances: TestWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { TestWorker.instances.push(this); }
  reply(call = 0, body: unknown = { data: [] }) {
    const { id } = this.postMessage.mock.calls[call][0];
    this.onmessage?.({ data: { id, status: 200, headers: [['Content-Type', 'application/json']], body: JSON.stringify(body) } });
  }
}
beforeEach(() => {
  vi.resetModules(); TestWorker.instances = [];
  vi.stubGlobal('Worker', TestWorker);
  vi.stubGlobal('window', { location: { origin: 'https://planner.example' }, setTimeout, clearTimeout });
});
afterEach(() => vi.unstubAllGlobals());
describe('Browser transport request lifecycle', () => {
  it('returns fetch-compatible responses and releases a completed journey worker', async () => {
    const { transportFetch } = await import('./transportClient');
    const promise = transportFetch('/api/journey?fromLat=22.3');
    const worker = TestWorker.instances[0]; worker.reply();
    const response = await promise;
    expect(response.ok).toBe(true); expect(await response.json()).toEqual({ data: [] });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('cancels expensive searches without stopping catalogue queries', async () => {
    const { transportFetch } = await import('./transportClient');
    const catalogue = transportFetch('/api/network?resource=routes');
    const controller = new AbortController();
    const journey = transportFetch('/api/journey?fromLat=22.3', { signal: controller.signal });
    const aborted = expect(journey).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await aborted;
    expect(TestWorker.instances[1].terminate).toHaveBeenCalledOnce();
    expect(TestWorker.instances[0].terminate).not.toHaveBeenCalled();
    TestWorker.instances[0].reply(); await catalogue;
  });
  it('matches concurrent catalogue replies by request ID', async () => {
    const { transportFetch } = await import('./transportClient');
    const first = transportFetch('/api/network?resource=routes');
    const second = transportFetch('/api/places?q=airport');
    expect(TestWorker.instances).toHaveLength(1);
    TestWorker.instances[0].reply(1, { data: ['airport'] });
    TestWorker.instances[0].reply(0, { data: ['104'] });
    expect(await (await first).json()).toEqual({ data: ['104'] });
    expect(await (await second).json()).toEqual({ data: ['airport'] });
  });
  it('rejects failed loads and creates a fresh worker on retry', async () => {
    const { transportFetch } = await import('./transportClient');
    const first = transportFetch('/api/network?resource=routes');
    const failed = expect(first).rejects.toThrow('Could not load');
    TestWorker.instances[0].onerror?.(); await failed;
    const retry = transportFetch('/api/network?resource=routes');
    expect(TestWorker.instances).toHaveLength(2);
    TestWorker.instances[1].reply(); await retry;
  });
});
