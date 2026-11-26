"""Extract searchable Macau landmarks from the external Geofabrik/OSM cache.

Usage: python scripts/import-macau-places.py --cache <external cache directory>
Run import-macau-rail.py first to download the extract. Raw PBF stays outside Git.
OSM names and polygon centres are search suggestions, not entrance guarantees.
"""
import argparse
import json
from pathlib import Path
import osmium

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cache', type=Path, required=True)
args = parser.parse_args()
rows = []


class Reader(osmium.SimpleHandler):
    def add(self, kind, obj, lat, lng):
        tags = dict(obj.tags)
        if not (22.09 <= lat <= 22.24 and 113.51 <= lng <= 113.62):
            return
        zh = tags.get('name:zh-Hant', tags.get('name:zh', tags.get('name', '')))
        en = tags.get('name:en', tags.get('name:pt', tags.get('name', '')))
        if not zh or not any(key in tags for key in ['tourism', 'amenity', 'shop', 'leisure', 'place', 'aeroway', 'historic']):
            return
        if tags.get('amenity') in ['bench', 'waste_basket', 'toilets', 'parking_space', 'bicycle_parking']:
            return
        rows.append([f'OSM:{kind}:{obj.id}', zh, en, round(lat, 6), round(lng, 6),
                     tags.get('tourism', tags.get('amenity', tags.get('shop', tags.get('place', 'landmark'))))])

    def node(self, node):
        self.add('node', node, node.location.lat, node.location.lon)

    def way(self, way):
        nodes = list(way.nodes)
        if nodes:
            self.add('way', way, sum(n.lat for n in nodes) / len(nodes), sum(n.lon for n in nodes) / len(nodes))


reader = Reader()
reader.apply_file(str(args.cache / 'macau-latest.osm.pbf'), locations=True)
target = Path(__file__).resolve().parents[1] / 'src/data/macau/places.json'
target.write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'Imported {len(rows)} OSM place suggestions ({target.stat().st_size} bytes).')
