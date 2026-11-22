import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fetchJson, main } from './fetch-kmb-route-stops.mjs';

const response = data => ({ ok: true, json: async () => ({ data }) });
const noDelay = async () => {};

test('retries a timed-out 110 inbound request and recovers', async () => {
  let attempts = 0;
  const delays = [];
  const result = await fetchJson('https://example.test/route-stop/110/inbound/1', {
    fetchImpl: async () => {
      if (++attempts === 1) throw new DOMException('This operation was aborted', 'AbortError');
      return response([{ seq: '1', stop: 'STOP' }]);
    },
    delay: async ms => { delays.push(ms); },
  });
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [500]);
  assert.equal(result.data[0].stop, 'STOP');
});

test('retries HTTP failures, invalid JSON and invalid data arrays', async () => {
  let attempts = 0;
  const result = await fetchJson('https://example.test', {
    fetchImpl: async () => {
      attempts++;
      if (attempts === 1) return { ok: false, status: 503 };
      if (attempts === 2) return { ok: true, json: async () => { throw new SyntaxError('Bad JSON'); } };
      if (attempts === 3) return { ok: true, json: async () => ({ data: null }) };
      return response([]); // A loop route may legitimately have no inbound stops.
    },
    delay: noDelay,
  });
  assert.deepEqual(result.data, []);
  assert.equal(attempts, 4);
});

test('bounds retries and retains the final error cause', async () => {
  const delays = [];
  let attempts = 0;
  await assert.rejects(fetchJson('https://example.test', {
    fetchImpl: async () => { attempts++; throw new Error('Offline'); },
    delay: async ms => { delays.push(ms); },
  }), error => /after 4 attempts/.test(error.message) && error.cause.message === 'Offline');
  assert.equal(attempts, 4);
  assert.deepEqual(delays, [500, 1000, 2000]);
});

test('keeps timeout active while reading the response body', async () => {
  let attempts = 0;
  await assert.rejects(fetchJson('https://example.test', {
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => {
      attempts++;
      return { ok: true, json: () => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }) };
    },
    delay: noDelay,
  }), /after 4 attempts/);
  assert.equal(attempts, 4);
});

for (const scenario of ['request failure', 'empty catalog', 'invalid stop sequence']) {
  test(`preserves previous snapshot on ${scenario}`, async t => {
    const directory = mkdtempSync(join(tmpdir(), 'kmb-fetch-test-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const outputPath = join(directory, 'snapshot.json');
    writeFileSync(outputPath, 'previous snapshot');
    await assert.rejects(main({ outputPath, log() {}, warn() {}, fetchData: async url => {
      if (url.endsWith('/route/')) return { data: scenario === 'empty catalog' ? [] : [{ route: '110' }] };
      if (scenario === 'request failure') throw new Error('Offline');
      return { data: [{ seq: 'invalid', stop: 'STOP' }] };
    } }));
    assert.equal(readFileSync(outputPath, 'utf8'), 'previous snapshot');
  });
}

test('writes a complete snapshot after a transient failure, retaining empty loop directions', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'kmb-fetch-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const outputPath = join(directory, 'snapshot.json');
  let failed = false;
  await main({ outputPath, log() {}, warn() {}, fetchData: url => fetchJson(url, {
    delay: noDelay,
    fetchImpl: async url => {
      if (url.endsWith('/route/')) return response([{ route: '110' }, { route: '110' }]);
      if (url.includes('/inbound/')) return response([]);
      if (!failed) { failed = true; throw new Error('Transient outage'); }
      return response([{ seq: '2', stop: 'B' }, { seq: '1', stop: 'A' }]);
    },
  }) });
  const output = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.equal(output.routes.length, 2);
  assert.deepEqual(output.routes[0].stops, [{ seq: 1, stop: 'A' }, { seq: 2, stop: 'B' }]);
  assert.deepEqual(output.routes[1].stops, []);
});
