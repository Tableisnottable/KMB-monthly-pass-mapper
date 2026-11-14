"""Import Macau LRT station coordinates and actual track paths from OSM.

Topology, operating windows and fare bands are checked against MLM's official
route, general-ticket and concessionary-ticket pages. Requires Python osmium.
The raw 3 MB Geofabrik extract is kept in --cache, outside the repository.
"""
import argparse
import heapq
import json
import math
from pathlib import Path
import urllib.request
import osmium

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://download.geofabrik.de/asia/china/macau-latest.osm.pbf'


def distance(a, b):
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 111.2 * math.cos(lat))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    source = args.cache / 'macau-latest.osm.pbf'
    if not source.exists():
        urllib.request.urlretrieve(SOURCE, source)

    class Reader(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.stations, self.adjacent, self.points = {}, {}, {}

        def node(self, node):
            if node.tags.get('light_rail') != 'yes' or node.tags.get('railway') not in ['station', 'halt', 'stop']:
                return
            name = node.tags.get('name:en', '')
            if not name:
                return
            name = name.removesuffix(' Station')
            row = [name, node.tags.get('name:zh-Hant', node.tags.get('name:zh', name)), name,
                   round(node.location.lat, 6), round(node.location.lon, 6), False]
            if name not in self.stations or node.tags.get('railway') == 'station':
                self.stations[name] = row

        def way(self, way):
            if way.tags.get('railway') != 'light_rail' or way.tags.get('service') in ['yard', 'siding', 'spur']:
                return
            nodes = [(n.ref, [round(n.lat, 6), round(n.lon, 6)]) for n in way.nodes]
            for key, point in nodes:
                self.points[key] = point
            for (a, pa), (b, pb) in zip(nodes, nodes[1:]):
                d = distance(pa, pb)
                self.adjacent.setdefault(a, []).append((b, d))
                self.adjacent.setdefault(b, []).append((a, d))

    reader = Reader()
    reader.apply_file(str(source), locations=True)

    def track(a, b):
        # Interchange station centroids sit between disconnected line platforms.
        # Consider multiple track endpoints, without adding links across gaps.
        near = lambda p: sorted(((distance(p, point), key) for key, point in reader.points.items()))[:64]
        starts, ends = near(a), dict((key, d) for d, key in near(b) if d <= .3)
        heap, costs, previous = [], {}, {}
        for d, key in starts:
            if d <= .3:
                costs[key] = d * 5
                heapq.heappush(heap, (d * 5, key))
        best, finish = float('inf'), None
        while heap:
            cost, node = heapq.heappop(heap)
            if cost > best:
                break
            if cost != costs.get(node):
                continue
            if node in ends and cost + ends[node] * 5 < best:
                best, finish = cost + ends[node] * 5, node
            for nxt, d in reader.adjacent.get(node, []):
                if cost + d < costs.get(nxt, float('inf')):
                    costs[nxt] = cost + d
                    previous[nxt] = node
                    heapq.heappush(heap, (cost + d, nxt))
        if finish is None:
            return []
        path = [reader.points[finish]]
        while finish in previous:
            finish = previous[finish]
            path.append(reader.points[finish])
        return list(reversed(path))

    lines = [
        ('TAIPA', '氹仔線', 'Taipa Line', ['Barra', 'Ocean', 'Jockey Club', 'Stadium', 'Pai Kok', 'Cotai West', 'Lotus', 'Union Hospital', 'East Asian Games', 'Cotai East', 'MUST', 'Airport', 'Taipa Ferry Terminal']),
        ('SPV', '石排灣線', 'Seac Pai Van Line', ['Union Hospital', 'Seac Pai Van']),
        ('HENGQIN', '橫琴線', 'Hengqin Line', ['Lotus', 'Hengqin']),
    ]
    patterns = []
    for code, zh, en, names in lines:
        rows = [reader.stations[name] for name in names]
        rows = [[f'LRT:{row[0].replace(" ", "-").upper()}', *row[1:]] for row in rows]
        paths = [track(a[3:5], b[3:5]) for a, b in zip(rows, rows[1:])]
        if any(len(path) < 2 for path in paths):
            raise ValueError(f'Missing connected OSM track for {en}')
        for direction in ['0', '1']:
            patterns.append({'id': f'MO:LRT:{code}:{direction}', 'number': code, 'nameTc': zh, 'nameEn': en,
                             'operator': 'MO_LRT', 'mode': 'LIGHT_RAIL', 'direction': direction,
                             'stops': rows if direction == '0' else list(reversed(rows)),
                             'paths': paths if direction == '0' else [list(reversed(p)) for p in reversed(paths)],
                             'scheduleVerified': True, 'headwayRange': [5, 10.5] if code == 'TAIPA' else [6, 6]})
    target = ROOT / 'src/data/macau'
    target.mkdir(parents=True, exist_ok=True)
    (target / 'rail.json').write_text(json.dumps(patterns, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
    print(f'Imported {len(reader.stations)} named LRT stations; {len(patterns)} directional patterns with connected track geometry.')


if __name__ == '__main__':
    main()
