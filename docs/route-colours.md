# Company display colours

Updated 2026-11-14 at the user's request: all bus routes retain their company colours. Joint services mix both companies, and 1xx/3xx/6xx/9xx/N families add a route-category accent without replacing the company colours. These rules apply to route badges, station boards, journey details and map paths.

| Company / network | Badge background / foreground |
| --- | --- |
| KMB | Red / white |
| Citybus | Yellow / dark |
| Long Win | Orange / dark |
| New Lantao | Blue / white |
| MTR Bus | Maroon / white |
| Discovery Bay | Purple / white |
| Ma Wan | Purple / white |
| Cross-boundary coaches | Slate / white |

The route-number background uses the first company; a joint-service icon uses the second company. The badge's bottom stripe mixes every company colour and the family accent: red for 1xx/3xx/6xx, green for 9xx/X9xx, and black for N/NA. All matching bus numbers use the requested family rule; the accent is a display convention rather than proof of which tunnel a service uses. These route-category colours retain the application's earlier stop-plate approximations.

Map lines alternate all colours along the same physical route geometry. Night buses retain company colours plus a black accent, including joint routes such as N122. NR residents' services are not night-bus routes. Unknown companies use a neutral fallback. MTR and Light Rail share burgundy; other existing non-bus mode colours are retained.

These are the application's company display colours, not certified paint codes or official GTFS colour fields. The government GTFS does not supply `route_color` or `route_text_color`. Routes, direction details, station departures and maps share the same display functions. Colour selection does not alter weighting, fares or routing.
