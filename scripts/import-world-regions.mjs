import { readFile, writeFile } from 'node:fs/promises';
// Public country metadata, ODbL 1.0. Fetch only during this explicit import.
const source = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';
const response = process.argv[2] ? undefined : await fetch(source);
if (response && !response.ok) throw new Error(`Country metadata request failed (${response.status})`);
const countries = process.argv[2] ? JSON.parse(await readFile(process.argv[2], 'utf8')) : await response.json();
const names = new Intl.DisplayNames(['zh-Hant'], { type: 'region' });
const groups = { Europe: 'europe', Africa: 'africa', Americas: 'americas', Oceania: 'oceania', Antarctic: 'antarctic', Asia: 'west' };
// UN observer states are explicit because the source flags Vatican City as a member.
// https://www.un.org/en/about-us/member-states
// https://www.un.org/en/about-us/non-member-states
const observers = new Set(['VA', 'PS']);
const rows = countries.map(c => ({
  code: c.cca2, zh: names.of(c.cca2) || c.translations.zho.common, en: c.name.common,
  group: groups[c.region] || 'antarctic', lat: c.latlng[0], lon: c.latlng[1],
  unStatus: observers.has(c.cca2) ? 'observer' : c.unMember === true ? 'member' : 'other',
})).sort((a, b) => a.en.localeCompare(b.en));
const members = rows.filter(c => c.unStatus === 'member');
const observerStates = rows.filter(c => c.unStatus === 'observer');
if (members.length !== 193 || observerStates.length !== 2 || new Set(rows.map(c => c.code)).size !== rows.length) {
  throw new Error('Country metadata must contain 193 UN members, two observers and unique country codes');
}
await writeFile(new URL('../src/domain/worldRegions.json', import.meta.url), JSON.stringify(rows) + '\n');
console.log(`Imported ${rows.length} countries and territories from ${source}`);
