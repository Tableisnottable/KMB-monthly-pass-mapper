"""Import official HK transport snapshots. Python 3 + pyproj (rail coordinates).

Usage: python scripts/import-transport.py --cache <outside-repository-directory>
Raw archives and location-search responses stay in that directory. Published
JSON is deterministic, split below 900 KB, and includes source attribution.
"""
import argparse
import collections
import csv
import datetime
import html
import io
import json
import math
from pathlib import Path
import re
import statistics
import time
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'td-gtfs-en.zip': 'https://static.data.gov.hk/td/pt-headway-en/gtfs.zip',
    'td-gtfs-tc.zip': 'https://static.data.gov.hk/td/pt-headway-tc/gtfs.zip',
    'mtr-lines.csv': 'https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv',
    'light-rail.csv': 'https://opendata.mtr.com.hk/data/light_rail_routes_and_stops.csv',
    'mtr-fares.csv': 'https://opendata.mtr.com.hk/data/mtr_lines_fares.csv',
}
LOCATION_API = 'https://www.map.gov.hk/gs/api/v1.0.0/locationSearch'

def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')

def clean(value):
    value = html.unescape(value.split('|')[0])
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]*>|\[[^]]*\]', '', value)).strip()

def rows(archive, name):
    return csv.DictReader(io.TextIOWrapper(archive.open(name), encoding='utf-8-sig'))

def minute(value):
    h, m, s = map(int, value.split(':'))
    return h * 60 + m + s / 60

def distance(a, b):
    x = math.radians(b[3] - a[3]); y = math.radians(b[4] - a[4])
    k = math.sin(x / 2)**2 + math.cos(math.radians(a[3])) * math.cos(math.radians(b[3])) * math.sin(y / 2)**2
    return 12742 * math.asin(min(1, math.sqrt(k)))

def rail_coordinates(cache, rail_rows, light_rows):
    # Import dependencies from the external cache if installed there.
    import sys
    sys.path.insert(0, str(cache / 'python-libs'))
    from pyproj import Transformer
    transform = Transformer.from_crs(2326, 4326, always_xy=True)
    target = cache / 'rail-coordinates.json'
    coords = json.loads(target.read_text('utf-8')) if target.exists() else {}
    requests = cache / 'location-responses'
    requests.mkdir(exist_ok=True)
    names = {}
    for prefix, records in [('mtr', rail_rows), ('lrt', light_rows)]:
        for r in records:
            key = prefix + ':' + r.get('Station ID', r.get('Stop ID'))
            names[key] = (r['Chinese Name'], r['English Name'], prefix)
    for key, (zh, en, kind) in names.items():
        if key in coords:
            continue
        # The topology CSV uses the historical glyph 茘; Lands uses 荔.
        zh = zh.replace('茘', '荔')
        # The exact official suffix finds station records, not unrelated POIs.
        query = zh + ('輕鐵站' if kind == 'lrt' else '站')
        path = requests / (key.replace(':', '-') + '.json')
        if path.exists():
            results = json.loads(path.read_text('utf-8'))
        else:
            request = urllib.request.Request(LOCATION_API + '?q=' + urllib.parse.quote(query),
                headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.map.gov.hk/'})
            for attempt in range(3):
                try:
                    results = json.loads(urllib.request.urlopen(request, timeout=30).read().decode('utf-8'))
                    path.write_bytes(encoded(results)); break
                except Exception:
                    if attempt == 2: raise
                    time.sleep(2 + attempt)
            time.sleep(1.05)  # Respect the Lands Department's request-rate guidance.
        exact = [r for r in results if r.get('nameZH') in
                 [zh + '輕鐵站', '港鐵' + zh + '站', zh + '站']]
        access = [r for r in results if r.get('nameZH', '').startswith('港鐵' + zh + '站-')]
        candidates = exact or access
        if not candidates:
            raise ValueError('No verified station coordinate: ' + key + ' ' + zh + '; inspect ' + str(path))
        point = candidates[0]
        lng, lat = transform.transform(point['x'], point['y'])
        coords[key] = [round(lat, 6), round(lng, 6), point['nameZH']]
        target.write_bytes(encoded(coords))
        print('Station', key, zh, flush=True)
    return coords

def split_write(out, name, records):
    chunks, chunk = [], []
    size = 2
    for record in records:
        n = len(encoded(record)) + 1
        if size + n >= 890_000 and chunk:
            chunks.append(chunk); chunk = []; size = 2
        if n >= 890_000:
            raise ValueError('One record exceeds size guard: ' + name)
        chunk.append(record); size += n
    if chunk: chunks.append(chunk)
    files = []
    for index, part in enumerate(chunks):
        path = out / (name + '-' + str(index) + '.json')
        path.write_bytes(encoded(part))
        assert path.stat().st_size < 900_000
        files.append(path.name)
    return files

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--refresh', action='store_true', help='Redownload source archives')
    args = parser.parse_args(); cache = args.cache.resolve(); cache.mkdir(parents=True, exist_ok=True)
    if cache == ROOT or ROOT in cache.parents:
        raise ValueError('Raw cache must be outside the repository')
    for name, url in SOURCES.items():
        if args.refresh or not (cache / name).exists():
            urllib.request.urlretrieve(url, cache / name)
    rail = [r for r in csv.DictReader((cache / 'mtr-lines.csv').open(encoding='utf-8-sig')) if r.get('Station ID', '').strip()]
    light = [r for r in csv.DictReader((cache / 'light-rail.csv').open(encoding='utf-8-sig')) if r.get('Stop ID', '').strip()]
    coords = rail_coordinates(cache, rail, light)
    en = zipfile.ZipFile(cache / 'td-gtfs-en.zip'); tc = zipfile.ZipFile(cache / 'td-gtfs-tc.zip')
    zh_stops = {r['stop_id']: clean(r['stop_name']) for r in rows(tc, 'stops.txt')}
    stops = [[r['stop_id'], zh_stops[r['stop_id']], clean(r['stop_name']),
              round(float(r['stop_lat']), 6), round(float(r['stop_lon']), 6), '', ''] for r in rows(en, 'stops.txt')]
    assert all(21.5 < s[3] < 23 and 113.5 < s[4] < 115 for s in stops)
    stop_index = {s[0]: i for i, s in enumerate(stops)}
    zh_routes = {r['route_id']: clean(r['route_long_name']) for r in rows(tc, 'routes.txt')}
    modes = {'0': 'TRAM', '3': 'BUS', '4': 'FERRY', '7': 'CABLE_CAR'}
    routes = [[r['route_id'], r['agency_id'], r['route_short_name'], zh_routes[r['route_id']],
               clean(r['route_long_name']), 'MINIBUS' if r['agency_id'] == 'GMB' else modes[r['route_type']]]
              for r in rows(en, 'routes.txt')]
    route_index = {r[0]: i for i, r in enumerate(routes)}
    trips = {r['trip_id']: r for r in rows(en, 'trips.txt')}
    frequencies = collections.defaultdict(list)
    for r in rows(en, 'frequencies.txt'):
        frequencies[r['trip_id']].append([minute(r['start_time']), minute(r['end_time']), int(r['headway_secs']) / 60])
    grouped = collections.defaultdict(list)
    for r in rows(en, 'stop_times.txt'):
        grouped[r['trip_id']].append(r)
    print('Loaded', len(trips), 'trips', flush=True)
    patterns, keys = [], {}
    for tid, records in grouped.items():
        records.sort(key=lambda r: int(r['stop_sequence']))
        trip = trips[tid]; direction = tid.split('-')[1]
        sequence = [stop_index[r['stop_id']] for r in records]
        pickup = [int(r['pickup_type'] or 0) for r in records]
        dropoff = [int(r['drop_off_type'] or 0) for r in records]
        signature = (trip['route_id'], direction, tuple(sequence), tuple(pickup), tuple(dropoff))
        times = [minute(r['departure_time'] or r['arrival_time']) if (r['departure_time'] or r['arrival_time']) else None for r in records]
        if times[0] is None or times[-1] is None:
            raise ValueError('Missing terminal time: ' + tid)
        # Interpolate unpublished intermediate times between official timepoints.
        distances = [0.0]
        for a, b in zip(sequence, sequence[1:]): distances.append(distances[-1] + distance(stops[a], stops[b]))
        known = [i for i, t in enumerate(times) if t is not None]
        for a, b in zip(known, known[1:]):
            if times[b] < times[a]: times[b] += 1440
            for i in range(a + 1, b):
                ratio = (distances[i] - distances[a]) / (distances[b] - distances[a]) if distances[b] > distances[a] else (i-a)/(b-a)
                times[i] = times[a] + (times[b] - times[a]) * ratio
        offsets = [round(t - times[0], 1) for t in times]
        if signature not in keys:
            keys[signature] = len(patterns)
            patterns.append({'id': 'td:' + str(len(patterns)), 'r': route_index[trip['route_id']], 'd': direction,
                             's': sequence, 't': offsets, 'p': pickup, 'a': dropoff, 'w': []})
        pattern = patterns[keys[signature]]
        for start, end, headway in frequencies.get(tid, [[times[0], times[0], 0]]):
            pattern['w'].append([int(trip['service_id']), start, end, headway, offsets[-1]])
    # Identical records occur across special-service trips; preserve the union.
    for p in patterns: p['w'] = sorted(map(list, set(map(tuple, p['w']))))
    stop_modes = collections.defaultdict(set)
    for p in patterns:
        for stop in p['s']: stop_modes[stop].add(routes[p['r']][5])
    for stop, served_modes in stop_modes.items():
        stops[stop][6] = sorted(served_modes)[0]
    calendar = [[int(r['service_id']), ''.join(r[d] for d in ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']),
                 r['start_date'], r['end_date']] for r in rows(en, 'calendar.txt')]
    exceptions = [[int(r['service_id']), r['date'], int(r['exception_type'])] for r in rows(en, 'calendar_dates.txt')]
    # Group all official OD fares by price and boarding point; do not assume
    # fare IDs encode a particular sequence or discard sectional fares.
    prices = {r['fare_id']: round(float(r['price']) * 100) for r in rows(en, 'fare_attributes.txt')}
    fare_groups = collections.defaultdict(lambda: collections.defaultdict(set))
    for r in rows(en, 'fare_rules.txt'):
        fare_groups[(route_index[r['route_id']], stop_index[r['origin_id']])][prices[r['fare_id']]].add(stop_index[r['destination_id']])
    fares = [[r, o, [[cents, sorted(destinations)] for cents, destinations in sorted(groups.items())]]
              for (r, o), groups in sorted(fare_groups.items())]
    rail_groups = collections.defaultdict(list)
    for kind, records in [('mtr', rail), ('lrt', light)]:
        for r in records:
            sid = kind + ':' + r.get('Station ID', r.get('Stop ID'))
            if sid not in stop_index:
                stop_index[sid] = len(stops)
                stops.append([sid, r['Chinese Name'], r['English Name'], *coords[sid][:2],
                              r.get('Station Code', r.get('Stop Code')), 'SUBWAY' if kind == 'mtr' else 'LIGHT_RAIL'])
            rail_groups[(kind, r['Line Code'], r['Direction'])].append((float(r['Sequence']), stop_index[sid]))
    for (kind, line, direction), sequence in rail_groups.items():
        rid = kind + ':' + line
        if rid not in route_index:
            route_index[rid] = len(routes)
            routes.append([rid, 'MTR' if kind == 'mtr' else 'LRT', line, line, line, 'SUBWAY' if kind == 'mtr' else 'LIGHT_RAIL'])
        ids = [s for _, s in sorted(sequence)]
        offsets = [0]
        # MTR topology does not publish journey times or service calendars.
        # Store estimated run times, never invent official service windows.
        for a, b in zip(ids, ids[1:]):
            offsets.append(round(offsets[-1] + max(1.5, distance(stops[a], stops[b]) / (0.65 if kind == 'mtr' else 0.32)) + 0.5, 1))
        patterns.append({'id': rid + ':' + direction, 'r': route_index[rid], 'd': direction, 's': ids,
                         't': offsets, 'p': [0] * len(ids), 'a': [0] * len(ids), 'w': []})
    rail_fares = []
    for r in csv.DictReader((cache / 'mtr-fares.csv').open(encoding='utf-8-sig')):
        try:
            rail_fares.append([stop_index['mtr:' + r['SRC_STATION_ID']], stop_index['mtr:' + r['DEST_STATION_ID']],
                               round(float(r['OCT_ADT_FARE']) * 100)])
        except (KeyError, ValueError): pass
    out = ROOT / 'src/data/transport'; out.mkdir(exist_ok=True)
    files = {}
    for name, values in [('stops', stops), ('routes', routes), ('patterns', patterns), ('fares', fares),
                         ('rail-fares', rail_fares), ('calendar', calendar), ('exceptions', exceptions)]:
        files[name] = split_write(out, name, values)
    imports, exports = [], []
    for name, paths in files.items():
        names = []
        for i, path in enumerate(paths):
            symbol = name.replace('-', '_') + str(i); names.append('...' + symbol)
            imports.append("import " + symbol + " from './" + path + "';")
        exports.append('export const ' + name.replace('-', '_') + ' = [' + ','.join(names) + '];')
    (out / 'snapshot.ts').write_text('\n'.join(imports + exports) + '\n', encoding='utf-8')
    manifest = {'importedOn': datetime.date.today().isoformat(), 'sources': SOURCES, 'stationCoordinates': LOCATION_API,
                'counts': {'routes': len(routes), 'stops': len(stops), 'patterns': len(patterns), 'trips': len(trips),
                           'operators': dict(collections.Counter(r[1] for r in routes)), 'modes': dict(collections.Counter(r[5] for r in routes))},
                'limitations': ['Rail topology has estimated journey times; service availability requires live verification.',
                 'TD intermediate stop times are interpolated between published timepoints.',
                 'Published schedules are not live vehicle positions. Map lines connect stops schematically.',
                 'Red minibuses, taxis, Ngong Ping 360 and private services absent from the imported feeds are not included.'],
                'files': files}
    (out / 'manifest.json').write_bytes(encoded(manifest))
    valid = set(p.name for p in out.iterdir() if p.name in ['snapshot.ts', 'manifest.json']) | {n for ns in files.values() for n in ns}
    for p in out.glob('*.json'):
        if p.name not in valid: p.unlink()
    print(json.dumps(manifest['counts']), flush=True)

if __name__ == '__main__': main()
