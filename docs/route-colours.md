# Company display colours

Updated 2026-11-14 at the user's request: bus routes use company colours, including 1xx, 3xx, 6xx, 9xx, airport and premium services. N/NA night-bus routes use black with white text and icons across all operators. This replaces the earlier route-number stop-plate scheme.

| Company / network | Badge background / foreground |
| --- | --- |
| KMB | Red / white |
| Citybus | Yellow / dark |
| Long Win | Orange / dark |
| New Lantao | Blue / white |
| MTR Bus | Maroon / white |
| Discovery Bay | Teal / white |
| Ma Wan | Purple / white |
| Cross-boundary coaches | Slate / white |

Joint services keep both companies: the number uses the first company's palette and the bus icon uses the second company's palette. Their map line uses the first company's colour. The N/NA night-bus rule takes priority: the whole badge, bus icon background and map line are black, including joint routes such as N122. NR residents' services are not night-bus routes. Unknown companies otherwise use a neutral fallback. Existing non-bus mode colours are retained.

These are the application's company display colours, not certified paint codes or official GTFS colour fields. The government GTFS does not supply `route_color` or `route_text_color`. Routes, direction details, station departures and maps share the same display functions. Colour selection does not alter weighting, fares or routing.
