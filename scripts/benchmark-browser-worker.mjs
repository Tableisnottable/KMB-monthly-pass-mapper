import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

// Default: repeatable calculator timings, without provider/network delays.
// --live --origin=https://<your-preview> includes real provider proxy waits.
const live = process.argv.includes('--live');
const origin = process.argv.find(arg => arg.startsWith('--origin='))?.slice(9) ?? 'http://localhost:8791';
const only = process.argv.find(arg => arg.startsWith('--case='))?.slice(7);
const spacing = Number(process.argv.find(arg => arg.startsWith('--spacing-ms='))?.slice(13)) || 0;
const thread = new Worker(`
  const { parentPort, workerData } = require('node:worker_threads');
  globalThis.self = globalThis;
  globalThis.location = { origin: workerData.origin };
  const providers = { ok: 0, failed: 0, rateLimited: 0 };
  globalThis.postMessage = value => parentPort.postMessage({ ...value, providers: { ...providers } });
  const nativeFetch = fetch;
  globalThis.fetch = async (...args) => {
    try {
      const response = await nativeFetch(...args);
      if (response.ok) providers.ok++; else { providers.failed++; if (response.status === 429) providers.rateLimited++; }
      return response;
    } catch (error) { providers.failed++; throw error; }
  };
  if (!workerData.live) {
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    const WallClockDate = Date;
    globalThis.Date = class extends WallClockDate {
      constructor(...args) { super(...(args.length ? args : ['2026-11-13T04:00:00Z'])); }
    };
  }
  import(require('node:url').pathToFileURL(workerData.path).href).then(() => {
    parentPort.on('message', data => globalThis.onmessage({ data }));
    parentPort.postMessage({ ready: true });
  });
`, { eval: true, workerData: { path: resolve('public/__planner/transport.worker.js'), origin, live } });
let sequence = 0;
async function request(params) {
  const id = ++sequence, started = performance.now();
  const reply = once(thread, 'message');
  thread.postMessage({ id, url: origin + '/api/journey?' + params });
  const [message] = await reply;
  if (message.id !== id || message.error || message.status !== 200) throw new Error(message.error ?? message.body ?? 'Worker request failed');
  return { ...JSON.parse(message.body), providers: message.providers, wallMs: Math.round(performance.now() - started) };
}
const fixtures = [
  ['Cheung Sha Wan → Airport', [22.33882, 114.15387, 22.3157, 113.9363]],
  ['Cheung Sha Wan → Central', [22.33882, 114.15387, 22.2819, 114.1582]],
  ['Tsuen Wan → Sha Tin', [22.3738, 114.1177, 22.3819, 114.1871]],
  ['Tsim Sha Tsui → Mong Kok', [22.297, 114.172, 22.3192, 114.1693]],
  ['Airport → Cheung Sha Wan', [22.3157, 113.9363, 22.33882, 114.15387]],
];
try {
  await once(thread, 'message');
  const warm = await request(new URLSearchParams({ operation: 'warm' }));
  console.log(JSON.stringify({ mode: live ? 'live providers' : 'calculator only; providers unavailable', warmMs: warm.wallMs }));
  const results = [];
  for (const [name, coordinates] of fixtures) {
    if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
    const params = new URLSearchParams(Object.fromEntries(['fromLat', 'fromLon', 'toLat', 'toLon'].map((key, i) => [key, String(coordinates[i])])));
    params.set('timeMode', live ? 'now' : 'depart');
    if (!live) { params.set('time', '2026-11-14T12:00:00+08:00'); params.set('walkComparison', 'false'); }
    const started = performance.now();
    params.set('phase', 'preview');
    const preview = await request(params);
    params.delete('phase');
    const complete = await request(params);
    if (!complete.data?.length) throw new Error('No routes for fixture: ' + name);
    const result = { name, initialMs: preview.data.length ? preview.wallMs : Math.round(performance.now() - started),
      completeMs: Math.round(performance.now() - started), previewRoutes: preview.data.length, completeRoutes: complete.data.length,
      liveRoutes: complete.data.filter(row => row.legs.some(leg => leg.realtimeEta?.isLive)).length, providers: complete.providers };
    results.push(result); console.log(JSON.stringify(result));
    if (spacing && results.length < fixtures.length) await new Promise(resolve => setTimeout(resolve, spacing));
  }
  const averageInitialMs = Math.round(results.reduce((sum, row) => sum + row.initialMs, 0) / results.length);
  const averageCompleteMs = Math.round(results.reduce((sum, row) => sum + row.completeMs, 0) / results.length);
  console.log(JSON.stringify({ samples: results.length, averageInitialMs, averageCompleteMs,
    initialTargetMet: averageInitialMs <= 3000, completeTargetMet: averageCompleteMs <= 10000,
    note: 'Desktop worker measurements; repeat on target phones. Warm-up/download and map rendering are separate.' }));
} finally { await thread.terminate(); }
