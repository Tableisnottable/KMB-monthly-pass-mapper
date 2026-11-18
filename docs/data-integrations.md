# Transport and pedestrian data

- Government / operator feeds provide route catalogues, ordered stops, published adult fares, service windows and supported live predictions. Exact coverage varies by operator; absence of an ETA is not a cancellation or missed service.
- Lands Department Location Search (`https://www.map.gov.hk/gs/api/v1.0.0/locationSearch`) supplies bilingual buildings, landmarks and addresses. HK1980 grid points are converted to WGS84 with EPSG:2326 parameters before routing.
- OpenStreetMap pedestrian routing supplies mapped paths and alternatives. It can include mapped footbridges, subways and steps; indoor corridors and entrances are incomplete. Driving and ferry steps are rejected for walking routes. Missing geometry is not replaced with straight lines.
- GPS comes from the device with permission. The GO screen follows location while visible and provides manual progression through journey legs. It does not yet automatically detect boarding, identify stops passed or reroute around traffic. Background GPS is not guaranteed by the web platform.
- Pokeguide's public website describes carriage/door advice and AR navigation. No public routing-data API documentation was found on the inspected homepage, transport directory or sitemap on 2026-11-18. Pokeguide data has not been imported. A documented API or data agreement is needed to integrate its detailed routing, indoor paths or train-door recommendations.

## Search response targets

Target: approximately 3 seconds for initial results; average complete search below 10 seconds. These are targets, not guarantees on every phone or connection.

The browser calculator is warmed after page load. An initial timetable preview runs without external ETA or walking requests and may contain fewer transfers. The complete search then continues with the user's original limits, required operators and road rules. Topological reachability is cached independently of time, with separate entries for road and operator restrictions. External ETA / walk comparison waits share a 7-second response budget across all waypoints; detailed boards and geometry refresh separately. This budget does not interrupt the graph search. Deep unlimited-transfer or multi-waypoint searches can exceed the target.
