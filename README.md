# Transit Compass HK

Transit Compass HK is a Hong Kong multimodal journey-planning prototype. It combines a map-first interface, free-text place search, official public transport data, traffic information, and a transparent route-scoring engine in a single Next.js application.

The product is intentionally operator-neutral. KMB, LWB, MTR, and Citybus names can appear as transport operators or data sources, but no operator logo, visual identity, or commercial product is used as the product brand or primary selling point.

## What the prototype does

- Searches arbitrary Hong Kong landmarks, estates, streets, addresses, and stations instead of requiring saved-place names.
- Keeps origin and destination fields empty by default so the user always starts with an intentional search.
- Provides a Citymapper-inspired information hierarchy without copying Citymapper branding, code, assets, or protected content.
- Displays route cards with journey duration, transfers, walking time, operator metadata, fare estimates, scheduled intervals, and ETA status.
- Provides official KMB and Citybus route/stop catalogues and ETA proxy endpoints.
- Provides a place-search proxy backed by OpenStreetMap Nominatim.
- Provides traffic sources, traffic alerts, route updates, calendar export, saved-place UI, and English content at `/en`.
- Supports a Cloudflare Workers deployment through OpenNext.

## Product surfaces

| Path | Purpose |
| --- | --- |
| `/` | Traditional Chinese map-first journey-planning homepage |
| `/en` | English product surface |
| `/traffic` | Traffic and disruption information |
| `/updates` | Route and service update information |
| `/api/places` | Hong Kong free-text geocoding proxy |
| `/api/transit` | KMB and Citybus route, stop, and ETA proxy |
| `/api/eta` | ETA lookup endpoint with operator/route allowlisting |
| `/api/routes` | Prototype scored-route response |
| `/api/traffic` | Traffic information response |
| `/api/updates` | Service update response |
| `/api/sources` | Data-source catalogue |

The current route search is a production-shaped prototype rather than a complete door-to-door geospatial router. The UI and API boundaries are ready for a future routing provider or an in-house pathfinding layer to supply fully connected multimodal itineraries.

## Architecture

```text
Browser
  |
  +-- Next.js App Router pages and client components
  |     +-- JourneyPlaceSearch
  |     +-- PlaceAutocomplete
  |     +-- LiveTransitSearch
  |     +-- GoogleMapPanel
  |     +-- route cards, traffic, updates, calendar UI
  |
  +-- Next.js route handlers
  |     +-- /api/places  -> OpenStreetMap Nominatim
  |     +-- /api/transit -> official KMB / Citybus APIs
  |     +-- /api/eta     -> approved ETA upstreams
  |     +-- /api/routes  -> scoring prototype
  |
  +-- Domain and data modules
        +-- UpgradedScoringEngine
        +-- monthly-pass calculations
        +-- traffic sources and alerts
        +-- official transit adapters
```

Important implementation locations:

```text
src/
  app/
    page.tsx                         Main map-first homepage
    en/page.tsx                      English page
    components/                      Search, map, traffic, calendar, and route UI
    api/                             Server-side API route handlers
  data/
    hkTransitApi.ts                  KMB and Citybus upstream adapters
    hkTrafficSources.ts              Traffic source catalogue
    trafficAlerts.ts                 Route alert data
  domain/
    monthlyPass.ts                   Monthly-pass and fare insight helpers
  engine/
    UpgradedScoringEngine.ts         Route scoring and fare calculation
  lib/
    cloudflare.ts                    Optional Cloudflare binding access
```

## Route scoring model

The engine uses a lower-score-is-better model:

```text
Final score
  = sum(segment scores)
  + walking transfer time
  + long-distance transfer surcharge
  + (transfer count * 8)
```

Each segment is calculated as:

```text
Segment score
  = journey time
  + ETA/wait component
  + operator adjustment
```

### Time-of-day multiplier

The multiplier is selected from the supplied `Date`:

| Period | Hong Kong time | Multiplier |
| --- | --- | ---: |
| Peak | 07:00-09:30 and 17:00-19:30 | `1.0` |
| Off-peak | All other daytime periods | `1.3` |
| Overnight | 23:00-05:50 | `1.8` |

The engine currently uses the JavaScript `Date` object supplied by the caller. Callers should construct dates in the intended Hong Kong time context, or normalize time handling at the application boundary.

### ETA handling

- A live `realtimeEta` with `isLive: true` replaces the scheduled wait calculation.
- Legacy `realtimeEtaMinutes` values are accepted only when `isEtaFresh` is true.
- Otherwise, the engine estimates waiting cost as:

```text
scheduled interval * 0.5 * time-of-day multiplier
```

The UI must not label fallback or demo values as live ETA. API responses expose metadata indicating whether the upstream response is live.

### Operator adjustments

| Operator | Adjustment |
| --- | ---: |
| KMB | `-1.00` |
| LWB | `-0.46` |
| MTR | `+0.50` |
| CTB | `+1.00` |

These values are product-ranking weights, not claims about service quality or an operator endorsement.

### Fare and BBI prototype

`calculateFare` totals the supplied leg fares and applies a maximum `HK$4.20` discount to each adjacent pair of legs operated by the same operator. It returns:

- `discountedFare`
- `bbiDiscountApplied`

This is a transparent prototype rule, not a legal or fare-guarantee calculation. Fare policy, interchange eligibility, payment medium, route exceptions, and effective dates should be verified against the latest official operator information before production use.

## Data sources and attribution

The server-side adapters currently use:

- KMB Data API: `https://data.etabus.gov.hk/v1/transport/kmb`
- Citybus real-time API: `https://rt.data.gov.hk/v2/transport/citybus`
- OpenStreetMap Nominatim: `https://nominatim.openstreetmap.org`
- Google Maps links for optional external map handoff and user navigation
- Hong Kong traffic and transport source links maintained in `src/data/hkTrafficSources.ts`

The application proxies upstream calls through Next.js route handlers so that client components do not need to know upstream URL formats. Responses include source metadata where applicable.

### Upstream behaviour

- Transit catalogue responses are cached for approximately 60 seconds.
- Place-search responses are cached for approximately 5 minutes.
- ETA responses are returned with `no-store`.
- Upstream failures are surfaced as `502` responses rather than being silently converted into fake live data.
- Cloudflare rate limiting is used when the `RATE_LIMITER` binding is available.
- Local development continues without Cloudflare bindings through `src/lib/cloudflare.ts`.

## API examples

### Search for a place

```text
GET /api/places?q=Central%20Hong%20Kong
```

Successful responses contain:

```json
{
  "data": [
    {
      "id": "123",
      "name": "Central",
      "address": "Central, Hong Kong",
      "lat": 22.2819,
      "lng": 114.1581,
      "type": "suburb",
      "googleMapsUrl": "https://www.google.com/maps/search/?api=1&query=22.2819%2C114.1581"
    }
  ],
  "meta": {
    "provider": "OpenStreetMap Nominatim",
    "region": "HK"
  }
}
```

### Load an operator route catalogue

```text
GET /api/transit?operator=KMB&resource=routes
GET /api/transit?operator=CTB&resource=stops
```

### Request an ETA

```text
GET /api/transit?operator=KMB&stop=stop-id&route=234X
```

The endpoint returns the upstream ETA data with operator and source metadata.

## Local development

### Requirements

- Node.js 20.19+ or Node.js 22+
- npm
- Network access for official transit, geocoding, and traffic upstreams

Some dependencies may warn when used with earlier Node 20 patch releases. Use the current LTS line for the most predictable Next.js and Cloudflare tooling behaviour.

### Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Validate a production build

```bash
npm run build
npm run start
```

### Available scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Create and type-check the production build |
| `npm run start` | Serve the built Next.js application |
| `npm run lint` | Run the repository lint command |
| `npm run cf:build` | Build the OpenNext Cloudflare worker |
| `npm run cf:preview` | Build and run a local Wrangler preview |
| `npm run cf:deploy` | Build and deploy with Wrangler |

## Environment configuration

Copy `.env.example` to `.env.local` when you want to customize the optional map embed:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_GOOGLE_MAPS_EMBED_URL=https://www.google.com/maps?q=Hong+Kong&output=embed
```

If `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_URL` is not set, the application uses its Hong Kong map fallback and still provides external Google Maps links for selected places. Do not commit credentials, API keys, or private endpoints.

## Cloudflare deployment

The project uses OpenNext to produce a Cloudflare-compatible worker. `wrangler.jsonc` defines the worker entry point, static asset binding, and optional rate limiter binding.

```bash
npm install
npm run cf:build
npx wrangler login
npm run cf:deploy
```

For local Cloudflare-runtime validation:

```bash
npm run cf:preview
```

The deployment environment should provide the configured `RATE_LIMITER` binding if production rate limiting is required. Without it, the application remains functional but runs without the Cloudflare-backed limiter.

## Design and data-use principles

- Use Transit Compass HK as the product identity.
- Do not use KMB, Citybus, MTR, LWB, Google Maps, OpenStreetMap, or Citymapper logos as the product logo.
- Treat operator names as metadata and attribution, not as a product selling point.
- Keep user-entered origin and destination fields blank until the user chooses a place.
- Never present mock or stale values as live ETA.
- Keep provider attribution and external-link behaviour visible where required.
- Respect the terms, rate limits, attribution requirements, and licensing conditions of every upstream provider.

## Current limitations and next steps

This repository is a prototype and has several deliberate boundaries:

1. `/api/routes` currently returns a small scored-route fixture. It is not yet a complete route graph or journey planner.
2. The scoring engine ranks routes supplied to it; it does not discover all possible paths between arbitrary coordinates.
3. BBI handling is a simplified same-operator prototype and should be replaced with a dated, route-aware fare ruleset before production.
4. Place search depends on Nominatim availability and its usage policy.
5. Map embedding and external map links depend on third-party browser and network policies.
6. Traffic alerts and source catalogues should be connected to a maintained data refresh process for production.

The most direct production roadmap is to add a route-graph service, normalize all operator stop geometries, connect stop-to-stop transfers, add robust fare-rule versioning, and introduce integration tests against recorded upstream response fixtures.

## License and third-party services

This repository is private application code unless the repository owner publishes a separate license. Third-party services and datasets remain subject to their own terms:

- KMB and Citybus data are provided by their respective official transport APIs.
- OpenStreetMap data and Nominatim usage are subject to the OpenStreetMap Foundation policies and attribution requirements.
- Google Maps links and embeds are subject to Google Maps Platform terms.
- Next.js, React, Tailwind CSS, OpenNext, Wrangler, and other dependencies retain their respective licenses.
