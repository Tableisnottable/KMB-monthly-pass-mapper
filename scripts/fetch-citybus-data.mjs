import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const API = 'https://rt.data.gov.hk/v2/transport/citybus';
const CONCURRENCY = 6;
const MAX_FILE_BYTES = 1_000_000;
const outputArg = process.argv.indexOf('--output-dir');
const outputDir = outputArg >= 0
  ? resolve(process.argv[outputArg + 1])
  : fileURLToPath(new URL('../src/data/', import.meta.url));

async function fetchData(path) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(API + path, {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`);
      const payload = await response.json();
      if (!payload || !('data' in payload)) throw new Error(`Missing data for ${path}`);
      return payload.data;
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}

async function mapPool(items, worker, label) {
  const results = new Array(items.length);
  let next = 0;
  let completed = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
      completed++;
      if (completed % 100 === 0 || completed === items.length) {
        console.log(`${label}: ${completed}/${items.length}`);
      }
    }
  }));
  return results;
}

async function main() {
  const catalog = await fetchData('/route/CTB');
  if (!Array.isArray(catalog) || catalog.length === 0) throw new Error('Empty route catalog');
  const routeNumbers = [...new Set(catalog.map(row => row.route))].sort();
  const requests = routeNumbers.flatMap(route =>
    ['outbound', 'inbound'].map(bound => ({ route, bound })),
  );
  const routes = await mapPool(requests, async ({ route, bound }) => {
    const rows = await fetchData(`/route-stop/CTB/${encodeURIComponent(route)}/${bound}`);
    if (!Array.isArray(rows)) throw new Error(`Invalid route-stop data: ${route} ${bound}`);
    const stops = rows.map(row => ({ seq: Number(row.seq), stop: row.stop }))
      .sort((a, b) => a.seq - b.seq);
    if (stops.some(row => !Number.isFinite(row.seq) || !row.stop)) {
      throw new Error(`Invalid stop sequence: ${route} ${bound}`);
    }
    return { route, bound, stops };
  }, 'Route directions');

  const ids = [...new Set(routes.flatMap(route => route.stops.map(row => row.stop)))].sort();
  const stops = await mapPool(ids, async id => {
    const stop = await fetchData(`/stop/${encodeURIComponent(id)}`);
    if (stop?.stop !== id || !Number.isFinite(Number(stop.lat)) || !Number.isFinite(Number(stop.long))) {
      throw new Error(`Invalid coordinates for stop ${id}`);
    }
    return {
      stop: stop.stop, name_tc: stop.name_tc, name_en: stop.name_en,
      lat: String(stop.lat), long: String(stop.long),
    };
  }, 'Stop coordinates');

  const generatedAt = new Date().toISOString();
  const files = [
    ['citybusRouteStops.json', { generatedAt, routes }],
    ['citybusStops.json', { generatedAt, routes: routeNumbers, count: stops.length, stops }],
  ].map(([name, value]) => ({ name, text: JSON.stringify(value) + '\n' }));
  // Validate the complete snapshot before replacing either catalog. Do not
  // silently publish incomplete coverage or accidentally commit a large file.
  for (const file of files) {
    if (Buffer.byteLength(file.text) > MAX_FILE_BYTES) throw new Error(`${file.name} exceeds 1 MB`);
  }
  await mkdir(outputDir, { recursive: true });
  for (const file of files) {
    await writeFile(join(outputDir, file.name), file.text, 'utf8');
    console.log(`Wrote ${file.name}: ${Buffer.byteLength(file.text)} bytes`);
  }
  console.log(`Complete snapshot: ${routeNumbers.length} routes, ${stops.length} stops`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
