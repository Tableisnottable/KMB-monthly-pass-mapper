# Company display colours

Updated 2026-11-14 at the user's request: 1xx/3xx/6xx/9xx harbour routes mix route-number colours with company colours. The route number uses red/white for 1xx/3xx/6xx and green/white for 9xx (including X9xx); the bus icon uses the company palette below. Other bus routes retain company colours. N/NA night-bus routes use black with white text and icons across all operators.

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

Joint harbour services keep both companies alongside the route colour: the icon uses the second company's palette with a thin first-company stripe, and the number uses the route colour. Harbour map lines use the route colour. Known Citybus local or mixed-tunnel exceptions (314, 382, 628, 629 and 634) retain the company palette rather than assigning a tunnel colour from their number alone. These route-category colours retain the application's earlier stop-plate approximations.

Other joint services retain the first company's number palette and the second company's icon palette; their map line uses the first company's colour. The N/NA night-bus rule takes priority: the whole badge, bus icon background and map line are black, including joint routes such as N122. NR residents' services are not night-bus routes. Unknown companies otherwise use a neutral fallback. Existing non-bus mode colours are retained.

These are the application's company display colours, not certified paint codes or official GTFS colour fields. The government GTFS does not supply `route_color` or `route_text_color`. Routes, direction details, station departures and maps share the same display functions. Colour selection does not alter weighting, fares or routing.
