"""Tag travelled stop intervals using imported TD road alignments, not route prefixes."""
import json

from transport_geometry import GATES, ROOT, decode, nearest, read_rows


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
