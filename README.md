# Transit Compass HK

> [繁體中文](#繁體中文) | [English](#english)

<a id="繁體中文"></a>

## 繁體中文

Transit Compass HK（香港出行地圖）是一個香港多模式公共交通導航原型。系統以地圖優先的介面整合自由地點搜尋、官方公共交通資料、交通資訊、路線比較及透明的路線評分引擎。

本產品採用中立品牌定位。KMB、LWB、MTR 及城巴只會在營辦商資料、路線 metadata 或資料來源 attribution 中出現，不會使用任何交通公司的 logo、品牌視覺或商業產品作為本產品的 logo 或主要賣點。

### 產品功能

- 搜尋香港地標、商場、屋苑、街道、地址及車站，不要求使用者先建立或選取已儲存名稱。
- 起點及目的地預設為空白，避免展示虛構的預設行程或假資料。
- 提供類似現代地圖導航產品的資訊架構，但不複製 Citymapper 的品牌、程式碼、素材或受保護內容。
- 顯示路線時間、轉乘次數、步行時間、營辦商、車費、班次間隔及 ETA 狀態。
- 接入 KMB 及城巴官方路線、站點及 ETA API。
- 透過 OpenStreetMap Nominatim 提供香港自由文字地點搜尋。
- 提供交通資訊、交通警示、路線更新、日曆匯出、已儲存地點介面及英文頁面 `/en`。
- 支援使用 OpenNext 部署至 Cloudflare Workers。

### 主要頁面及 API

| 路徑 | 用途 |
| --- | --- |
| `/` | 繁體中文地圖優先路線搜尋首頁 |
| `/en` | 英文產品頁面 |
| `/traffic` | 交通及服務受阻資訊 |
| `/updates` | 路線及服務更新 |
| `/api/places` | 香港自由文字地點搜尋 proxy |
| `/api/transit` | KMB 及城巴路線、站點與 ETA proxy |
| `/api/eta` | ETA 查詢及上游資料 allowlist endpoint |
| `/api/routes` | 原型路線評分回應 |
| `/api/traffic` | 交通資訊回應 |
| `/api/updates` | 服務更新回應 |
| `/api/sources` | 資料來源清單 |

目前的路線搜尋屬於具備 production-shaped API 邊界的原型，並非完整的門到門 geospatial route graph。介面及資料層已預留位置，日後可接入真正的路線供應商或自行建立多模式 pathfinding 系統。

### 系統架構

```text
瀏覽器
  |
  +-- Next.js App Router 頁面及 client components
  |     +-- JourneyPlaceSearch / PlaceAutocomplete
  |     +-- LiveTransitSearch / GoogleMapPanel
  |     +-- 路線卡、交通、更新及日曆介面
  |
  +-- Next.js route handlers
  |     +-- /api/places  -> OpenStreetMap Nominatim
  |     +-- /api/transit -> KMB / 城巴官方 API
  |     +-- /api/eta     -> 已核准 ETA upstream
  |     +-- /api/routes  -> 原型評分引擎
  |
  +-- Domain 及 data modules
        +-- UpgradedScoringEngine
        +-- 月票及車費計算
        +-- 交通來源及服務警示
        +-- 官方交通資料 adapters
```

主要程式碼位置：

```text
src/
  app/page.tsx                         地圖優先首頁
  app/en/page.tsx                      英文頁面
  app/components/                      搜尋、地圖、交通、日曆及路線 UI
  app/api/                             Server-side API handlers
  data/hkTransitApi.ts                 KMB 及城巴 upstream adapters
  data/hkTrafficSources.ts             香港交通資料來源
  domain/monthlyPass.ts                月票及車費分析
  engine/UpgradedScoringEngine.ts     路線評分及 BBI 原型
  lib/cloudflare.ts                    可選 Cloudflare binding helper
```

### 路線評分模型

評分採用「分數越低越好」：

```text
總分
  = 所有交通段分數總和
  + 步行轉乘時間
  + 長距離轉乘附加成本
  + (轉乘次數 * 8)
```

每一段交通的分數為：

```text
交通段分數
  = 行車時間
  + ETA / 等候成本
  + 營辦商調整值
```

時段倍率：

| 時段 | 香港時間 | 倍率 |
| --- | --- | ---: |
| 繁忙時段 | 07:00-09:30 及 17:00-19:30 | `1.0` |
| 非繁忙時段 | 其他日間時段 | `1.3` |
| 深夜時段 | 23:00-05:50 | `1.8` |

營辦商調整值：

| 營辦商 | 調整值 |
| --- | ---: |
| KMB | `-1.00` |
| LWB | `-0.46` |
| MTR | `+0.50` |
| CTB | `+1.00` |

如果有 `realtimeEta.isLive === true` 的即時 ETA，系統會使用該 ETA 取代排班等候成本；否則會使用：

```text
排班班次間隔 * 0.5 * 時段倍率
```

引擎接受由呼叫端傳入的 `Date`。如果需要嚴格按照香港時間計算，應在 application boundary 統一時區，而不應依賴部署環境的本地時區。

### 車費及八達通轉乘優惠原型

`calculateFare` 會先合計所有交通段車費，再對相鄰且由同一營辦商營運的交通段套用每段最高 HK$4.20 的原型折扣，回傳：

- `discountedFare`
- `bbiDiscountApplied`

這是透明的產品原型規則，不代表正式票價保證。正式上線前必須根據最新官方票價、生效日期、轉乘資格、支付媒介及路線例外建立版本化 fare ruleset。

### 資料來源及更新行為

目前使用的資料來源包括：

- KMB Data API：`https://data.etabus.gov.hk/v1/transport/kmb`
- 城巴 Real-time API：`https://rt.data.gov.hk/v2/transport/citybus`
- OpenStreetMap Nominatim：`https://nominatim.openstreetmap.org`
- Google Maps 外部導航連結及可選 map embed
- `src/data/hkTrafficSources.ts` 中維護的香港交通來源

API route handlers 會代理 upstream 請求，避免瀏覽器直接依賴上游 URL 格式：

- 路線及站點 catalog 約快取 60 秒。
- 地點搜尋約快取 5 分鐘。
- ETA 使用 `no-store`，避免顯示過期資料。
- upstream 失敗會回傳 `502`，不會靜默轉換成假的 live ETA。
- 有 `RATE_LIMITER` Cloudflare binding 時使用 Cloudflare rate limiting。
- 本機沒有 Cloudflare binding 時，透過 `src/lib/cloudflare.ts` 安全地繼續執行。

### 本機開發

需求：

- Node.js 20.19+ 或 Node.js 22+
- npm
- 可連接官方交通、地點搜尋及交通資訊 upstream 的網絡

安裝及啟動：

```bash
npm install
npm run dev
```

瀏覽 `http://localhost:3000`。

Production build 驗證：

```bash
npm run build
npm run start
```

可用指令：

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 Next.js 開發伺服器 |
| `npm run build` | 建立並進行型別檢查 |
| `npm run start` | 啟動 production build |
| `npm run lint` | 執行 repository lint 指令 |
| `npm run cf:build` | 建立 Cloudflare OpenNext worker |
| `npm run cf:preview` | 建立並啟動 Wrangler 預覽 |
| `npm run cf:deploy` | 建立並使用 Wrangler 部署 |

### 環境變數及 Cloudflare

複製 `.env.example` 至 `.env.local`：

```bash
cp .env.example .env.local
```

可選的 Google Maps embed：

```env
NEXT_PUBLIC_GOOGLE_MAPS_EMBED_URL=https://www.google.com/maps?q=Hong+Kong&output=embed
```

未設定時，系統會使用香港地圖 fallback，並仍然提供外部 Google Maps link。不要把 API key、密碼或私有 endpoint 提交到 repository。

Cloudflare 部署：

```bash
npm install
npm run cf:build
npx wrangler login
npm run cf:deploy
```

`wrangler.jsonc` 定義 worker entry point、靜態資產 binding 及可選的 `RATE_LIMITER` binding。正式環境如需要 rate limiting，應配置該 binding；沒有 binding 時應預期系統會跳過 Cloudflare-backed limiter。

### 品牌、合規及資料使用原則

- 使用 Transit Compass HK 作為產品身份。
- 不使用 KMB、城巴、MTR、LWB、Google Maps、OpenStreetMap 或 Citymapper logo 作為產品 logo。
- 營辦商名稱只用於資料 metadata、路線資訊及 attribution，不作產品賣點。
- 起點及目的地預設保持空白，直到使用者主動選擇地點。
- 不把 mock、fallback 或過期資料標示為即時 ETA。
- 保留必要的來源 attribution 及外部連結。
- 遵守各 upstream provider 的條款、rate limit、授權及 attribution 要求。

### 原型限制及後續工作

1. `/api/routes` 目前回傳小型 scored-route fixture，尚不是完整 route graph。
2. 評分引擎只會排序輸入路線，不會從任意座標自行探索所有可能路徑。
3. BBI 是簡化的同營辦商原型，正式版需要有日期及路線條件的票價規則。
4. 地點搜尋依賴 Nominatim 可用性及使用政策。
5. Map embed 及外部地圖連結受第三方瀏覽器及網絡政策影響。
6. 交通警示及來源清單需要持續維護的資料更新流程。

正式產品的直接 roadmap 是加入 route-graph service、標準化各營辦商站點幾何資料、建立站到站轉乘連接、加入版本化 fare rules，以及使用錄製 upstream fixtures 建立 integration tests。

---

<a id="english"></a>

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
