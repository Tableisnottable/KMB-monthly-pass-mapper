"""Estimate Hong Kong stop offsets between published GTFS timepoints."""
from collections import defaultdict
import math

from transport_geometry import GATES, decode, nearest, read_rows

LOCAL_KPH = 24
FAST_KPH = 60
STOP_MINUTES = 0.4
FAST_GATES = {
    'cht', 'ehc', 'whc', 'lion', 'tate', 'shingmun', 'tsingsha', 'lantau', 'tmclk',
    'tailam', 'tuenmun', 'tkolam', 'iec', 'fanling', 'northlantau', 'tolo',
    'cheungtsing', 'tsingkau', 'eaglesnest', 'shatinheights', 'taiwai', 'airporttunnel',
}


def distance(a, b):
    x = math.radians(b[0] - a[0])
    y = math.radians(b[1] - a[1])
    k = math.sin(x / 2)**2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(y / 2)**2
    return 12742 * math.asin(min(1, math.sqrt(k)))


def road_alignments():
    alignments = defaultdict(list)
    for route, direction, groups in read_rows('roads', 'alignments'):
        for encoded in groups:
            line = decode(encoded)
            if len(line) >= 2:
                alignments[(str(route), str(direction))].append(line)
    return alignments


def bus_weights(points, candidates, pickup, dropoff):
    fallback = [distance(a, b) for a, b in zip(points, points[1:])]
    best = None
    for line in candidates:
        positions, errors = [], []
        step = 0
        for point in points:
            error, step = nearest(line, point, step)
            positions.append(step)
            errors.append(error)
        if max(errors) > 0.25:
            continue
        score = sum(errors)
        if best is None or score < best[0]:
            best = score, line, positions, errors

    lengths, fast_intervals = fallback, set()
    if best:
        _, line, positions, errors = best
        cumulative = [0.0]
        for a, b in zip(line, line[1:]):
            cumulative.append(cumulative[-1] + distance(a, b))

        def kilometres_at(position):
            index = int(position)
            return cumulative[index] + (position - index) * (cumulative[min(index + 1, len(line) - 1)] - cumulative[index])

        offsets = list(map(kilometres_at, positions))
        measured = [b - a for a, b in zip(offsets, offsets[1:])]
        if all(length + errors[i] + errors[i + 1] + 0.02 >= fallback[i] for i, length in enumerate(measured)):
            lengths = [max(length, fallback[i]) for i, length in enumerate(measured)]
            latitudes, longitudes = zip(*line)
            south, north, west, east = min(latitudes), max(latitudes), min(longitudes), max(longitudes)
            crossings = []
            for key, lat, lon, radius in GATES:
                if key not in FAST_GATES or not (south - .004 <= lat <= north + .004 and west - .004 <= lon <= east + .004):
                    continue
                error, position = nearest(line, (lat, lon))
                if error <= min(radius, .07):
                    crossings.append(position)
            fast_intervals = {i for i, length in enumerate(lengths) if length >= 1.5
                              and any(positions[i] < pos < positions[i + 1] for pos in crossings)}

    weights = []
    for i, length in enumerate(lengths):
        # Use local speeds for the approaches even on a confirmed fast interval.
        local = min(length, 0.6) if i in fast_intervals else length
        dwell = STOP_MINUTES if i + 1 < len(points) - 1 and (pickup[i + 1] == 0 or dropoff[i + 1] == 0) else 0
        weights.append(max(0.02, 60 * (local / LOCAL_KPH + (length - local) / FAST_KPH) + dwell))
    return weights


def interpolate(times, weights):
    """Fit the weights to each consecutive pair of published timepoints."""
    known = [i for i, value in enumerate(times) if value is not None]
    for start, end in zip(known, known[1:]):
        if times[end] < times[start]:
            times[end] += 1440 * math.ceil((times[start] - times[end]) / 1440)
        interval = weights[start:end]
        total = sum(interval)
        elapsed_weight = 0
        for i, weight in enumerate(interval[:-1], start + 1):
            elapsed_weight += weight
            ratio = elapsed_weight / total if total else (i - start) / (end - start)
            times[i] = times[start] + (times[end] - times[start]) * ratio
    return [round(value - times[0], 3) for value in times]
