# Transit Compass HK / 香港出行地圖

> 香港多模式公共交通導航原型 / Hong Kong multimodal public-transit journey-planning prototype

Transit Compass HK 是一個香港多模式交通導航 prototype，提供地圖優先搜尋、自由地點搜尋、官方交通資料、交通警示、路線比較及透明評分引擎 / Transit Compass HK is a Hong Kong multimodal transit prototype with map-first search, free-text place search, official transit data, traffic alerts, route comparison, and a transparent scoring engine.

產品採用中立 operator-neutral branding；KMB、LWB、MTR 及 Citybus 只會作為營辦商 metadata、route information 或 data-source attribution，不會使用交通公司 logo、品牌視覺或商業產品作為本產品 identity 或主要 selling point / The product is operator-neutral; KMB, LWB, MTR, and Citybus appear only as operator metadata, route information, or source attribution, never as the product identity or primary selling point.

## Product scope / 產品範圍

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
| `/api/places` | 香港地點 geocoding proxy / Hong Kong place geocoding proxy |
| `/api/transit` | KMB 及 Citybus routes、stops、ETA proxy / KMB and Citybus route, stop, and ETA proxy |
| `/api/eta` | Allowlisted ETA lookup / 受 allowlist 限制的 ETA 查詢 |
| `/api/routes` | Prototype scored-route response / 原型評分路線回應 |
| `/api/traffic` | Traffic information response / 交通資訊回應 |
| `/api/updates` | Service update response / 服務更新回應 |
| `/api/sources` | Data-source catalogue / 資料來源清單 |

目前 route search 是 production-shaped prototype，具備清晰 API boundaries，但尚未成為完整 door-to-door geospatial router / The current route search is a production-shaped prototype with clear API boundaries, not yet a complete door-to-door geospatial router.

系統目前會 ranking supplied routes，未來可以接入 route provider 或自行建立 multimodal pathfinding graph / The current system ranks supplied routes; a future version can connect a route provider or build an in-house multimodal pathfinding graph.

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
  + walking transfer time
  + long-distance transfer surcharge
  + (transfer count * 8)
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

如果 `realtimeEta.isLive === true`，系統會使用 live ETA 取代 scheduled waiting cost / When `realtimeEta.isLive === true`, live ETA replaces the scheduled waiting-cost calculation.

沒有 live ETA 時，fallback wait cost 使用 scheduled interval、`0.5` 及 time-of-day multiplier 計算 / Without live ETA, fallback wait cost is calculated as scheduled interval multiplied by `0.5` and the time-of-day multiplier:

```text
scheduled interval * 0.5 * time-of-day multiplier
```

引擎接受 caller-provided JavaScript `Date`；如需嚴格香港時間，應在 application boundary normalize timezone / The engine accepts a caller-provided JavaScript `Date`; applications requiring strict Hong Kong time should normalize timezone at the application boundary.

### Fare and BBI prototype / 車費及八達通轉乘優惠原型

`calculateFare` 會合計所有 supplied leg fares，並對相鄰且由同一 operator 營運的交通段套用每段最高 `HK$4.20` 的 prototype discount / `calculateFare` totals supplied leg fares and applies a prototype discount of up to `HK$4.20` to each adjacent same-operator pair.

- `discountedFare` 是 final estimated fare / is the final estimated fare。
- `bbiDiscountApplied` 是 applied discount / is the total applied discount。

這是 explainable prototype rule，不代表正式票價保證；production version 需要 dated、route-aware fare ruleset / This is an explainable prototype rule, not a fare guarantee; production requires a dated, route-aware fare ruleset.

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

```bash
npm install
npm run cf:build
npx wrangler login
npm run cf:deploy
```

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
2. Scoring engine 只會 ranking supplied routes，不會從任意座標探索所有 paths / only ranks supplied routes and does not discover every path from arbitrary coordinates。
3. BBI handling 是 simplified same-operator prototype，production launch 前需要正式 fare rules / is a simplified same-operator prototype requiring production fare rules。
4. Place search 依賴 Nominatim availability 及 usage policy / depends on Nominatim availability and usage policy。
5. Map embed 及 external links 受第三方 browser/network policies 影響 / depend on third-party browser and network policies。
6. Traffic alerts 及 source catalogues 需要 maintained refresh process / require a maintained data-refresh process。

Recommended next steps / 建議後續工作：

- Add a route-graph service and multimodal pathfinding / 加入 route-graph service 及多模式 pathfinding。
- Normalize operator stop geometries and connect stop-to-stop transfers / 統一各營辦商站點 geometry 並建立站到站轉乘。
- Introduce versioned fare rules and effective dates / 加入版本化 fare rules 及生效日期。
- Add recorded upstream fixtures and integration tests / 加入 recorded upstream fixtures 及 integration tests。
- Add observability for upstream latency、rate limits and stale-data detection / 加入 upstream latency、rate-limit 及 stale-data observability。

## License and third-party services / 授權及第三方服務

除非 repository owner 另行發布 license，否則本 repository 視為 private application code / This repository is private application code unless the repository owner publishes a separate license.

- KMB and Citybus data 受各自 official API terms 約束 / are subject to their respective official API terms。
- OpenStreetMap data and Nominatim use 受 OpenStreetMap Foundation policies 及 attribution requirements 約束 / are subject to OpenStreetMap Foundation policies and attribution requirements。
- Google Maps links and embeds 受 Google Maps Platform terms 約束 / are subject to Google Maps Platform terms。
- Next.js、React、Tailwind CSS、OpenNext、Wrangler 及其他 dependencies 保留各自 licenses / retain their respective licenses。
