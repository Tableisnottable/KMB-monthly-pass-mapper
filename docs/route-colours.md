# Bus route-number colours

Reviewed 2026-11-14. These are route-number stop-plate conventions, not operator logos or vehicle liveries. Hex values are screen approximations of the physical colour combinations, not certified operator Pantone specifications. Sign generations and locations can differ.

| Service | Background / number |
| --- | --- |
| Ordinary KMB and MTR Bus | White / black |
| Cross-Harbour and Eastern Harbour services | Red / white |
| Western Harbour services | Green / white |
| KMB P960/P968 premium services | Rose / white |
| Citybus ordinary and express services | Dark blue / white |
| Cityflyer A routes | Burgundy / white |
| Citybus E routes | Red / white; E11 variants and E18 use green / white |
| Citybus overnight routes, including NA services | Black / yellow |
| Long Win A routes | Navy / yellow |
| Long Win E routes | Orange / white |
| Long Win S routes | Orange / navy |
| Long Win overnight routes, including NA services | Black / white |
| Long Win Disneyland services | Navy / white |
| Citybus Disneyland services | Light blue / navy |
| New Lantao A35 | Red / yellow |
| New Lantao ordinary intermediate-stop plates | Blue / white |
| New Lantao B2 family | White / black |
| New Lantao overnight routes | Black / yellow |

Joint KMB/Citybus routes use the applicable tunnel category: 171 is red/white, rather than an invented purple. LWB/Citybus joint routes use the Long Win plate variant; the other operator's physical signs may differ. Citybus 314 and 629 do not become cross-harbour services merely because they start with 3 or 6. Citybus 701S/796S and KMB 270S/271S/293S retain ordinary plate styles despite operating late. Citybus B4/B6 are not assigned the red border-route style of B3/B5/B7/B8/B14/B15. KMB's September 2026 notice confirms 600X uses the Eastern Harbour Crossing, so it uses red/white. Citybus 382 uses different tunnels depending on direction; its sign colour is left unverified rather than guessed. These exceptions are cross-checked with the catalogue and current operator notices where available.

No single physical sign design is verified for every Discovery Bay, Ma Wan, cross-boundary, resident or sightseeing service. Those cases use a neutral white/black badge and grey map line, rather than an invented operator colour. New Lantao terminal signs can differ from intermediate-stop signs. Existing non-bus mode colours are outside this change.

Badges apply both the background and number colour. Maps use a visible representative colour, choosing black for white plates. Directions, station departures and the legacy minimap share the same function. Sorting, scoring and fare calculations do not use these display colours.

## References

- Route-number colour table and route-category exceptions: https://zh.wikipedia.org/wiki/香港巴士路線編號#路線編號顏色
- Stop-plate and sign-generation details: https://hkbus.fandom.com/wiki/路線牌
- Citybus service information and Cityflyer route identification: https://www.citybus.com.hk/routes/airport-bus/route/index.aspx
- Long Win route finder / current route identity: https://www.lwb.hk/tc/routeintroduction.html
- KMB 600X current routing: https://e.kmb.hk/news_detail.html?id=1463&year=2026
- Citybus 382 directional tunnel routing: https://www.citybus.com.hk/tc/uploadedPressRelease/21733_20250903_CHI.pdf
- Official route metadata: Transport Department GTFS, recorded in `src/data/transport/manifest.json`. The upstream `routes.txt` does not publish `route_color` or `route_text_color`; colours must not be described as imported official colour codes.
