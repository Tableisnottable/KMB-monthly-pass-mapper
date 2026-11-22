import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

// Measures the actual shipped worker without variable ETA/network latency.
// These fixtures use the snapshot's service calendar, not today's live service.
const thread = new Worker(`
  const { parentPort, workerData } = require('node:worker_threads');
  globalThis.self = globalThis;
  globalThis.location = { origin: 'http://localhost:8787' };
  globalThis.postMessage = value => parentPort.postMessage(value);
  const WallClockDate = Date;
  globalThis.Date = class extends WallClockDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-13T04:00:00Z'])); }
  };
  globalThis.fetch = async () => new Response('{}', { status: 503 });
  import(require('node:url').pathToFileURL(workerData).href).then(() => {
    parentPort.on('message', data => globalThis.onmessage({ data }));
    parentPort.postMessage({ ready: true });
  });
`, { eval: true, workerData: resolve('public/__planner/transport.worker.js') });
let sequence = 0;
const runCount = Math.max(1, Math.min(100, Number(process.argv.find(arg => arg.startsWith('--runs='))?.split('=')[1]) || 3));
const timings = [];
async function request(path) {
  const id = ++sequence, started = performance.now(), reply = once(thread, 'message');
  thread.postMessage({ id, url: 'http://localhost:8787' + path });
  const [data] = await reply;
  if (data.error || data.status !== 200) throw new Error(data.error || data.body);
  return { elapsed: performance.now() - started, result: JSON.parse(data.body) };
}
try {
  await once(thread, 'message');
  const warm = await request('/api/journey?operation=warm');
  console.log(`Cold handler/data load: ${warm.elapsed.toFixed(1)} ms`);
  for (const [name, toLat, toLon, extra] of [
    ['Airport', '22.31367', '113.93763', {}],
    ['Cross-harbour', '22.2819', '114.1582', {}],
    ['Rail only', '22.2819', '114.1582', { modes: 'SUBWAY', operators: 'MTR' }],
  ]) {
    const params = new URLSearchParams({ fromLat: '22.33882', fromLon: '114.15387', toLat, toLon,
      timeMode: 'depart', time: '2026-11-14T10:00:00+08:00', phase: 'preview', ...extra });
    for (let run = 0; run < runCount; run++) {
      if (process.argv.includes('--uncached')) params.set('_benchmarkSample', String(run));
      const { elapsed, result } = await request('/api/journey?' + params);
      if (!result.data.length) throw new Error(`${name}: no first results`);
      timings.push(elapsed);
      if (runCount <= 5) console.log(`${name} ${run ? 'repeat' : 'first'}: ${elapsed.toFixed(1)} ms, ${result.data.length} results`);
    }
    if (process.argv.includes('--complete')) {
      params.delete('phase'); params.set('walkComparison', 'false');
      const { elapsed, result } = await request('/api/journey?' + params);
      console.log(`${name} complete: ${elapsed.toFixed(1)} ms, ${result.data.length} results`);
    }
  }
  timings.sort((a, b) => a - b);
  console.log(`Preview samples: ${timings.length}; mean ${(timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(1)} ms; p95 ${timings[Math.ceil(timings.length * .95) - 1].toFixed(1)} ms; max ${timings.at(-1).toFixed(1)} ms; ${process.argv.includes('--uncached') ? 'response cache bypassed' : 'response cache enabled'}`);
} finally { await thread.terminate(); }
