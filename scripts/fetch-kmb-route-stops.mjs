import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const API = 'https://data.etabus.gov.hk/v1/transport/kmb';
const REQUEST_TIMEOUT_MS = 15000;
const CONCURRENCY = 6;

export async function fetchJson(url, {
  fetchImpl = fetch,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // Keep the timeout active while reading and validating the response body.
      const payload = await response.json();
      if (!Array.isArray(payload?.data)) throw new Error('Invalid KMB data array');
      return payload;
    } catch (error) {
      if (attempt >= 3) throw new Error(`KMB request failed after 4 attempts: ${url}`, { cause: error });
    } finally {
      clearTimeout(timeout);
    }
    await delay(500 * 2 ** attempt);
  }
}

async function runPool(items, worker) {
  const results = [];
  let nextIndex = 0;
  async function consume() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, consume));
  return results;
}

export async function main({
  fetchData = fetchJson,
  outputPath = new URL('../src/data/kmbRouteStops/manifest.json', import.meta.url),
  log = console.log,
  warn = console.warn,
} = {}) {
  const routePayload = await fetchData(`${API}/route/`);
  if (!Array.isArray(routePayload?.data) || routePayload.data.length === 0
    || routePayload.data.some(row => typeof row?.route !== 'string' || !row.route.trim())) {
    throw new Error('Invalid or empty KMB route catalog; keeping the previous snapshot.');
  }
  const routes = [...new Set(routePayload.data.map((row) => row.route))].sort();
  const requests = routes.flatMap((route) =>
    ['outbound', 'inbound'].map((bound) => ({ route, bound })),
  );
  const fetched = await runPool(requests, async ({ route, bound }) => {
    try {
      const payload = await fetchData(
        `${API}/route-stop/${encodeURIComponent(route)}/${bound}/1`,
      );
      if (!Array.isArray(payload?.data)) throw new Error('Invalid KMB stop array');
      const stops = payload.data.map((row) => ({
        seq: Number(row.seq),
        stop: row.stop,
      })).sort((a, b) => a.seq - b.seq);
      if (stops.some((row, index) => !Number.isInteger(row.seq) || row.seq <= 0
        || typeof row.stop !== 'string' || !row.stop.trim()
        || (index > 0 && row.seq <= stops[index - 1].seq))) {
        throw new Error('Invalid KMB stop sequence');
      }
      log(`fetched ${route} ${bound}: ${stops.length} stops`);
      return { route, bound, stops };
    } catch (error) {
      warn(`skip ${route} ${bound}: ${error.message}`);
      return null;
    }
  });

  const output = {
    generatedAt: new Date().toISOString(),
    routes: fetched.filter(Boolean),
  };
  if (fetched.some(row => row === null)) throw new Error('Incomplete KMB download; keeping the previous snapshot.');
  writeSnapshot(output, outputPath);
  log(
    `Wrote ${output.routes.length}/${requests.length} route-stop sequences in four small source files`,
  );
}

export function writeSnapshot(output, outputPath) {
  const target = outputPath instanceof URL ? outputPath : pathToFileURL(resolve(outputPath));
  const files = Array.from({ length: 4 }, (_, index) => {
    const routes = output.routes.filter((_row, position) => position % 4 === index);
    return { name: `routes-${index}.json`, text: JSON.stringify({ generatedAt: output.generatedAt, routes }) };
  });
  // Validate every part before touching any previous snapshot.
  if (files.some(file => Buffer.byteLength(file.text) >= 1_000_000)) {
    throw new Error('KMB snapshot part exceeds the small-source-file limit.');
  }
  mkdirSync(new URL('.', target), { recursive: true });
  for (const file of files) writeFileSync(new URL(file.name, target), file.text, 'utf8');
  writeFileSync(target, JSON.stringify({ generatedAt: output.generatedAt, count: output.routes.length,
    files: files.map(file => file.name) }), 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
