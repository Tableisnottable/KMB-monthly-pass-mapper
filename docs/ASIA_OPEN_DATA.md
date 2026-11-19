# Asia open data directory

The searchable region picker lists 52 Asian countries/regions, with city shortcuts.
Hong Kong and Macao retain their existing planners. Other regions have an open
map directory for locally mapped roads, public transport route segments and stops.
An entry in the picker does **not** mean nationwide journey planning, fares,
complete timetables, real-time arrivals or flights are available.

## Free, anonymous data

- Source: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
  licensed under **ODbL 1.0**. Attribution is visible on the map and in Sources.
- Endpoint: `https://api.openstreetmap.org/api/0.6/map.json?bbox=…`.
  No API key, account, paid subscription or TDX credentials are used.
- Each user request is limited to a small area, about 670 m north to south. Move
  the map and choose **Load this area** to browse elsewhere. The dashed rectangle
  shows the loaded area, not the complete city or country.
- The browser loads the public CORS extract directly, without credentials, and
  parses it on the device. A streaming proxy is a fallback; public hosting
  egress can be unavailable even when the direct endpoint works. Local extracts
  are cached for a day. No five-second
  polling, bulk country downloads or missing-path straight lines are used.
- Missing geometry stays missing. The road list excludes indoor footways,
  station stairs, private parking aisles and other non-road features.

## Small landing snapshots

Taipei Main Station and Tokyo Station have versioned, attributed local extracts
in `public/open-data/`, together under 500 KB. Refresh manually with:

```sh
node scripts/refresh-open-map.mjs
```

The script preserves existing snapshots if fetching fails, rejects an oversized
output, and never downloads a whole country. Source URL and retrieval date are
included in each snapshot. Other cities use the public map endpoint on demand.

## Travel pass catalogue

The current directory has 69 known products across Hong Kong, Macao, Taiwan,
Japan, Singapore, South Korea and Thailand. The [complete list](TRAVEL_PASSES.md)
links to public operator pages and is not an exhaustive list of every Asian
ticket. Users can record additional passes by name and expiry date. Stored-value
cards are labelled separately and do not imply unlimited travel.

Only the existing KMB pass fare rules are applied automatically. Other products
are explicitly marked **Record only**; saving one does not assume free travel,
eligibility, discounts, or a current price. Pass ownership stays on the device.

## Further data

Adding complete schedules and nationwide journey planning requires individually
licensed, account-free GTFS or equivalent operator feeds. A map relation alone
cannot establish a service calendar, a fare or a live vehicle location. Paid or
account-gated feeds must not be used as fallbacks for these pages.
