import chunk0 from './places/schools-0.json';
import chunk1 from './places/schools-1.json';
import chunk2 from './places/schools-2.json';
import chunk3 from './places/schools-3.json';
import metadata from './places/schools-manifest.json';

type School = [string, string, string, string, string, number, number];
export const schoolPlacesMeta = metadata;
const compact = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const words = (text: string) => text.normalize('NFKC').toLowerCase().replace(/['’]s\b/g, '').replace(/[-‐‑]/g, '').match(/[a-z0-9]+/g) ?? [];
const schools = ([...chunk0, ...chunk1, ...chunk2, ...chunk3] as School[]).map(row => {
  const tokens = words(row[2]);
  const initials = [tokens.map(word => word[0]).join(''), tokens.filter(word => !['the', 'of', 'and'].includes(word)).map(word => word[0]).join('')];
  return { row, zh: compact(row[1]), en: compact(row[2]), address: compact(row[3] + row[4]), tokens, initials };
});

/** Initials are lookup aliases only. Keep ambiguous campuses as separate choices. */
export function findSchoolPlaces(query: string) {
  const needle = compact(query), queryWords = words(query);
  if (needle.length < 2) return { exact: false, places: [] };
  const matches = schools.map(school => {
    let score = Infinity;
    if (school.zh === needle || school.en === needle) score = 0;
    else if (needle.length >= 3 && school.initials.includes(needle)) score = 1;
    else if (school.zh.includes(needle) || school.en.includes(needle)) score = 10;
    else if (queryWords.length >= 2 && queryWords.every(word => school.tokens.some(token => token.startsWith(word)))) score = 15;
    else if (/^[a-z]{4,}$/.test(needle) && school.initials.some(alias => alias.startsWith(needle))) score = 20;
    else if (needle.length >= 4 && school.address.includes(needle)) score = 30;
    return { school, score };
  }).filter(match => Number.isFinite(match.score)).sort((a, b) => a.score - b.score || a.school.row[2].localeCompare(b.school.row[2]) || a.school.row[0].localeCompare(b.school.row[0]));
  const exact = matches.some(match => match.score < 2);
  return { exact, places: matches.filter(match => !exact || match.score < 2).slice(0, 6).map(({ school: { row } }) => ({
    id: 'edb-school:' + row[0], name: row[1] + ' ' + row[2],
    address: row[3] + ' · ' + row[4] + ' · 教育局 Education Bureau',
    lat: row[5], lng: row[6], type: 'school',
    googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(row[5] + ',' + row[6]),
  })) };
}
