"""Import compact, bilingual school search points from the Education Bureau.

Raw CSV stays in memory. Only small, validated public name/address/point chunks
are written; duplicate school sessions at the same premises are combined.
"""
import csv
import datetime
import io
import json
import math
import pathlib
import urllib.request
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = 'https://www.edb.gov.hk/attachment/en/student-parents/sch-info/sch-search/sch-location-info/SCH_LOC_EDB.csv'
CATALOGUE = 'https://data.gov.hk/en-data/dataset/hk-edb-schinfo-school-location-and-information'
CHUNK_COUNT, MAX_BYTES = 4, 800_000


def main():
    request = urllib.request.Request(SOURCE, headers={'User-Agent': 'TransitCompassHK/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read().decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(raw))
    required = {'SCHOOL NO.', 'ENGLISH NAME', '中文名稱', 'ENGLISH ADDRESS', '中文地址', 'LONGITUDE', 'LATITUDE'}
    if not required.issubset(reader.fieldnames or []):
        raise RuntimeError('Education Bureau school columns changed; nothing was written.')
    seen, schools, rejected, count = set(), [], 0, 0
    for row in reader:
        count += 1
        try:
            lat, lng = float(row['LATITUDE']), float(row['LONGITUDE'])
        except ValueError:
            rejected += 1
            continue
        zh, en = row['中文名稱'].strip(), row['ENGLISH NAME'].strip()
        zh_address, en_address = row['中文地址'].strip(), row['ENGLISH ADDRESS'].strip()
        if not row['SCHOOL NO.'].strip() or not zh or not en or not (zh_address or en_address) or not (
            math.isfinite(lat) and math.isfinite(lng) and 22.1 <= lat <= 22.6 and 113.8 <= lng <= 114.5
        ):
            rejected += 1
            continue
        key = (zh, en, round(lat, 6), round(lng, 6), zh_address, en_address)
        if key in seen:
            continue
        seen.add(key)
        schools.append([row['SCHOOL NO.'].strip(), zh, en, zh_address, en_address, round(lat, 7), round(lng, 7)])
    if len(schools) < 1500 or rejected > count * .05:
        raise RuntimeError(f'Unexpected school coverage: {len(schools)} unique points, {rejected}/{count} rejected; nothing was written.')
    chunks = [[] for _ in range(CHUNK_COUNT)]
    for row in sorted(schools):
        chunks[zlib.crc32(row[0].encode()) % CHUNK_COUNT].append(row)
    serialised = [json.dumps(chunk, ensure_ascii=False, separators=(',', ':')) + '\n' for chunk in chunks]
    if any(len(value.encode('utf-8')) >= MAX_BYTES for value in serialised):
        raise RuntimeError('School chunk exceeds source-file limit; nothing was written.')
    folder = ROOT / 'src/data/places'
    folder.mkdir(parents=True, exist_ok=True)
    for index, value in enumerate(serialised):
        (folder / f'schools-{index}.json').write_text(value, encoding='utf-8')
    manifest = {'provider': 'Education Bureau', 'source': SOURCE, 'catalogue': CATALOGUE,
                'importedOn': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date().isoformat(),
                'sourceRows': count, 'places': len(schools), 'rejectedRows': rejected,
                'duplicateSessionsCombined': count - rejected - len(schools),
                'fields': ['schoolNumber', 'nameTc', 'nameEn', 'addressTc', 'addressEn', 'lat', 'lng'],
                'files': [f'schools-{i}.json' for i in range(CHUNK_COUNT)],
                'note': 'Published school location points, not verified entrances. Initials are search aliases, not official school names; ambiguous matches remain separate.'}
    (folder / 'schools-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(schools)} school premises from {count} rows; {rejected} invalid rows excluded.')
    print('Chunk bytes:', [len(value.encode('utf-8')) for value in serialised])


if __name__ == '__main__':
    main()
