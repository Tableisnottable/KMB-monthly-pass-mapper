# Transit Compass HK / 香港出行地圖

> 香港多模式公共交通導航原型 / Hong Kong multimodal public-transit journey-planning prototype

Transit Compass HK 是一個香港多模式交通導航 prototype，提供地圖優先搜尋、自由地點搜尋、官方交通資料、交通警示、路線比較及透明評分引擎 / Transit Compass HK is a Hong Kong multimodal transit prototype with map-first search, free-text place search, official transit data, traffic alerts, route comparison, and a transparent scoring engine.

產品採用中立 operator-neutral branding；KMB、LWB、MTR 及 Citybus 只會作為營辦商 metadata、route information 或 data-source attribution，不會使用交通公司 logo、品牌視覺或商業產品作為本產品 identity 或主要 selling point / The product is operator-neutral; KMB, LWB, MTR, and Citybus appear only as operator metadata, route information, or source attribution, never as the product identity or primary selling point.

## Quick start / 快速開始

Use **Node.js 22.12.0 or newer**, matching [package.json](package.json). From the repository root:

```powershell
npm ci
npm run dev
```

Open `http://localhost:3000` for Traditional Chinese or `http://localhost:3000/en` for English. The main journey map uses Leaflet and OpenStreetMap; no Google Maps key is required. Live arrivals, place search and map tiles require an internet connection.

The checked-in [transport manifest](src/data/transport/manifest.json) records a network import on November 13, 2026, with agency metadata refreshed on November 14, 2026. Those are snapshot dates, not a guarantee that fares, calendars or live feeds remain current. See local development and Cloudflare deployment below for the full setup.

## Product scope / 產品範圍

### Journey workspace / 行程介面

The main page and `/en` share a compact journey bar across the top: fare profile, Start / swap / End, departure or arrival time, and a row of filter buttons. Results and an interactive map fill the space below. Start and End stay empty until the user chooses places, and planning starts automatically once both are selected. Locations can also be picked on the map. Mobile stacks the endpoints and uses Show Map / Back to journeys controls. The interface retains the independent Transit Compass identity, system fonts and OpenStreetMap tiles; it does not use Citymapper's proprietary assets, map service or backend.

Transport, Roads, Change time and Importance open sections of one settings dialog. Changes are drafts until Apply; Cancel or Escape discards them. Apply recalculates a selected journey. Active filter buttons show counts or values. Reset clears transport type, company and road restrictions, re-enables walk/cycle/taxi/driving comparisons, restores a 3-minute minimum change and restores exact engine defaults; endpoints and fare profile stay selected. Minimum change time supports every whole minute from 0 through 60; 0 removes extra buffer but never the physical transfer walk. Transport groups cover every imported routing mode (bus, green minibus, MTR including Airport Express, Light Rail, tram, ferry and Peak Tram), plus separate switches to calculate/show walking, cycling, taxi and driving estimates. Company and transit type × / ／ / ✓ means Ban / Normal / Must, while roads use Ban / Normal / Must. Every Must company/type must appear, both filters apply together, and joint services need all their companies permitted. For roads, Must choices within a group are alternatives; separate groups with Must choices all apply. Banned transit types are excluded during graph search. Unsupported red minibuses and Ngong Ping 360 remain explicit; NR/HR/KR residents’ routes link to the existing document directory rather than fabricated routing. The company and comparison lists collapse to keep the menu manageable. Road bans prune travelled stop intervals during forward and reverse graph search, rather than banning a whole bus route or merely hiding its results. Ten road groups include harbour, Sha Tin, airport, northwest and northeast New Territories, Tseung Kwan O, Hong Kong Island, Kowloon, Sai Kung and Lantau. Unclassified roads, rail, ferries and standalone walk/cycle/taxi/driving estimates remain outside road filtering; this is not exhaustive road coverage. `scripts/import-corridors.py` records checkpoints and OSM way references and matches them to TD alignments.

The six main importance sliders default to **100%** and independently support **0–200%** of their exact original coefficients. Zero removes that weighted cost; 200% doubles it. They are not shares totalling 100%. Reset restores all six to 100% and the original scoring formula exactly. Advanced multipliers and company adjustments retain explicitly labelled raw values. The dialog warns that changes can favour slower, dearer or more complicated journeys without changing actual time/fare estimates.

Time limits add optional maximum transfers (0–3), total riding, total walking, waiting per boarding, and time per change (walking plus waiting). Blank means no additional personal cap beyond the existing bounded search. Limits prune forward/reverse searches and are checked again after live retiming. The minimum change buffer still supports 0–60 minutes. Restrictive settings may produce no transit results; independent walk/cycle/taxi/driving comparisons are outside these public-transport limits.

School search adds 3,022 unique Education Bureau school premises (snapshot November 14, 2026), with bilingual names, addresses and English initials such as `CSWCSS`. Exact names/initials work locally without an upstream geocoder. Initials are lookup aliases, not official names; ambiguous schools remain separate choices and points are not verified entrances. Run `npm run data:schools` to refresh the four compact source chunks; raw CSV is never saved or committed. The manifest and `/api/sources` record source links, rejected rows and combined sessions.

The planner supports Now, Leave at and Arrive by, with editable dates/times explicitly in Hong Kong (UTC+8). Arrive-by uses a backwards timetable search and reports the actual suggested departure and arrival. Scheduled trips never use current live ETAs. Walking, cycling and taxi tiles show separate street-profile route-time estimates, with unavailable paths kept explicit. Taxi prices remain metered, not fabricated estimates. The menu contains station-arrival lookup, traffic/update links and installation help. Journey details retain the score breakdown and monthly-pass estimate.

Enhanced weighting version 2 uses ride time + actual wait × time multiplier + walking × 1.35 + 8 per transfer + normal adult fare × 0.45 + 4 per unverified service leg, retaining the operator adjustments. A separate broad direct/one-transfer scan preserves cheaper feeders alongside deeper searches. The results board offers up to 40 diverse alternatives; Show all expands beyond the first 12. `/api/journey` has no configured maximum journey duration or transfer count; graph-cycle prevention and search pruning still apply for performance. The 2026-11-13 snapshot contains 2,487 routes/variants and 9,626 stops: KMB, Long Win, Citybus and joint services, New Lantao Bus, MTR Bus, Discovery Bay and Ma Wan buses, published cross-boundary coaches, green minibuses, ferries, Hong Kong Tramways, Peak Tram, MTR and Light Rail. These are the networks in the official feeds, not a claim that every private service or live feed exists.

Journeys combine only when **every leg has identical boarding and alighting stop IDs**, including all transfer stops. Nearby feeders with different stops stay separate. Transport modes, leg counts and service availability remain separate. Combined cards show minimum–maximum normal adult and selected fares, journey duration and walking time across their choices. Expanding preserves every actual journey's fares, times, score and selectable map. Missing fares remain explicit and full-fare estimates remain upper bounds. Route-number alternatives compress only when every displayed combination exists in the results.

Combined cards use a strong blue fill, navy stripe and label; selected combined cards retain a navy outline, while ordinary selected journeys have a green highlight and remains identified when returning from its details. Opening an unselected combined card previews its first choice on the map; reopening the selected group preserves its current individual choice. Results can be sorted by weighted recommendation, fastest, cheapest, fewest transfers or least walking. Sorting applies to cards and the choices inside them without changing any score, and unknown fares are placed last for cheapest sorting. All bus badges and map lines retain company display colours, including purple for Discovery Bay. Joint services include both companies. A mixed stripe on badges and alternating segments on the same map path include every company colour, plus red for 1xx/3xx/6xx, green for 9xx/X9xx, or black for N/NA night buses. NR residents' routes are not night buses. See `docs/route-colours.md`. Catalogue operator identity is retained separately from the existing weighting operator.

Displayed journey minutes are separate from weighted scores. They include stop-to-stop run times, access/transfer walking and predicted or scheduled waiting. KMB/LWB, Citybus, MTR, Light Rail and green minibus live arrivals enrich the initial boarding where a fresh matching prediction is available. Later connections use published timetables or estimates; connections are rechecked after the initial live arrival changes. Rail run times/headways are estimates; rail service is explicitly unverified when the live feed cannot confirm it. TD intermediate stop times are interpolated between published timepoints. A required leg with no upcoming connection is marked unavailable.

`/timetables` (English: `/timetables?lang=en`) lists government-provided company/network names and lets users browse all 82,282 imported timetable records: 5,991 fixed departures and 76,291 frequency windows across 3,648 scheduled patterns. Select company, route, direction/variant, boarding stop and Hong Kong service date. The view preserves weekday/holiday calendars, added/cancelled calendar exceptions, exclusive frequency ends and after-midnight times. Headway windows are not presented as exact departure slots. Intermediate stop times are labelled estimates. MTR/Light Rail topology has no complete published timetable in the imported sources, so that gap remains explicit. Government `agency.txt` groups some minibus, ferry, cross-boundary and residents' services; these are not invented individual-company names.

Timing and timetable membership are independent. **Live / 即時** is an operator prediction; **Scheduled · timetable / 時間表班次** is a provider-scheduled time or published estimate. Neither alone proves that a particular vehicle has started moving. A departure can also be **Timetabled**, **Additional / 加班**, **Changed / 班次調整**, or **Cancelled / 取消**. Live + Additional and Scheduled + Additional can appear together. Provider-confirmed extras take precedence; terminal provider-scheduled times are compared with anchored published slots rather than trusted automatically. Live predictions retain ETA-drift tolerance, and interpolated intermediate times are not used for exact-slot extra-trip inference. The dated official B10 correction uses 15-minute service until 23:30, then 20 minutes until 00:30; 17:40 is off-slot and 17:45 is on-slot.

At least three distinct provider-scheduled terminal departures from one company can suggest a less frequent pattern. Affected off-slot rows say **Changed · inferred**; unchanged slots keep their existing label. A nearby off-slot provider-scheduled terminal time can also say **Changed? / 班次調整?** when its reference slot is absent from the returned feed and the difference is at most ten minutes. This is a possible earlier/later move, not proof of a trip match: multiple times can be candidates for one reference. An original slot still present in either joint operator's feed prevents this inference; explicit extras and cancellations retain their labels. Sparse feeds cannot confirm a cancellation. Cancellation requires an explicit provider remark; notices without a time retain no invented time/countdown and never become boardable predictions. Early/late differences compare with the nearest timetable reference, not confirmed delays of an identified trip. Headway-derived and interpolated references remain distinct metadata.

Arrival boards refresh sequentially every 30 seconds, countdowns tick locally each second, current journey calculations refresh every two minutes, and traffic notices refresh every minute. Background tabs/offline devices pause polling; failures retain visibly stale data and retry with bounded backoff. All transit legs have targeted arrival boards, stop lists and boarding/alighting times. Later connections clearly separate current departures from planned future connections. The manual refresh controls remain available.

Each board initially shows three departures. **More departures** expands a scrollable preview for the next three hours, including clearly labelled **Timetable estimates** after the provider's returned predictions. These are not additional live services or guaranteed departures; frequency windows are expanded into estimated times only for this preview. No future rail departures are invented without a timetable. Estimates do not reintroduce an inferred moved original slot or a provider-cancelled time. If the next published departure is farther away than three hours, the existing next-service fallback remains available. Same-route rows share one board, including ordinary single-company services. Repeated stock remarks, matching-time comparisons and headway badges are hidden; the legend is under Help and useful provider notices remain visible. Compact boards use one service label per row: Timetabled, Additional, Changed or Cancelled, with **?** for unconfirmed extra/shift inferences. A separate Live badge is retained for live predictions; provider-scheduled rows do not repeat Scheduled + Timetabled (or Scheduled + Changed/Additional).

`.github/workflows/refresh-hk-data.yml` schedules checked timetable/adult/student-fare imports daily at 06:15 Hong Kong time; stops, alignments and place/residents directories refresh weekly and on manual runs. Raw caches remain on the runner. Tests, a production build, browser-worker checks and a 1 MB per-source-file guard must pass before snapshots are committed. The existing Cloudflare Git integration can build those main-branch updates. A failed source download/check keeps the published snapshot unchanged; this is not a guarantee that upstream data is complete. Open apps check for newer imported transport dates and offer a reload.

The top city selector lists Hong Kong only. **Macau is deferred to a separate next version and Git push**; this release adds no Macau routes or fare claims. GPS can set the starting point on request. The map also offers an opt-in live blue GPS dot and accuracy circle. It watches location while visible, pauses when hidden, resumes on return, and has a stop button. GPS trails are never uploaded or saved, and movement does not silently change the chosen journey endpoints. Driving joins walking, cycling and taxi comparisons, reusing road geometry with taxi without inventing fuel/toll/parking prices. The road settings now expose 28 identified corridors.

Journey details offer opt-in **phone boarding notifications** for the first boarding within the next two hours. A SQLite-backed Cloudflare Durable Object checks official KMB/Long Win, Citybus, MTR, Light Rail or GMB predictions about once a minute and sends encrypted standards-based Web Push, including while the page is asleep. Other imported modes receive clearly labelled planned-time reminders, not invented live ETAs. Alerts reuse a single notification tag, support Stop updates, and expire within two hours (or 20 minutes after planned boarding). This is not full journey navigation or background GPS. iOS/iPadOS 16.4+ requires a Home Screen web app; delivery still depends on OS/network/permission settings. The pilot caps simultaneous watches at 15 and does not enable a paid plan. Only the temporary push subscription and selected public boarding details are stored; stop/expiry deletes the watch, while the server VAPID key remains for existing browser subscriptions. The SQLite Durable Object binding/migration is in `wrangler.jsonc`. Actual phone delivery must be tested on a subscribed device.

Published normal adult OD fares are retained, including sectional fares and adult Octopus MTR, Airport Express and Light Rail fares. Paid-area rail line changes share one OD fare. No same-operator discount is assumed. If only a full-route fare is known, it is clearly marked as an upper bound; missing fares are never shown as Free. Monthly-pass analysis remains a separate prototype estimate. The map uses 3,429 official TD/CSDI bus/minibus road alignments and OpenStreetMap tracks/water routes, with OSRM walking paths and road fallback constrained through ordered stops. Missing geometry is hidden rather than replaced with straight chords. Walking durations remain estimates; paths do not certify step-free accessibility or temporary closures. Red minibuses, taxis, Ngong Ping 360 and private services absent from the imported fixed-route feeds are not included. See `/coverage` and `/api/network?resource=coverage` for counts, attribution and limits.

Map tiles use OpenStreetMap with visible attribution. No map API key is required. Place search and official transit upstreams still require network access. Arrivals and timetable browsing support Traditional Chinese and English.

- 搜尋香港地標、商場、屋苑、街道、地址及車站，不要求預先儲存地點 / Search Hong Kong landmarks, malls, estates, streets, addresses, and stations without requiring saved places.
- 起點及目的地預設為空白，讓每次 journey 都由使用者主動開始 / Keep origin and destination blank by default so every journey starts with an intentional user search.
- 使用清晰的 map-first route-planning layout，但不複製 Citymapper branding、code、assets 或 protected content / Use a clear map-first route-planning layout without copying Citymapper branding, code, assets, or protected content.
- 顯示 journey time、transfer count、walking time、operator、fare、scheduled interval、ETA status 及 route alerts / Display journey time, transfer count, walking time, operator, fare, scheduled interval, ETA status, and route alerts.
- 接入 KMB 及 Citybus official route、stop、ETA APIs，並以 server-side proxy 保護 client boundary / Connect to official KMB and Citybus route, stop, and ETA APIs through server-side proxies.
- 使用 OpenStreetMap Nominatim 提供香港 free-text place search，並提供 external Google Maps handoff / Use OpenStreetMap Nominatim for Hong Kong free-text place search with external Google Maps handoff links.
- 提供 traffic sources、service alerts、route updates、calendar export、saved-place UI 及 English page `/en` / Provide traffic sources, service alerts, route updates, calendar export, saved-place UI, and an English page at `/en`.
- 使用 static pages、browser Web Workers 和受限制的 upstream proxy 部署至 Cloudflare Workers / Deploy static pages, browser Web Worker calculations and a restricted upstream proxy to Cloudflare Workers.

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

目前 `/api/journey` 是 bounded multimodal journey planner，具備地點搜尋、步行路徑及轉乘，但不保證窮盡所有路線 / `/api/journey` provides bounded multimodal planning with place search, walking paths and transfers; it does not guarantee exhaustive route discovery. `/api/routes` remains a separate scoring fixture.

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
  +-- Next.js pages + client components
  |     +-- JourneyPlanner / JourneyPlaceSearch / JourneyMap (Leaflet)
  |     +-- station arrivals、timetables、traffic、updates、PWA installation
  |
  +-- transportFetch -> browser Web Workers
  |     +-- reused journey, timetable, geometry and provider handlers
  |     +-- imported transport graph + scoring and fare modules
  |     +-- external requests -> /api/upstream restricted edge proxy
  |
  +-- Cloudflare deployment
  |     +-- static pages/assets + lightweight src/cloudflare/worker.ts
  |     +-- /api/sources -> static source catalogue
  |     +-- direct calculation API requests -> 409 BROWSER_COMPUTATION
  |
  +-- Local Next.js server
        +-- route handlers also accept direct HTTP requests for development
        +-- /api/routes remains a separate small scoring demonstration
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
  engine/UpgradedScoringEngine.ts     Journey scoring and normal-fare calculations
  browser/transportClient.ts           Fetch-compatible background-worker client
  browser/transport.worker.ts          Browser execution of transport handlers
  cloudflare/worker.ts                 Lightweight deployment entry point
  cloudflare/upstreamProxy.ts          Allowlisted public-provider proxy
  lib/cloudflare.ts                    Optional Next.js binding helper
```

## Scoring engine / 路線評分引擎

評分採用 lower-score-is-better model，即分數越低代表 estimated journey cost 越低 / The engine uses a lower-score-is-better model, where a lower score represents a lower estimated journey cost:

```text
Final score
  = sum(segment scores)
  + walking time * 1.35
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

`calculateFare` sums the published adult leg fares. Paid-area MTR/Light Rail changes are combined into one published OD fare before scoring. The planner uses adult Octopus rail fares and normal adult fares for other modes; it does not invent interchange offers or concessions. `discountedFare` retains its existing API field name but is the undiscounted normal adult total; `bbiDiscountApplied` is zero. Full-fare fallbacks are marked as upper bounds. The default recommendation and fare-importance slider use these adult fares. Cheapest sorting uses the adult / KMB pass / student profile selected at the top; cards show normal adult and the selected fare; other payment choices remain available in the payment box.

Journey cards, combined groups and selected journeys compare **Normal adult** with the selected payment fare. The payment box supports adult/mobile Octopus, Student Octopus and owned KMB Monthly Pass estimates. Cash/single-ticket, contactless bank-card, bank-wallet and QR choices are listed with unverified prices and no claim of route acceptance. My passes stores optional expiry dates and custom pass names locally; only verified rules affect prices. Expired KMB passes are not applied. Passes are not stacked. Supported calculations include **Normal adult**,
**With KMB pass** and **Student** separately. Combined cards calculate the minimum and maximum
for each comparison from their actual member journeys. The pass calculation
uses KMB's terms effective 2025-11-14, verified on 2026-11-14; see
[KMB_PASS_RULES.md](src/domain/KMB_PASS_RULES.md) for the source and assumptions. It distinguishes
included rides, LWB A/NA and KMB HK1 discounts, P960/P968 charges, excluded routes
and joint-service operating companies. A joint timetable without a known company
shows a conditional range. Unknown fares remain unknown. The HK$834 pass purchase
price is separate, and a valid pass with enough daily rides is assumed.

### Journey preferences and fare profiles

- **Companies, tunnels & changes** includes Must / Normal / Ban per operator.
  Every Must company must appear; Normal is optional. Banned operators are
  excluded during graph expansion. Joint services require all companies to be
  allowed, and do not guarantee which company operates the actual vehicle.
  KMB-only excludes Long Win and KMB/Citybus joint services.
- Road corridor restrictions use travelled intervals from imported TD
  alignments. Must selections within a group are alternatives; Must selections
  across groups apply together. Ban removes a travelled segment. Run
  `npm run data:corridors` after an alignment/network refresh.
- **Minimum time to change** offers 3, 5, 10, 15, 20 or 30 minutes. The engine
  keeps physical transfer walking and adds the remaining buffer to waiting,
  including live retiming and arrive-by search. Press Go/Plan after changing
  preferences. Searches remain bounded; restrictions can produce no result.
- **Menu → Route weighting** provides importance sliders, advanced waiting
  multipliers/company adjustments, an explicit warning, Apply & recalculate
  and Reset to defaults. Actual estimates do not change when weights change.
  Preferences and custom importance apply to the current session.
- Student fares use the official MTR Student Octopus OD, Light Rail student
  and MTR Bus student CSVs. Connected paid-area rail changes share one OD fare.
  Airport Express remains adult-priced. Other services without a verified
  student tariff show an adult-fare fallback (*), not an assumed half fare.
  Ambiguous MTR Bus route-level fares use a marked upper bound. Import with
  `npm run data:student-fares` and review current student eligibility/conditions.
- Walking/cycling/taxi times use separate OSRM foot/bike/car profiles and their
  routed durations. They do not include live traffic or taxi waiting. Cycling
  assumes an owned bicycle; ferry/hire charges and accessibility guarantees are
  excluded. Missing paths remain unavailable.
- Start/End inputs offer clear buttons, swap, automatic destination focus and
  five recent selections stored on the device. GPS requires a user action and
  is not added to recents. Map picks resolve to a street/landmark with a nearby
  stop fallback; exact coordinates remain secondary. Endpoint coordinates are
  sent to the restricted public geocoder/router proxies for these lookups.

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

These HTTP examples apply to the local Next.js server. On the free Cloudflare
deployment, UI transport queries use `transportFetch` and run the same handlers
inside browser Web Workers. Only `/api/upstream` (restricted public providers)
and `/api/sources` (source catalogue) run at the edge. Direct HTTP requests to
calculation endpoints return `409 BROWSER_COMPUTATION` rather than exhausting
the free server's CPU budget.

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

- Node.js `22.12.0+`, matching the `engines.node` requirement in `package.json` / 符合套件指定的 Node.js 最低版本
- npm package manager / npm 套件管理器
- Network access to official transit、geocoding and traffic upstreams / 需要連接官方交通、地點及交通資訊服務

Install and run / 安裝及啟動：

```bash
npm ci
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
| `npm test` | Run the Vitest suite / 執行 Vitest 測試 |
| `npm run test:browser` | Build and test the generated browser worker / 建立並測試 browser worker |
| `npm run cf:build` | Build static pages, browser calculator and lightweight Cloudflare proxy |
| `npm run cf:preview` | Build and run Wrangler preview / 建立並啟動 Wrangler 預覽 |
| `npm run cf:deploy` | Build and deploy with Wrangler / 建立並使用 Wrangler 部署 |
| `npm run data:citybus` | Refresh Citybus matching catalogues / 更新城巴配對目錄 |
| `npm run data:transport -- --cache <external-folder>` | Rebuild the imported transport snapshot / 重建交通 snapshot |
| `npm run data:residents -- --cache <external-folder>` | Refresh the residents’ service directory / 更新居民服務目錄 |

The existing `npm run lint` script still invokes `next lint`, which is absent from the installed Next.js 16 CLI. It is not a working validation command for this checkout; the script needs a separate tooling update. Use `npm test`, `npm run test:browser` and `npm run build` for the checks documented here.

## Environment and Cloudflare / 環境變數及 Cloudflare

複製 `.env.example` 至 `.env.local` / Copy `.env.example` to `.env.local`：

```bash
cp .env.example .env.local
```

Legacy Google Maps embed component only / 僅適用於舊版 Google Maps embed component：

```env
NEXT_PUBLIC_GOOGLE_MAPS_EMBED_URL=https://www.google.com/maps?q=Hong+Kong&output=embed
```

The main `JourneyMap` uses Leaflet/OpenStreetMap and does not use this setting. `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_URL` applies only to the retained `GoogleMapPanel` component; external Google Maps handoff links are separate. / 主行程地圖不需要此設定。

不要提交 credentials、API keys 或 private endpoints / Do not commit credentials, API keys, or private endpoints.

### Install on iOS and Android / 在 iOS 及 Android 安裝

On iPhone or iPad, open `/install` in Safari, tap **Share → Add to Home Screen**,
enable **Open as Web App** if offered, then tap **Add**. The page includes
bilingual instructions for both platforms. Website and installed PWA share updates.


Open `/install` in Chrome on an Android phone or tablet (or `/install?lang=zh`
for Chinese). There is no device-brand restriction.
Use **Install app** when offered, or Chrome's **⋮ → Install and create shortcut
→ Install** (some versions show **Add to home screen** or **Install app**).
The manifest supplies standard and maskable icons, an app identity and standalone
display, so the installed web app opens from the home screen or app drawer.
This is a PWA, not a native APK or Play Store release. Deployment uses the repository’s Cloudflare Worker configuration; account usage limits still apply.
Other Android browsers may offer **Install app** or **Add to home screen**;
installation availability and app-versus-shortcut behavior depend on the browser.
Open the site in a full browser, rather than a messaging app's embedded browser.

The service worker caches only an offline help page and handles opt-in Web Push notifications. It does not cache API
responses, route calculations, map tiles or old Next.js assets. An internet
connection remains necessary for data, maps and arrivals; full offline routing
is not included. Service-worker registration is disabled in development.

Cloudflare deployment / Cloudflare 部署：

Use Node.js 22.12 or newer (`.node-version` pins major 22 for hosted builds).
For the existing Cloudflare Workers Git build, use repository root `/`,
build command `npm run cf:build`, deploy command `npx wrangler deploy --config wrangler.jsonc`,
and production branch `main`. The configured Worker name is `kmb-monthly-pass-mapper`.

The free deployment serves static pages and runs the existing routing, scoring,
fares, timetables, place matching and geometry handlers in browser Web Workers.
Journey searches use a separate cancellable worker, so the page and catalogue
remain responsive. Completed searches reuse their worker and data indexes; cancelled searches terminate it.
A small ESM worker entry loads only the handlers and shared data needed for each task. Place matching does not download the full fare/routing graph, and local stop/school suggestions appear before slower online geocoding finishes. Content-hashed calculator chunks are cached for reuse; the entry point revalidates on a new page load. Calendar checks are reused within each search, and route-family identifiers are computed once rather than repeatedly inside the graph loop. Full routing data is still downloaded when first needed; slower phones may take longer to calculate large searches. No route data, weighting coefficient, search alternative or geometry resolution is reduced.

`cf:build` stages pages, the generated browser bundle and full-resolution road/
track chunks in `.free-worker/assets`. The small edge Worker only proxies an
explicit list of public transport/geocoder/router endpoints, with rate limiting,
short live-data caching and no upstream redirects or forwarded user credentials.
Build output and generated public assets are ignored by Git; only source chunks below
1 MB are committed. This deployment is staged by `scripts/stage-free-worker.mjs`;
it does not run an OpenNext server bundle. `npm run test:browser` exercises the actual generated bundle,
including the A20, A23, 44→A31 and 44→E32 examples and arrive-by searches.

```bash
npm ci
npm run cf:build
npx wrangler login
npx wrangler deploy --config wrangler.jsonc
```

All transit services show a compact dark arrivals/boarding board in station results
and journey details: each live prediction has its Hong Kong clock time, minutes
remaining and actual company. Joint services interleave both companies chronologically,
without combining opposite directions or different boarding stops. Missing live
data stays explicitly unavailable; scheduled boarding estimates are labelled separately from live arrivals. Published headways remain in the full timetable view, rather than crowding the arrival boards.

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
2. Multimodal search has no configured transfer-count or journey-duration maximum, but retains a limited set of labels/alternatives for performance and does not promise exhaustive path discovery. Rail timings/headways and walking durations are estimated. Topology-only rail searches use conservative estimated 06:00–00:00 terminal windows, explicitly unverified; these are not official first/last-train times.
3. Normal adult totals exclude unverified interchange offers. A full published fare is used as an upper bound when sectional pricing is missing. The separate monthly-pass estimate cannot read an Octopus card's validity or remaining daily rides; its dated rules need review when the operator changes policy.
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

`/api/journey` accepts `timeMode=now|depart|arrive` and an explicit-offset ISO timestamp in `time` for scheduled modes. `/api/journey-geometry` loads physical paths for the selected result. The default public OSRM service is cached and serialized; production can set `OSRM_FOOT_URL`, `OSRM_BIKE_URL` and `OSRM_CAR_URL` to private services. Road fallback follows roads through stops and may differ from the operator's exact alignment. Missing paths are reported and suppressed. Public service availability and per-process rate limiting are not a production SLA.

The `OSRM_FOOT_URL` and `OSRM_CAR_URL` overrides apply to the Next.js server handlers. The current browser-worker build substitutes those variables with `undefined` and uses the configured public-provider proxy; adding a Cloudflare secret alone does not change its routing endpoints.
