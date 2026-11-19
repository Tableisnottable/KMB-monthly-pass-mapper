import { readFile, writeFile } from 'node:fs/promises';
// Public country metadata, ODbL 1.0. Fetch only during this explicit import.
const source = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';
const countries = process.argv[2] ? JSON.parse(await readFile(process.argv[2], 'utf8')) : await (await fetch(source)).json();
const names = new Intl.DisplayNames(['zh-Hant'], { type: 'region' });
const groups = { Europe: 'europe', Africa: 'africa', Americas: 'americas', Oceania: 'oceania', Antarctic: 'antarctic', Asia: 'west' };
const rows = countries.map(c => ({ code: c.cca2, zh: names.of(c.cca2) || c.translations.zho.common, en: c.name.common, group: groups[c.region] || 'antarctic', lat: c.latlng[0], lon: c.latlng[1] })).sort((a, b) => a.en.localeCompare(b.en));
await writeFile(new URL('../src/domain/worldRegions.json', import.meta.url), JSON.stringify(rows) + '\n');
console.log(`Imported ${rows.length} countries and territories from ${source}`);
