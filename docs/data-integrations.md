# Transport and pedestrian data

- Government / operator feeds provide route catalogues, ordered stops, published adult fares, service windows and supported live predictions. Exact coverage varies by operator; absence of an ETA is not a cancellation or missed service.
- Lands Department Location Search (`https://www.map.gov.hk/gs/api/v1.0.0/locationSearch`) supplies bilingual buildings, landmarks and addresses. HK1980 grid points are converted to WGS84 with EPSG:2326 parameters before routing.
- OpenStreetMap pedestrian routing supplies mapped paths and alternatives. It can include mapped footbridges, subways and steps; indoor corridors and entrances are incomplete. Driving and ferry steps are rejected for walking routes. Missing geometry is not replaced with straight lines.
- GPS comes from the device with permission. The GO screen follows location while visible and provides manual progression through journey legs. It does not yet automatically detect boarding, identify stops passed or reroute around traffic. Background GPS is not guaranteed by the web platform.
- Pokeguide's public website describes carriage/door advice and AR navigation. No public routing-data API documentation was found on the inspected homepage, transport directory or sitemap on 2026-11-18. Pokeguide data has not been imported. A documented API or data agreement is needed to integrate its detailed routing, indoor paths or train-door recommendations.

## Search response targets

Target: approximately 3 seconds for initial results; average complete search below 10 seconds. These are targets, not guarantees on every phone or connection.

The browser calculator is warmed after page load. An initial timetable preview runs without external ETA or walking requests and may contain fewer transfers. The complete search then continues with the user's original limits, required operators and road rules. Topological reachability is cached independently of time, with separate entries for road and operator restrictions. External ETA / walk comparison waits share a 7-second response budget across all waypoints; detailed boards and geometry refresh separately. This budget does not interrupt the graph search. Deep unlimited-transfer or multi-waypoint searches can exceed the target.

Measured on 2026-11-18 with the production browser bundle in a desktop Node worker, using the local Cloudflare provider proxy. The calculator was warmed once; searches ran 65 seconds apart to respect provider limits. Across the run, 117 provider responses succeeded, with no failures or rate limiting. Some searches complete from timetables before live enrichment finishes; individual departure boards continue refreshing.

| Journey | First results | Complete results |
| --- | ---: | ---: |
| Cheung Sha Wan → Airport | 1.72 s | 6.51 s |
| Cheung Sha Wan → Central | 1.70 s | 6.06 s |
| Tsuen Wan → Sha Tin | 1.09 s | 4.09 s |
| Tsim Sha Tsui → Mong Kok | 2.00 s | 9.11 s |
| Airport → Cheung Sha Wan | 1.53 s | 5.01 s |
| **Average** | **1.61 s** | **6.16 s** |

These timings include the sequential preview and full search, excluding the initial bundle download, map rendering and device startup. They are a small desktop sample, not a phone latency guarantee or an exhaustive test of custom restrictions and Via searches. A separate Chromium test at a 412 × 915 viewport displayed the first journey cards in 1.92 seconds and verified departure selection, arrival recalculation, GO and bus route lookup without page errors.

Reproduce calculator timings after `npm run build` with `node scripts/benchmark-browser-worker.mjs`. To measure provider waits, run `node scripts/benchmark-browser-worker.mjs --live --origin=http://127.0.0.1:8791 --spacing-ms=65000` against a running preview. `--case=Tsim` selects one fixture. Real Pixel / iPhone measurements remain necessary.
