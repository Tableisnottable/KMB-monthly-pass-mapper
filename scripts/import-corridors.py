"""Tag travelled stop intervals using imported TD road alignments, not route prefixes."""
import glob
import json
import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
# Small checkpoints inside each corridor; these are routing labels, not legal boundaries.
GATES = [
    ('cht', 22.2950, 114.1810, .30), ('ehc', 22.29535, 114.22332, .20), ('whc', 22.29790, 114.15364, .20),
    ('lion', 22.3515, 114.1785, .25), ('tate', 22.36114, 114.21122, .20),
    ('shingmun', 22.37618, 114.14759, .20), ('tsingsha', 22.3570, 114.1640, .35),
    ('lantau', 22.3510, 114.0780, .35), ('tmclk', 22.35540, 113.95406, .20),
    # OSM named road-way points, checked against the imported TD alignments.
    # Tai Lam motorway 157935798 (not the similarly named non-road tunnel);
    # Tuen Mun Rd 158584361; Route Twisk 300687180;
    # TKO 28109408; TKO-Lam Tin 1121976751 (inside tunnel, not EHC ramp); Aberdeen 155997128;
    # Wong Nai Chung Gap Rd 1061013212. OSM contributors, ODbL 1.0.
    ('tailam', 22.3912052, 114.0616553, .18), ('tuenmun', 22.3656734, 114.0476138, .10),
    ('twisk', 22.4041156, 114.1037819, .08), ('tko', 22.3194734, 114.2462032, .12),
    ('tkolam', 22.3026283, 114.2442178, .15), ('aberdeen', 22.2618034, 114.1804956, .12),
    ('gap', 22.2572219, 114.1924079, .06),
    # OSM named main-road ways, retrieved 2026-11-14 (ODbL 1.0).
    # 494470543, 400734252, 277509406, 26989255, 25157049, 310075922,
    # 255883702, 219993921, 494704695, 744885270, 224754465, 377930769.
    ('chingcheung', 22.3399668, 114.1463217, .08), ('clearwater', 22.3167194, 114.2814787, .08),
    ('fanling', 22.4895956, 114.1409902, .08), ('iec', 22.2815928, 114.2302696, .08),
    ('kaitak', 22.3239622, 114.1921129, .08), ('kwuntong', 22.3158060, 114.2138691, .08),
    ('lungcheung', 22.3443732, 114.1760268, .08), ('northlantau', 22.3145281, 113.9961558, .08),
    ('pokfulam', 22.2805995, 114.1315595, .06), ('taiporoad', 22.3382524, 114.1629050, .06),
    ('tolo', 22.4234711, 114.2120053, .08), ('tungchung', 22.2585694, 113.9393280, .08),
]


def read_rows(prefix, folder='transport'):
    return sum([json.loads(pathlib.Path(p).read_text(encoding='utf8')) for p in sorted(glob.glob(str(ROOT / f'src/data/{folder}/{prefix}-*.json')))], [])


def decode(value):
    result, lat, lon, i = [], 0, 0, 0
    while i < len(value):
        numbers = []
        for _ in range(2):
            number, shift = 0, 0
            while True:
                b = ord(value[i]) - 63
                i += 1
                number |= (b & 31) << shift
                shift += 5
                if b < 32:
                    break
            numbers.append(~(number >> 1) if number & 1 else number >> 1)
        lat += numbers[0]
        lon += numbers[1]
        result.append((lat / 1e5, lon / 1e5))
    return result


def nearest(line, point, start=0):
    best = (float('inf'), float(start))
    px, py = point[1] * 103, point[0] * 111
    for i in range(int(start), len(line) - 1):
        ax, ay = line[i][1] * 103, line[i][0] * 111
        bx, by = line[i + 1][1] * 103, line[i + 1][0] * 111
        dx, dy = bx - ax, by - ay
        t = max(start - i if i == int(start) else 0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy or 1)))
        d = math.hypot(px - ax - t * dx, py - ay - t * dy)
        if d < best[0] - .003:
            best = d, i + t
    return best


def main():
    stops, routes, patterns = read_rows('stops'), read_rows('routes'), read_rows('patterns')
    roads = {}
    for rid, direction, groups in read_rows('roads', 'alignments'):
        for encoded in groups:
            line = decode(encoded)
            if len(line) < 2:
                continue
            crossings = [(key, position) for key, lat, lon, radius in GATES for d, position in [nearest(line, (lat, lon))] if d <= radius]
            if crossings:
                roads.setdefault((str(rid), str(direction)), []).append((line, crossings))
    rows = set()
    for pattern in patterns:
        route = routes[pattern['r']]
        best = None
        for line, crossings in roads.get((str(route[0]), str(pattern['d'])), []):
            positions, errors, previous = [], [], 0
            for stop in pattern['s']:
                error, previous = nearest(line, stops[stop][3:5], previous)
                positions.append(previous)
                errors.append(error)
            if max(errors) > .6:
                continue
            score = sum(errors)
            if best is None or score < best[0]:
                best = score, positions, crossings
        if best:
            _, positions, crossings = best
            for key, position in crossings:
                for segment in range(len(positions) - 1):
                    if positions[segment] <= position < positions[segment + 1]:
                        rows.add((pattern['id'], segment, key))
                        break
    output = ROOT / 'src/data/corridorSegments.json'
    output.write_text(json.dumps(sorted(rows), separators=(',', ':')) + '\n', encoding='utf8')
    print(f'Tagged {len(rows)} travelled corridor intervals ({output.stat().st_size} bytes).')
    for number in ['104', '619', '961', 'A31', 'A33X', '286X', '170', '49X', '680', '268C', '60X', '51', '98D', '96', '6', '6X']:
        ids = {p['id'] for p in patterns if routes[p['r']][2] == number}
        print(number, sorted({key for pid, _, key in rows if pid in ids}))


if __name__ == '__main__':
    main()
