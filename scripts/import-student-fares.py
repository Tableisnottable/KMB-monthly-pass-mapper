"""Refresh published Student Octopus fares without changing adult fares or scores."""
import csv
import datetime
import io
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = {
    'mtr': 'https://opendata.mtr.com.hk/data/mtr_lines_fares.csv',
    'lrt': 'https://opendata.mtr.com.hk/data/light_rail_fares.csv',
    'bus': 'https://opendata.mtr.com.hk/data/mtr_bus_fares.csv',
}


def records(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'TransitCompassHK/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return list(csv.DictReader(io.StringIO(response.read().decode('utf-8-sig'))))


def main():
    rail = []
    for kind, origin, destination, price in [
        ('mtr', 'SRC_STATION_ID', 'DEST_STATION_ID', 'OCT_STD_FARE'),
        ('lrt', 'from_station_id', 'to_station_id', 'fare_octo_student'),
    ]:
        for row in records(SOURCES[kind]):
            rail.append([kind + ':' + row[origin], kind + ':' + row[destination], round(float(row[price]) * 100)])
    buses = [[row['ROUTE_ID'], round(float(row['FARE_OCTO_STUDENT']) * 100)] for row in records(SOURCES['bus'])]
    payload = {'importedOn': datetime.date.today().isoformat(), 'sources': SOURCES, 'rail': rail, 'buses': buses}
    output = ROOT / 'src/data/studentFares.json'
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    if output.stat().st_size >= 1_000_000:
        raise RuntimeError('Student fare snapshot exceeds the source-file size limit')
    print(f'Imported {len(rail)} rail OD fares and {len(buses)} MTR Bus fares ({output.stat().st_size} bytes).')


if __name__ == '__main__':
    main()
