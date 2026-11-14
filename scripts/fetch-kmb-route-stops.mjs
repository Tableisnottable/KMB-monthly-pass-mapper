import { writeFileSync } from 'node:fs';

const API = 'https://data.etabus.gov.hk/v1/transport/kmb';
const REQUEST_TIMEOUT_MS = 10000;
const CONCURRENCY = 6;

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
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

async function main() {
  const routePayload = await fetchJson(`${API}/route/`);
  const routes = [...new Set(routePayload.data.map((row) => row.route))].sort();
  const requests = routes.flatMap((route) =>
    ['outbound', 'inbound'].map((bound) => ({ route, bound })),
  );
  const fetched = await runPool(requests, async ({ route, bound }) => {
    try {
      const payload = await fetchJson(
        `${API}/route-stop/${encodeURIComponent(route)}/${bound}/1`,
      );
      const stops = payload.data.map((row) => ({
        seq: Number(row.seq),
        stop: row.stop,
      }));
      console.log(`fetched ${route} ${bound}: ${stops.length} stops`);
      return { route, bound, stops };
    } catch (error) {
      console.warn(`skip ${route} ${bound}: ${error.message}`);
      return null;
    }
  });

  const output = {
    generatedAt: new Date().toISOString(),
    routes: fetched.filter(Boolean),
  };
  if (fetched.some(row => row === null)) throw new Error('Incomplete KMB download; keeping the previous snapshot.');
  const json = JSON.stringify(output);
  if (Buffer.byteLength(json) >= 1_000_000) throw new Error('KMB snapshot exceeds the small-source-file limit.');
  writeFileSync(
    new URL('../src/data/kmbRouteStops.json', import.meta.url),
    json,
    'utf8',
  );
  console.log(
    `Wrote ${output.routes.length}/${requests.length} route-stop sequences to src/data/kmbRouteStops.json`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
