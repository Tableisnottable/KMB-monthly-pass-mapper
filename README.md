# Transit Compass HK / 香港出行地圖

> 香港多模式公共交通導航原型 / Hong Kong multimodal public-transit journey-planning prototype

Transit Compass HK 是一個香港多模式交通導航 prototype，提供地圖優先搜尋、自由地點搜尋、官方交通資料、交通警示、路線比較及透明評分引擎 / Transit Compass HK is a Hong Kong multimodal transit prototype with map-first search, free-text place search, official transit data, traffic alerts, route comparison, and a transparent scoring engine.

產品採用中立 operator-neutral branding；KMB、LWB、MTR 及 Citybus 只會作為營辦商 metadata、route information 或 data-source attribution，不會使用交通公司 logo、品牌視覺或商業產品作為本產品 identity 或主要 selling point / The product is operator-neutral; KMB, LWB, MTR, and Citybus appear only as operator metadata, route information, or source attribution, never as the product identity or primary selling point.

## Product scope / 產品範圍

### Journey workspace / 行程介面

The main page and `/en` share a Citymapper-style web workspace: a green search/results sidebar, an edge-to-edge interactive map, compact journey rows, and a full journey detail view. Start and End stay empty until the user chooses places, and planning starts automatically once both are selected. Locations can also be picked on the map. Mobile uses Show Map / Back to journeys controls. The interface retains the independent Transit Compass identity, original artwork, system fonts and OpenStreetMap tiles; it does not use Citymapper's proprietary assets, map service or backend.

The planner supports Now, Leave at and Arrive by, with editable dates/times explicitly in Hong Kong (UTC+8). Arrive-by uses a backwards timetable search and reports the actual suggested departure and arrival. Scheduled trips never use current live ETAs. Switching cities, cycling and taxi routing remain disabled. The menu contains the existing station-arrival lookup, traffic/update links and weighting explanation. Journey details retain the score breakdown and monthly-pass estimate.

Enhanced weighting version 2 uses ride time + actual wait × time multiplier + walking × 1.35 + 8 per transfer + normal adult fare × 0.45 + 4 per unverified service leg, retaining the operator adjustments. A separate broad direct/one-transfer scan preserves cheaper feeders alongside bounded deeper searches. The results board offers up to 40 diverse alternatives; Show all expands beyond the first 12. `/api/journey` searches the imported public-transport graph with up to three transfers. The 2026-11-13 snapshot contains 2,487 routes/variants and 9,626 stops: KMB, Long Win, Citybus and joint services, New Lantao Bus, MTR Bus, Discovery Bay and Ma Wan buses, published cross-boundary coaches, green minibuses, ferries, Hong Kong Tramways, Peak Tram, MTR and Light Rail. These are the networks in the official feeds, not a claim that every private service or live feed exists.

Direct journeys with the same physical boarding and alighting stops appear in one expandable card. Feeder alternatives joining the same onward services and final stop are also combined, with different boarding/transfer stops explicitly indicated. Transport modes, leg counts and service availability remain separate. The card shows the minimum–maximum adult fare and duration across its choices; equal fares display once. Expanding preserves each complete journey's exact fares, times, transfer stops, score and selectable map path. Missing fares remain explicit and full-fare estimates remain upper bounds. Route numbers are combined by leg only when every displayed combination exists among the actual results.

Combined cards use a blue tint and a label; the selected map journey has a green highlight and remains identified when returning from its details. Opening an unselected combined card previews its first choice on the map; reopening the selected group preserves its current individual choice. Results can be sorted by weighted recommendation, fastest, cheapest, fewest transfers or least walking. Sorting applies to cards and the choices inside them without changing any score, and unknown fares are placed last for cheapest sorting. Harbour 1xx/3xx/6xx badges mix red route numbers with company-coloured icons; 9xx/X9xx use green route numbers. Joint harbour icons include both company colours, and maps follow the route colour. Known local and mixed-tunnel exceptions retain company colours. Other bus badges use company display colours. N/NA night-bus routes use black badges and map lines with white text and icons, including joint night routes. Other joint services show both companies: the number follows the first company and the icon follows the second. Their maps use the first company colour. See `docs/route-colours.md`. Catalogue operator identity is retained separately from the existing weighting operator.

Displayed journey minutes are separate from weighted scores. They include stop-to-stop run times, access/transfer walking and predicted or scheduled waiting. KMB/LWB, Citybus, MTR, Light Rail and green minibus live arrivals enrich the initial boarding where a fresh matching prediction is available. Later connections use published timetables or estimates; connections are rechecked after the initial live arrival changes. Rail run times/headways are estimates; rail service is explicitly unverified when the live feed cannot confirm it. TD intermediate stop times are interpolated between published timepoints. A required leg with no upcoming connection is marked unavailable.

`/timetables` (English: `/timetables?lang=en`) lists government-provided company/network names and lets users browse all 82,282 imported timetable records: 5,991 fixed departures and 76,291 frequency windows across 3,648 scheduled patterns. Select company, route, direction/variant, boarding stop and Hong Kong service date. The view preserves weekday/holiday calendars, added/cancelled calendar exceptions, exclusive frequency ends and after-midnight times. Headway windows are not presented as exact departure slots. Intermediate stop times are labelled estimates. MTR/Light Rail topology has no complete published timetable in the imported sources, so that gap remains explicit. Government `agency.txt` groups some minibus, ferry, cross-boundary and residents' services; these are not invented individual-company names.

Station arrivals retain all available provider predictions, including live trips outside the scheduled service windows, without the old 24-route / 90-minute filtering. Each departure links to its full timetable. `(Added)` / `（新增）` identifies a provider-marked extra or a live prediction outside all compatible imported timetable windows, allowing 15 minutes of ETA drift at terminals and 20 minutes at intermediate stops. The tooltip distinguishes these reasons: a mismatch can also be a delay or a timetable update. Missing schedules or dates outside calendar coverage are not inferred as added. Joint KMB/Citybus and Long Win/Citybus services query both providers independently. Journey rows and details retain the first reachable prediction's added label.

Published normal adult OD fares are retained, including sectional fares and adult Octopus MTR, Airport Express and Light Rail fares. Paid-area rail line changes share one OD fare. No same-operator discount is assumed. If only a full-route fare is known, it is clearly marked as an upper bound; missing fares are never shown as Free. Monthly-pass analysis remains a separate prototype estimate. The map uses 3,429 official TD/CSDI bus/minibus road alignments and OpenStreetMap tracks/water routes, with OSRM walking paths and road fallback constrained through ordered stops. Missing geometry is hidden rather than replaced with straight chords. Walking durations remain estimates; paths do not certify step-free accessibility or temporary closures. Red minibuses, taxis, Ngong Ping 360 and private services absent from the imported fixed-route feeds are not included. See `/coverage` and `/api/network?resource=coverage` for counts, attribution and limits.

Map tiles use OpenStreetMap with visible attribution. No map API key is required. Place search and official transit upstreams still require network access. Arrivals and timetable browsing support Traditional Chinese and English.

- 搜尋香港地標、商場、屋苑、街道、地址及車站，不要求預先儲存地點 / Search Hong Kong landmarks, malls, estates, streets, addresses, and stations without requiring saved places.
- 起點及目的地預設為空白，讓每次 journey 都由使用者主動開始 / Keep origin and destination blank by default so every journey starts with an intentional user search.
- 使用清晰的 map-first route-planning layout，但不複製 Citymapper branding、code、assets 或 protected content / Use a clear map-first route-planning layout without copying Citymapper branding, code, assets, or protected content.
- 顯示 journey time、transfer count、walking time、operator、fare、scheduled interval、ETA status 及 route alerts / Display journey time, transfer count, walking time, operator, fare, scheduled interval, ETA status, and route alerts.
- 接入 KMB 及 Citybus official route、stop、ETA APIs，並以 server-side proxy 保護 client boundary / Connect to official KMB and Citybus route, stop, and ETA APIs through server-side proxies.
- 使用 OpenStreetMap Nominatim 提供香港 free-text place search，並提供 external Google Maps handoff / Use OpenStreetMap Nominatim for Hong Kong free-text place search with external Google Maps handoff links.
- 提供 traffic sources、service alerts、route updates、calendar export、saved-place UI 及 English page `/en` / Provide traffic sources, service alerts, route updates, calendar export, saved-place UI, and an English page at `/en`.
- 支援以 OpenNext 部署至 Cloudflare Workers / Support deployment to Cloudflare Workers through OpenNext.

## Routes and APIs / 頁面與 API

| Path 路徑 | Purpose 用途 |
| --- | --- |
| `/` | 繁體中文 map-first journey planner / Traditional Chinese map-first journey planner |
| `/en` | English product surface / 英文產品頁面 |
| `/traffic` | 交通及服務受阻資訊 / Traffic and service disruption information |
| `/updates` | 路線及服務更新 / Route and service updates |
| `/timetables?lang=en` | Government companies/networks and complete published service-day timetables |
| `/api/network?resource=operators` | Source-provided bilingual operator names, coverage counts and official links |
| `/api/network?resource=timetable&route=…&date=YYYY-MM-DD` | All published windows for a route variant and boarding stop on a Hong Kong service day |
| `/api/places` | 香港地點 geocoding proxy / Hong Kong place geocoding proxy |
| `/api/transit` | KMB 及 Citybus routes、stops、ETA proxy / KMB and Citybus route, stop, and ETA proxy |
| `/api/eta` | Allowlisted ETA lookup / 受 allowlist 限制的 ETA 查詢 |
| `/api/routes` | Prototype scored-route response / 原型評分路線回應 |
| `/api/journey` | Coordinate-based multimodal journeys, up to 3 transfers, ranked by the existing weighted engine; optional `lang=en` |
| `/coverage` | Bilingual transport coverage, sources and limitations |
| `/api/network` | Imported coverage, route/stop search and live-or-timetable departures |
| `/api/traffic` | Traffic information response / 交通資訊回應 |
| `/api/updates` | Service update response / 服務更新回應 |
| `/api/sources` | Data-source catalogue / 資料來源清單 |

目前 route search 是 production-shaped prototype，具備清晰 API boundaries，但尚未成為完整 door-to-door geospatial router / The current route search is a production-shaped prototype with clear API boundaries, not yet a complete door-to-door geospatial router.

`/api/journey` searches the imported graph; `/api/routes` remains a separate small scoring demonstration. The search keeps a bounded set of time/score labels per stop and round; it does not enumerate every possible path. Direction, pickup/drop-off restrictions, Hong Kong calendar dates, holiday exceptions, frequency windows and previous-day GTFS times above 24:00 are applied. Known timetable waits longer than half a published headway use an equivalent interval as the existing scoring engine's input, so a service starting in an hour is not scored as an immediate five-minute-frequency service. The published headway and estimated wait remain separate metadata.

### Refresh the public transport snapshot

The generated snapshot is checked in so place/route search works without downloading raw archives at runtime. Every generated file is below 900,000 bytes. Keep the raw cache **outside** the repository; do not commit GTFS ZIPs, `node_modules` or build output.

```powershell
# Python 3; pyproj is used only to convert official railway coordinates.
python -m pip install --target C:\transport-cache\python-libs pyproj==3.8.0
npm run data:transport -- --cache C:\transport-cache
# Redownload source archives on a later refresh:
npm run data:transport -- --cache C:\transport-cache --refresh
```

The importer downloads bilingual Transport Department GTFS, MTR/Light Rail topology and MTR adult Octopus fares. It caches exact station/access records from the Lands Department Location Search API, throttled to about one request per second, and converts EPSG:2326 to EPSG:4326. Unresolved station matches fail the import instead of using an unrelated location. Generated data preserves all service windows/calendars and all published fare pairs, grouped compactly by boarding stop and price. Source-owned data and topology can change; refresh and verify before a public deployment.

`/api/network?resource=routes&operator=GMB&q=69`, `resource=stops&q=Mui%20Wo`, and `resource=departures&stop=mtr%3A18&lang=en` expose the catalogue and departure lookup. Search responses are bounded (`limit` up to 500); the complete snapshot remains in `src/data/transport/`. `/api/transit` retains the legacy KMB/Citybus proxy for compatibility.

## Architecture / 系統架構

```text
Browser / 瀏覽器
  |
  +-- Next.js App Router pages + client components
  |     +-- JourneyPlaceSearch / PlaceAutocomplete
  |     +-- LiveTransitSearch / GoogleMapPanel
  |     +-- route cards、traffic、updates、calendar UI
  |
  +-- Next.js route handlers
  |     +-- /api/places  -> OpenStreetMap Nominatim
  |     +-- /api/transit -> KMB / Citybus official APIs
  |     +-- /api/eta     -> approved ETA upstreams
  |     +-- /api/routes  -> scoring prototype
  |
  +-- Domain and data modules / 領域及資料模組
        +-- UpgradedScoringEngine
        +-- monthly-pass and fare calculations / 月票及車費計算
        +-- traffic sources and service alerts / 交通來源及服務警示
        +-- official transit adapters / 官方交通 adapters
```

主要 source locations 包括以下檔案 / Important source locations include:

```text
src/
  app/page.tsx                         Main map-first homepage / 地圖優先首頁
  app/en/page.tsx                      English page / 英文頁面
  app/components/                      Search、map、traffic、calendar、route UI
  app/api/                             Server-side API route handlers / 伺服器 API handlers
  data/hkTransitApi.ts                 KMB and Citybus upstream adapters
  data/hkTrafficSources.ts             Hong Kong traffic source catalogue
  domain/monthlyPass.ts                Monthly-pass and fare insight helpers
  engine/UpgradedScoringEngine.ts     Route scoring and BBI prototype
  lib/cloudflare.ts                    Optional Cloudflare binding helper
```

## Scoring engine / 路線評分引擎

評分採用 lower-score-is-better model，即分數越低代表 estimated journey cost 越低 / The engine uses a lower-score-is-better model, where a lower score represents a lower estimated journey cost:

```text
Final score
  = sum(segment scores)
  + walking transfer time * 1.35
  + long-distance transfer surcharge
  + (transfer count * 8)
  + normal adult fare * 0.45
  + unverified service legs * 4
```

每個交通段的計算方式是 journey time 加上 ETA/waiting cost 及 operator adjustment / Each segment score combines journey time, ETA or waiting cost, and the operator adjustment:

```text
Segment score
  = journey time
  + ETA or waiting cost
  + operator adjustment
```

### Time multipliers / 時段倍率

| Period 時段 | Hong Kong time 香港時間 | Multiplier 倍率 |
| --- | --- | ---: |
| Peak / 繁忙時段 | 07:00-09:30 and 17:00-19:30 / 早上及傍晚繁忙時段 | `1.0` |
| Off-peak / 非繁忙時段 | Other daytime periods / 其他日間時段 | `1.3` |
| Overnight / 深夜時段 | 23:00-05:50 / 深夜至清晨 | `1.8` |

### Operator adjustments / 營辦商調整值

| Operator 營辦商 | Adjustment 調整值 |
| --- | ---: |
| KMB / 九巴 | `-1.00` |
| LWB / 龍運 | `-0.46` |
| MTR / 港鐵 | `+0.50` |
| CTB / Citybus 城巴 | `+1.00` |

Waiting uses a reachable fresh live arrival minus access walking, or the actual published departure gap, multiplied by the Hong Kong time-of-day multiplier. Half the headway is only a fallback when no actual gap is available. The API normalizes all times to Hong Kong independently of server/browser timezone.

### Normal adult fares

`calculateFare` sums the published adult leg fares. Paid-area MTR/Light Rail changes are combined into one published OD fare before scoring. The planner uses adult Octopus rail fares and normal adult fares for other modes; it does not invent interchange offers, concessions or pass discounts. `discountedFare` retains its existing API field name but is the undiscounted normal adult total; `bbiDiscountApplied` is zero. Full-fare fallbacks are marked as upper bounds. Operator-specific interchange rules and pass eligibility still need a dated, verified ruleset.

## Data sources and API behaviour / 資料來源及 API 行為

目前使用的 upstream services 包括 / Current upstream services include:

- KMB Data API: `https://data.etabus.gov.hk/v1/transport/kmb`
- Citybus Real-time API: `https://rt.data.gov.hk/v2/transport/citybus`
- OpenStreetMap Nominatim: `https://nominatim.openstreetmap.org`
- Google Maps external links and optional map embed / Google Maps 外部連結及可選 map embed
- `src/data/hkTrafficSources.ts` maintained traffic links / 維護中的香港交通來源

API route handlers 會代理 upstream calls，令 client 不需知道 upstream URL format / API route handlers proxy upstream calls so client components do not depend on upstream URL formats:

- Route and stop catalogues 約快取 60 秒 / cache for approximately 60 seconds。
- Place search 約快取 5 分鐘 / caches for approximately 5 minutes。
- ETA 使用 `no-store` / uses `no-store` to avoid stale results。
- Upstream failure 回傳 `502` / returns `502`，不會轉成 fake live data / rather than silently creating fake live data。
- 有 `RATE_LIMITER` binding 時使用 Cloudflare rate limiting / Cloudflare rate limiting is used when the binding is available。
- Local runtime 沒有 binding 時仍可運行 / local runtime continues without the binding through `src/lib/cloudflare.ts`。

Citybus live-arrival matching uses a route/stop snapshot from the official Citybus API, including airport and local services. Refresh both matching catalogs together with `npm run data:citybus`. The importer checks every referenced stop, retries upstream failures, and refuses to write incomplete or oversized snapshots (maximum 1 MB per generated file). Journey discovery uses the broader imported multimodal graph and enhanced weighting described above; a missing ETA does not remove a known timetable connection.

Place suggestions also match official Citybus stop names, including when geocoding fails. Airport searches offer the ground transport centre before the aerodrome's polygon centre; the original geocoded landmark remains selectable.

## API examples / API 使用例子

### Place search / 地點搜尋

```text
GET /api/places?q=Central%20Hong%20Kong
```

Response shape / 回應格式：

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

### Transit catalogue and ETA / 交通資料及 ETA

```text
GET /api/transit?operator=KMB&resource=routes
GET /api/transit?operator=CTB&resource=stops
GET /api/transit?operator=KMB&stop=stop-id&route=234X
```

`operator` 目前接受 `KMB` 或 `CTB` / `operator` currently accepts `KMB` or `CTB`。

`resource` 接受 `routes` 或 `stops`；同時提供 `stop` 及 `route` 時，endpoint 會查詢所選官方 provider 的 ETA / `resource` accepts `routes` or `stops`; when both `stop` and `route` are supplied, the endpoint requests ETA from the selected official provider.

## Local development / 本機開發

### Requirements / 系統需求

- Node.js `20.19+` 或 Node.js `22+` / Node.js `20.19+` or Node.js `22+`
- npm package manager / npm 套件管理器
- Network access to official transit、geocoding and traffic upstreams / 需要連接官方交通、地點及交通資訊服務

Install and run / 安裝及啟動：

```bash
npm install
npm run dev
```

開啟 `http://localhost:3000`，測試 place search、route UI 及 operator catalogue loading / Open `http://localhost:3000` to test place search, route UI, and operator catalogue loading.

Production validation / Production build 驗證：

```bash
npm run build
npm run start
```

Available scripts / 可用指令：

| Script 指令 | Description 用途 |
| --- | --- |
| `npm run dev` | Start Next.js development server / 啟動開發伺服器 |
| `npm run build` | Build and type-check production output / 建立及檢查 production build |
| `npm run start` | Serve the production build / 啟動 production build |
| `npm run lint` | Run repository lint command / 執行 repository lint |
| `npm run cf:build` | Build OpenNext Cloudflare worker / 建立 Cloudflare worker |
| `npm run cf:preview` | Build and run Wrangler preview / 建立並啟動 Wrangler 預覽 |
| `npm run cf:deploy` | Build and deploy with Wrangler / 建立並使用 Wrangler 部署 |

## Environment and Cloudflare / 環境變數及 Cloudflare

複製 `.env.example` 至 `.env.local` / Copy `.env.example` to `.env.local`：

```bash
cp .env.example .env.local
```

Optional Google Maps embed / 可選 map embed：

```env
NEXT_PUBLIC_GOOGLE_MAPS_EMBED_URL=https://www.google.com/maps?q=Hong+Kong&output=embed
```

未設定時，系統使用 Hong Kong map fallback 並仍提供 external Google Maps links / If unset, the application uses a Hong Kong map fallback and still provides external Google Maps links.

不要提交 credentials、API keys 或 private endpoints / Do not commit credentials, API keys, or private endpoints.

Cloudflare deployment / Cloudflare 部署：

Use Node.js 22.12 or newer (`.node-version` pins major 22 for hosted builds).
For the existing Cloudflare Workers Git build, use repository root `/`,
build command `npm run cf:build`, deploy command `npx opennextjs-cloudflare deploy`,
and production branch `main`. Do not use a static Pages export: the route planner
needs its server API routes. The configured Worker name is `kmb-monthly-pass-mapper`.

`cf:build` stages the original full-resolution road and track chunks under
`.open-next/assets/__alignments/`. The Worker loads them through its `ASSETS`
binding, keeping geometry out of the compressed script without simplifying it.
Local Next.js uses the same source chunks directly. Deploy the staged assets
together with the Worker; `.open-next` remains ignored by Git.

```bash
npm ci
npm run cf:build
npx wrangler login
npm run cf:deploy
```

Joint-operated bus services show a compact dark arrivals board in station results
and journey details: each live prediction has its Hong Kong clock time, minutes
remaining and actual company. Both companies are interleaved chronologically,
without combining opposite directions or different boarding stops. Missing live
data stays explicitly unavailable; published headways are not fabricated arrivals.

`wrangler.jsonc` 定義 worker entry point、static asset binding 及 optional `RATE_LIMITER` binding / `wrangler.jsonc` defines the worker entry point, static asset binding, and optional `RATE_LIMITER` binding.

## Branding and data-use principles / 品牌及資料使用原則

- 使用 Transit Compass HK 作為產品 identity / Use Transit Compass HK as the product identity。
- 不使用 KMB、Citybus、MTR、LWB、Google Maps、OpenStreetMap 或 Citymapper logo 作為產品 logo / Do not use their logos as the product logo。
- Operator names 只作 metadata、route information 及 attribution，不作 selling point / Operator names are metadata and attribution, not the product selling point。
- Origin and destination 預設保持空白，直到使用者主動選擇地點 / Keep both fields blank until the user actively selects places。
- 不把 mock、fallback 或 stale data 標示為 live ETA / Never label mock, fallback, or stale data as live ETA。
- 保留 required source attribution 及 external links / Keep required source attribution and external links visible。
- 遵守每個 upstream provider 的 terms、rate limits、licensing 及 attribution requirements / Respect each provider's terms, rate limits, licensing, and attribution requirements。

## Current limitations and roadmap / 目前限制及 roadmap

1. `/api/routes` 目前回傳小型 scored-route fixture，並非 complete route graph / currently returns a small scored-route fixture, not a complete route graph。
2. Multimodal search is bounded to three transfers and a limited set of labels/alternatives. Rail timings/headways and walking durations are estimated. Topology-only rail searches use conservative estimated 06:00–00:00 terminal windows, explicitly unverified; these are not official first/last-train times. No claim of exhaustive path discovery is made.
3. Normal adult totals exclude unverified interchange offers. A full published fare is used as an upper bound when sectional pricing is missing; monthly-pass coverage remains a separate prototype model.
4. Place search 依賴 Nominatim availability 及 usage policy / depends on Nominatim availability and usage policy。
5. Map embed 及 external links 受第三方 browser/network policies 影響 / depend on third-party browser and network policies。
6. Traffic alerts 及 source catalogues 需要 maintained refresh process / require a maintained data-refresh process。

Recommended next steps / 建議後續工作：

- Add verified accessibility and temporary-closure information to physical route geometry.
- Add published rail journey times, full rail operating calendars and additional operator live feeds where available.
- Introduce versioned fare rules and effective dates / 加入版本化 fare rules 及生效日期。
- Add recorded upstream fixtures and integration tests / 加入 recorded upstream fixtures 及 integration tests。
- Add observability for upstream latency、rate limits and stale-data detection / 加入 upstream latency、rate-limit 及 stale-data observability。

## License and third-party services / 授權及第三方服務

除非 repository owner 另行發布 license，否則本 repository 視為 private application code / This repository is private application code unless the repository owner publishes a separate license.

- KMB and Citybus data 受各自 official API terms 約束 / are subject to their respective official API terms。
- OpenStreetMap data and Nominatim use 受 OpenStreetMap Foundation policies 及 attribution requirements 約束 / are subject to OpenStreetMap Foundation policies and attribution requirements。
- Google Maps links and embeds 受 Google Maps Platform terms 約束 / are subject to Google Maps Platform terms。
- Next.js、React、Tailwind CSS、OpenNext、Wrangler 及其他 dependencies 保留各自 licenses / retain their respective licenses。

## Alignment data and scheduling

The timetable route picker uses natural route-number order (1, 2, 2A, 10;
A10, A11; NR2, NR10), applied before pagination. Existing GTFS schedules remain
authoritative when a residents’ directory entry covers the same route.

Approved NR / HR / KR residents’ services are searchable at `/timetables`.
Refresh their bilingual directory with:

```powershell
python scripts/import-residents.py --cache C:/path/outside/repository/cache --refresh
```

Only compact directory metadata and official TD document URLs are committed.
Directory-only routes show the official timetable/fare/conditions PDF; they are
not assigned invented companies, fares, stop coordinates or service calendars,
and are not used for automatic journey planning. Existing GTFS-covered residents’
routes retain their machine-readable timetables and routing support.

`/updates` and `/traffic` now use the TD Special Traffic News XML feed, refreshed
at most once a minute per server process. They preserve source wording and
reference timestamps; these timestamps are not labelled as event start dates.
The updates page shows bus/minibus service notices; the traffic page shows road
incidents, works, closures and congestion. A mixed bus/road source message is
assigned to buses only, so no notice ID appears on both pages. Other transport
service announcements (such as rail and ferry notices) are excluded from these
two sections. Classification follows source-text keywords; the bus page links
to operator sites and does not claim complete coverage of operator notices. No
demo notices, inferred affected routes or invented severity are displayed.
Feed failure is distinct from an empty feed, and an earlier successful display
is explicitly marked as potentially outdated if a later refresh fails.

Import official road alignments and OpenStreetMap tracks/ferry ways with:

```powershell
python scripts/import-alignments.py --cache C:/path/outside/repository/cache
```

Install `osmium` in that cache's `python-libs` directory first. The importer downloads CSDI line features and the Geofabrik Hong Kong PBF into the external cache. Only compact derived chunks smaller than 890 KB are committed. Track data is ODbL 1.0; see `src/data/alignments/NOTICE.md`. Raw downloads, dependencies, logs and builds stay out of Git.

`/api/journey` accepts `timeMode=now|depart|arrive` and an explicit-offset ISO timestamp in `time` for scheduled modes. `/api/journey-geometry` loads physical paths for the selected result. The default public OSRM service is cached and serialized; production can set `OSRM_FOOT_URL` and `OSRM_CAR_URL` to private services. Road fallback follows roads through stops and may differ from the operator's exact alignment. Missing paths are reported and suppressed. Public service availability and per-process rate limiting are not a production SLA.
