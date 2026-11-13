# Alignment data attribution

`roads-*.json`: bus and green minibus road alignments provided by the Hong Kong
Transport Department through CSDI. Source dataset identifiers and retrieval date
are recorded in `manifest.json`. Data is rounded to five decimal places,
simplified by approximately 1.3 metres and encoded as geographic polylines.

`tracks-*.json`: derived from © OpenStreetMap contributors, downloaded through
Geofabrik's Hong Kong extract. These files are available under the Open Database
License (ODbL) 1.0: https://opendatacommons.org/licenses/odbl/1-0/.
Source and attribution: https://www.openstreetmap.org/copyright.
The extract is filtered to rail, subway, light rail, tram, funicular and ferry
ways and their route memberships, rounded to five decimal places and encoded.
This data license applies to the track database, not the application source.

Regenerate both databases with `scripts/import-alignments.py`. Raw PBF files
and CSDI responses must stay in the external cache, outside the repository.

Walking and road fallback geometries use OpenStreetMap through OSRM. The default
public demonstration service is rate-limited to one request per 1.1 seconds per
application process and cached. Use private OSRM services for production load.
