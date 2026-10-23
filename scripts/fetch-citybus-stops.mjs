import { writeFileSync } from 'node:fs';

const CROSS_HARBOUR_ROUTES = ['970', '973', '101', '104', '111', '113', '170', '182'];
const API = 'https://rt.data.gov.hk/v2/transport/citybus';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const stopIds = new Set();
  for (const route of CROSS_HARBOUR_ROUTES) {
    for (const bound of ['outbound', 'inbound']) {
      try {
        const payload = await fetchJson(`${API}/route-stop/CTB/${route}/${bound}`);
        for (const row of payload.data) stopIds.add(row.stop);
      } catch (e) {
        console.log(`skip ${route} ${bound}: ${e.message}`);
      }
    }
  }
  console.log(`Collected ${stopIds.size} unique stop IDs`);

  const stops = [];
  const list = Array.from(stopIds);
  for (let i = 0; i < list.length; i += 12) {
    const batch = list.slice(i, i + 12);
    const results = await Promise.allSettled(
      batch.map((id) => fetchJson(`${API}/stop/${id}`).then((p) => p.data)),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value && r.value.stop) {
        stops.push({
          stop: r.value.stop,
          name_tc: r.value.name_tc,
          name_en: r.value.name_en,
          lat: r.value.lat,
          long: r.value.long,
        });
      }
    }
    console.log(`progress: ${Math.min(i + 12, list.length)}/${list.length}`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    routes: CROSS_HARBOUR_ROUTES,
    count: stops.length,
    stops,
  };
  writeFileSync(
    new URL('../src/data/citybusStops.json', import.meta.url),
    JSON.stringify(output, null, 2),
    'utf8',
  );
  console.log(`Wrote ${stops.length} stops to src/data/citybusStops.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
