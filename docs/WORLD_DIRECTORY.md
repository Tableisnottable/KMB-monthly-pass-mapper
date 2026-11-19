# Worldwide country directory

The selector includes 250 countries and territories, retaining the existing Hong Kong, Macao and Asian bookmark IDs. This is a geographic browsing directory, not a claim of worldwide journey planning or complete transit coverage.

New entries start at a labelled country/territory centre. Users can move the map and load a small local extract. Existing Asian city shortcuts remain available. Public OpenStreetMap data provides only mapped local roads, transport segments and stops; availability varies. No account, key or paid API is required.

Country metadata: [mledoze/countries](https://github.com/mledoze/countries), [ODbL 1.0](https://github.com/mledoze/countries/blob/master/LICENSE), retrieved 2026-11-20. `src/domain/worldRegions.json` is the compact derived database. Refresh with `node scripts/import-world-regions.mjs`; Chinese names use the runtime's Traditional Chinese region names. Preserve this attribution when redistributing the derived database.

Map database: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL 1.0. Browser CORS requests are preferred; the same-origin streaming proxy is a fallback. Extracts are cached locally for one day. No country bulk downloads or polling are performed.

The ticket country filter includes all regions. The verified catalogue currently has 69 products in seven regions; unlisted countries display an empty state and allow manual recording. Only the KMB Monthly Pass has implemented pricing rules. Other tickets record ownership only. See [TRAVEL_PASSES.md](TRAVEL_PASSES.md) for products and official sources.
