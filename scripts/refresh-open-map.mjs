// Refresh only the two small landing-area snapshots. Never download whole countries.
import { build } from 'esbuild';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const temp = await mkdtemp(join(tmpdir(), 'compass-open-map-'));
try {
  await build({ entryPoints: ['src/data/openMapProvider.ts'], outfile: join(temp, 'provider.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22' });
  const { openMapResponse } = await import(pathToFileURL(join(temp, 'provider.mjs')));
  await build({ entryPoints: ['src/domain/openMap.ts'], outfile: join(temp, 'parser.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22' });
  const { parseOpenMap } = await import(pathToFileURL(join(temp, 'parser.mjs')));
  await mkdir('public/open-data', { recursive: true });
  // Serialize requests to respect the public OSM API; snapshots are not live feeds.
  for (const [id, lat, lon] of [['taiwan', 25.0478, 121.517], ['japan', 35.6812, 139.7671]]) {
    const response = await openMapResponse(new Request(`http://localhost/api/open-map?region=${id}&lat=${lat}&lon=${lon}`));
    if (!response.ok) throw new Error(`Could not refresh ${id}: ${response.status}`);
    const raw = await response.json(), bounds = response.headers.get('X-Open-Map-Bounds').split(',').map(Number);
    const [s, w, n, e] = bounds;
    const data = parseOpenMap(raw.elements, bounds, `https://api.openstreetmap.org/api/0.6/map.json?bbox=${w},${s},${e},${n}`), json = JSON.stringify(data);
    if (Buffer.byteLength(json) > 500_000) throw new Error('Snapshot too large for source control');
    await writeFile(`public/open-data/${id}.json`, json + '\n');
    console.log(`${id}: ${data.roads.length} roads, ${data.routes.length} local route segments, ${data.stops.length} stops; ${Buffer.byteLength(json)} bytes`);
  }
} finally { await rm(temp, { recursive: true, force: true }); }
