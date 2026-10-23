import { writeFileSync } from 'node:fs';

const CROSS_HARBOUR_ROUTES = ['970', '973', '101', '104', '111', '113', '170', '182'];
const API = 'https://rt.data.gov.hk/v2/transport/citybus';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const routes = [];
  for (const route of CROSS_HARBOUR_ROUTES) {
    for (const bound of ['outbound', 'inbound']) {
      try {
        const payload = await fetchJson(`${API}/route-stop/CTB/${route}/${bound}`);
        const stops = payload.data.map((row) => ({ seq: Number(row.seq), stop: row.stop }));
        routes.push({ route, bound, stops });
        console.log(`fetched ${route} ${bound}: ${stops.length} stops`);
      } catch (e) {
        console.log(`skip ${route} ${bound}: ${e.message}`);
      }
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    routes,
  };
  writeFileSync(
    new URL('../src/data/citybusRouteStops.json', import.meta.url),
    JSON.stringify(output, null, 2),
    'utf8',
  );
  console.log(`Wrote ${routes.length} route-stop sequences to src/data/citybusRouteStops.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
