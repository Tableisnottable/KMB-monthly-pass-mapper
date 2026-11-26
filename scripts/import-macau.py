"""Import the public Macau DSAT bus catalogue, stop platforms and road alignments.

Only published data is retained. In particular, live vehicle positions are not
saved as a timetable, and the importer does not invent bus operating hours.
Raw responses live outside Git. Each generated source file stays below 900 KB.
"""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://bis.dsat.gov.mo:37812'


def public_header(params):
    # The public website's getUrlHeader function (vendors.f3fbf990.js): an
    # unsigned MD5 of form fields interleaved with Macau wall-clock minutes.
    # This is a public request checksum, not an account credential.
    query = '&'.join(f'{k}={v}' for k, v in params.items())
    value = hashlib.md5(query.encode()).hexdigest()
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).strftime('%Y%m%d%H%M')
    return value[:4] + now[:4] + value[4:12] + now[4:8] + value[12:24] + now[8:] + value[24:]


def retrieve(endpoint, params, cache, refresh):
    key = hashlib.sha256((endpoint + json.dumps(params, sort_keys=True)).encode()).hexdigest()
    path = cache / (key + '.json')
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding='utf8'))
    last = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(BASE + endpoint, data=urllib.parse.urlencode(params).encode(), headers={
                'token': public_header(params), 'Referer': BASE + '/macauweb/',
                'User-Agent': 'TransitCompass/2.0 (public transport catalogue)',
                'Content-Type': 'application/x-www-form-urlencoded',
            })
            with urllib.request.urlopen(request, timeout=25) as response:
                data = json.load(response)
            header = data.get('header')
            if header != '000' and not (isinstance(header, dict) and header.get('status') == '000'):
                raise ValueError(f'{endpoint}: provider status {header}')
            path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf8')
            time.sleep(.12)
            return data
        except Exception as exc:
            last = exc
            time.sleep(1 + attempt)
    raise RuntimeError(str(last))


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    request = lambda endpoint, params: retrieve(endpoint, params, args.cache, args.refresh)
    catalogue = request('/macauweb/getRouteAndCompanyList.html', {'lang': 'zh-tw', 'device': 'web'})['data']
    jobs = [(row, direction) for row in catalogue['routeList']
            for direction in (['0', '1'] if row['direction'] == '0' else ['0'])]

    def load(job):
        row, direction = job
        number = row['routeName']
        body = {'action': 'sd', 'routeName': number, 'dir': direction, 'lang': 'zh-tw', 'routeType': row['direction'], 'device': 'web'}
        route = request('/macauweb/getRouteData.html', body)['data']
        body['lang'] = 'en'
        english = request('/macauweb/getRouteData.html', body)['data']
        location = request('/macauweb/routestation/location', {'routeName': number, 'dir': direction, 'lang': 'zh-tw', 'routeCode': route['routeCode'], 'device': 'web'})['data']
        geometry = request('/ddbus/common/supermap/route/traffic', {'lang': 'zh_tw', 'routeCode': route['routeCode'], 'direction': direction, 'indexType': '00', 'device': 'web'})['data']
        coords = {s['stationCode']: s for s in location['stationInfoList']}
        names = {s['busstopcode']: s['staName'] for s in english['routeInfo']}
        stops = []
        for stop in route['routeInfo']:
            pos = coords.get(stop['staCode'])
            if not pos:
                raise ValueError(f'Missing official coordinates: {number}/{direction}/{stop["staCode"]}')
            lat, lng = float(pos['latitude']), float(pos['longitude'])
            if not (22.09 <= lat <= 22.24 and 113.51 <= lng <= 113.62):
                raise ValueError(f'Invalid Macau coordinate {lat},{lng}')
            stops.append([stop['staCode'], stop['staName'], names.get(stop['busstopcode'], stop['staName']), round(lat, 6), round(lng, 6), stop.get('suspendState') == '1'])
        paths = []
        for part in geometry:
            points = []
            for pair in part.get('routeCoordinates', '').split(';'):
                if not pair:
                    continue
                try:
                    lng, lat = map(float, pair.split(',')[:2])
                except ValueError:
                    # Broken concatenated coordinate rows occur in the source.
                    # Split at the gap instead of repairing or bridging it.
                    if len(points) > 1:
                        paths.append(points)
                    points = []
                    continue
                if not (math.isfinite(lat) and math.isfinite(lng) and 22.09 <= lat <= 22.24 and 113.51 <= lng <= 113.62):
                    raise ValueError('Invalid official road alignment')
                point = [round(lat, 5), round(lng, 5)]
                if not points or point != points[-1]:
                    points.append(point)
            if len(points) > 1:
                paths.append(points)
        result = {'id': f'MO:BUS:{number}:{direction}', 'number': number, 'direction': direction,
                  'operator': {'Blue': 'MO_TRANSMAC', 'Orange': 'MO_TCM'}.get(row['color'], 'MO_BUS'),
                  'routeCode': route['routeCode'], 'stops': stops, 'paths': paths,
                  'mode': 'BUS', 'scheduleVerified': False}
        print(f'{number}/{direction}: {len(stops)} stops, {len(paths)} road pieces', flush=True)
        return result

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        patterns = list(pool.map(load, jobs))
    target = ROOT / 'src/data/macau'
    target.mkdir(parents=True, exist_ok=True)
    chunks, chunk = [], []
    for pattern in patterns:
        if len(compact(chunk + [pattern]).encode()) > 850_000:
            chunks.append(chunk)
            chunk = []
        chunk.append(pattern)
    if chunk:
        chunks.append(chunk)
    for i, rows in enumerate(chunks):
        (target / f'buses-{i}.json').write_text(compact(rows) + '\n', encoding='utf8')
    imports = '\n'.join(f"import buses{i} from './buses-{i}.json';" for i in range(len(chunks)))
    (target / 'buses.ts').write_text(imports + '\nexport const buses = [' + ','.join(f'...buses{i}' for i in range(len(chunks))) + '];\n', encoding='utf8')
    manifest = {'city': 'macau', 'importedOn': dt.datetime.now(dt.timezone.utc).isoformat(),
                'routes': len(catalogue['routeList']), 'patterns': len(patterns),
                'stops': len({s[0] for p in patterns for s in p['stops']}),
                'roadPatterns': sum(bool(p['paths']) for p in patterns),
                'sources': [BASE + '/macauweb/', 'https://www.macaotourism.gov.mo/en/travelessential/before-you-travel/local-transportation', 'https://www.mlm.com.mo/en/route.html', 'https://www.mlm.com.mo/en/general_ticket.html'],
                'limitations': ['Bus operating hours and timetables are not yet verified. Bus journeys are opt-in estimates, not live or confirmed services.',
                               'Temporary stop suspensions reflect the import time, not continuous live updates.',
                               'Only the published MOP6 cash bus fare is applied. Unverified concession and transfer discounts are not assumed.',
                               'Casino shuttles, ferries and Hong Kong–Macau cross-border journeys are not included.']}
    (target / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(compact(manifest))


if __name__ == '__main__':
    main()
