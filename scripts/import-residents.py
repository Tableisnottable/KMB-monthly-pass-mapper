"""Import the TD approved NR/HR/KR directory; leave PDFs outside Git.

Usage: python scripts/import-residents.py --cache <outside-repository-directory>
The documents remain the authority for fares, conditions and schedules. This
directory deliberately does not invent stop coordinates or GTFS calendars.
"""
import argparse
import datetime
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://www.td.gov.hk'


class DirectoryParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.records = []
        self.cells = None
        self.cell = None
        self.links = []
        self.link = None
        self.district = ''

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'tr':
            self.cells = []
        elif tag in ('td', 'th') and self.cells is not None:
            self.cell, self.links = [], []
        elif tag == 'a' and self.cell is not None:
            self.link = {'url': attrs.get('href', ''), 'text': ''}
        elif tag == 'br' and self.cell is not None:
            self.cell.append(' ')

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)
        if self.link is not None:
            self.link['text'] += data

    def handle_endtag(self, tag):
        if tag == 'a' and self.link is not None:
            self.links.append(self.link)
            self.link = None
        elif tag in ('td', 'th') and self.cell is not None:
            self.cells.append((' '.join(''.join(self.cell).split()), self.links))
            self.cell = None
        elif tag == 'tr' and self.cells is not None:
            if len(self.cells) == 1:
                self.district = self.cells[0][0]
            elif len(self.cells) == 2:
                for link in self.cells[0][1]:
                    number = re.sub(r'\s+', '', link['text']).upper()
                    if re.fullmatch(r'(?:NR|HR|KR)\d+[A-Z]?', number):
                        url = urllib.parse.urljoin(BASE, link['url'])
                        assert urllib.parse.urlsplit(url).hostname == 'www.td.gov.hk' and url.lower().endswith('.pdf')
                        self.records.append({'number': number, 'name': self.cells[1][0],
                                             'district': self.district, 'documentUrl': url})
            self.cells = None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    cache = args.cache.resolve()
    if cache == ROOT or ROOT in cache.parents:
        raise ValueError('Raw cache must be outside the repository')
    cache.mkdir(parents=True, exist_ok=True)
    records, sources = {}, []
    for area in ['hk', 'kln', 'nt']:
        for lang in ['en', 'tc']:
            url = BASE + f'/{lang}/transport_in_hong_kong/public_transport/non_franchised/list_of_approved_rs_{area}/index.html'
            target = cache / f'nr-{lang}-{area}.html'
            if args.refresh or not target.exists():
                target.write_bytes(urllib.request.urlopen(url, timeout=30).read())
            text = target.read_text('utf-8-sig')
            page = DirectoryParser()
            page.feed(text)
            if not page.records:
                raise ValueError('No residents routes parsed: ' + url)
            updated = re.search(r'<meta name="date" content="([^"]+)"', text)
            sources.append({'url': url, 'updatedAt': updated.group(1) if updated else None})
            for item in page.records:
                entry = records.setdefault(item['number'], {'id': 'residents:' + item['number'], 'number': item['number'], 'area': area})
                key = 'En' if lang == 'en' else 'Tc'
                for field in ['name', 'district', 'documentUrl']:
                    entry[field + key] = item[field]
                entry['sourceUrl' + key] = url
    for row in records.values():
        if not all(row.get(field + lang) for field in ['name', 'documentUrl'] for lang in ['En', 'Tc']):
            raise ValueError('Incomplete bilingual route: ' + row['number'])
    result = {'importedOn': datetime.date.today().isoformat(), 'sources': sources,
              'routes': sorted(records.values(), key=lambda r: (r['number'][:2], int(re.search(r'\d+', r['number'])[0]), r['number']))}
    (ROOT / 'src/data/residentsDirectory.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf-8')
    print(json.dumps({'count': len(records), 'prefixes': {prefix: sum(n.startswith(prefix) for n in records) for prefix in ['NR', 'HR', 'KR']}}))


if __name__ == '__main__':
    main()
