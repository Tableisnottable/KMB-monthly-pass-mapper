"""Import TD road alignments and OSM tracks/water routes. Raw cache stays outside Git.

python scripts/import-alignments.py --cache <external directory>
Requires osmium in <cache>/python-libs. Every generated chunk is < 890 KB.
"""
import argparse
import collections
import datetime
import json
import shutil
import math
from pathlib import Path
import sys
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATASETS = {'bus': 'td_rcd_1638844988873_41214', 'gmb': 'td_rcd_1697082463580_57453'}
OSM_SOURCE = 'https://download.geofabrik.de/asia/china/hong-kong/hong-kong-latest.osm.pbf'

def download(url, target):
    """Retry downloads without treating an interrupted file as a usable cache."""
    partial = target.with_name(target.name + '.part')
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Transit-Compass-data-refresh/1.1'})
            with urllib.request.urlopen(request, timeout=90) as response, partial.open('wb') as output:
                if 'text/html' in response.headers.get('Content-Type', ''):
                    raise ValueError('Expected OSM data, received HTML')
                shutil.copyfileobj(response, output)
                expected = response.headers.get('Content-Length')
            size = partial.stat().st_size
            if not size or expected and size != int(expected):
                raise ValueError('Incomplete OSM download')
            partial.replace(target)
            return
        except (OSError, ValueError):
            partial.unlink(missing_ok=True)
            if attempt == 2:
                raise
            time.sleep(attempt + 1)

def encoded(value): return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')

def polyline(points):
    out, prev = [], [0, 0]
    for lat, lng in points:
        for axis, v in enumerate([round(lat * 1e5), round(lng * 1e5)]):
            n = v - prev[axis]; prev[axis] = v; n = ~(n << 1) if n < 0 else n << 1
            while n >= 32: out.append(chr((32 | (n & 31)) + 63)); n >>= 5
            out.append(chr(n + 63))
    return ''.join(out)

def simplify(points, epsilon=0.000012):
    if len(points) < 3: return points
    keep = {0, len(points)-1}; stack = [(0, len(points)-1)]
    while stack:
        a,b = stack.pop(); x,y = points[a]; dx,dy = points[b][0]-x, points[b][1]-y
        den = dx*dx+dy*dy; best,idx = epsilon*epsilon, None
        for i in range(a+1,b):
            px,py=points[i][0]-x,points[i][1]-y; t=max(0,min(1,(px*dx+py*dy)/den)) if den else 0
            d=(px-t*dx)**2+(py-t*dy)**2
            if d>best:best,idx=d,i
        if idx is not None:keep.add(idx);stack.extend([(a,idx),(idx,b)])
    return [points[i] for i in sorted(keep)]

def fetch_td(cache, name, dataset):
    rows=[]; offset=0
    while True:
        path=cache/f'alignments-{name}-{offset}.json'
        if not path.exists():
            query=urllib.parse.urlencode(dict(f='json',where='1=1',outFields='ROUTE_ID,ROUTE_SEQ',outSR=4326,
                geometryPrecision=5,resultOffset=offset,resultRecordCount=300,orderByFields='OBJECTID'))
            url=f'https://portal.csdi.gov.hk/server/rest/services/common/{dataset}/FeatureServer/0/query?{query}'
            path.write_bytes(urllib.request.urlopen(url,timeout=90).read());time.sleep(0.3)
        data=json.loads(path.read_bytes())
        if 'error' in data:raise ValueError(data['error'])
        for f in data['features']:
            parts=[]
            for raw in f['geometry']['paths']:
                line=[[round(p[1],5),round(p[0],5)] for p in raw]
                if parts and parts[-1][-1]==line[0]:parts[-1].extend(line[1:])
                else:parts.append(line)
            rows.append([str(f['attributes']['ROUTE_ID']),str(f['attributes']['ROUTE_SEQ']),[polyline(simplify(p)) for p in parts]])
        print(name,offset,len(data['features']),flush=True)
        if not data.get('exceededTransferLimit'):break
        offset+=len(data['features'])
    return rows

def osm_tracks(cache):
    sys.path.insert(0,str(cache/'python-libs'));import osmium
    source=cache/'hong-kong-latest.osm.pbf'
    if not source.exists():download(OSM_SOURCE,source)
    class Reader(osmium.SimpleHandler):
        def __init__(self):super().__init__();self.ways={};self.relations=[]
        def way(self,w):
            kind=w.tags.get('railway','ferry' if w.tags.get('route')=='ferry' else '')
            if kind not in ['rail','subway','light_rail','tram','funicular','ferry']:return
            if w.tags.get('service') in ['yard','siding','spur'] or w.tags.get('railway:disused')=='yes':return
            self.ways[w.id]=(kind,[[round(n.lat,5),round(n.lon,5)] for n in w.nodes])
        def relation(self,r):
            if r.tags.get('route') in ['subway','train','light_rail']:
                self.relations.append((r.tags.get('ref',''),r.tags.get('route'),[m.ref for m in r.members if m.type=='w']))
    reader=Reader();reader.apply_file(str(source),locations=True)
    groups=collections.defaultdict(set)
    for ref,kind,ids in reader.relations:
        if ref:groups[('lrt:' if kind=='light_rail' else 'mtr:')+ref].update(i for i in ids if i in reader.ways)
    for i,(kind,_) in reader.ways.items():groups['mode:'+kind].add(i)
    return [[key,[polyline(reader.ways[i][1]) for i in sorted(ids)]] for key,ids in sorted(groups.items())]

def split(out,name,rows):
    parts=[];chunk=[];size=2
    for row in rows:
        n=len(encoded(row))+1
        if chunk and size+n>880000:parts.append(chunk);chunk=[];size=2
        if n>880000:
            # Large mode graphs can be split without losing their shared key.
            for line in row[-1]:
                record=[*row[:-1],[line]];parts.append([record])
            continue
        chunk.append(row);size+=n
    if chunk:parts.append(chunk)
    paths=[]
    for i,part in enumerate(parts):
        p=out/f'{name}-{i}.json';p.write_bytes(encoded(part));assert p.stat().st_size<890000;paths.append(p.name)
    return paths

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--cache',type=Path,required=True);a=p.parse_args();cache=a.cache.resolve()
    if cache==ROOT or ROOT in cache.parents:raise ValueError('Raw data must remain outside the repository')
    cache.mkdir(exist_ok=True,parents=True);out=ROOT/'src/data/alignments';out.mkdir(exist_ok=True)
    road=[]
    for name,dataset in DATASETS.items():road+=fetch_td(cache,name,dataset)
    tracks=osm_tracks(cache)
    files={'roads':split(out,'roads',road),'tracks':split(out,'tracks',tracks)}
    imports=[];exports=[]
    for group,paths in files.items():
        symbols=[]
        for i,path in enumerate(paths):
            symbol=group+str(i);symbols.append('...'+symbol);imports.append(f"import {symbol} from './{path}';")
        exports.append(f"export const {group} = ["+','.join(symbols)+'];')
    (out/'snapshot.ts').write_text('\n'.join(imports+exports)+'\n',encoding='utf-8')
    manifest={'importedOn':datetime.date.today().isoformat(),'roadAlignments':len(road),'trackGroups':len(tracks),
        'sources':{**{k:f'https://portal.csdi.gov.hk/geoportal/?datasetId={v}' for k,v in DATASETS.items()},'osm':OSM_SOURCE},
        'attribution':'Bus and minibus alignments: Hong Kong Transport Department / CSDI. Tracks and ferry ways: OpenStreetMap contributors, ODbL 1.0.',
        'files':files}
    (out/'manifest.json').write_bytes(encoded(manifest));print(manifest,flush=True)

if __name__=='__main__':main()
