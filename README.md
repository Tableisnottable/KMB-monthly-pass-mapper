# Transit Compass HK

> 香港出行地圖 / Hong Kong multimodal journey-planning prototype

Transit Compass HK is a Hong Kong multimodal transit planner，提供 map-first journey search、自由地點搜尋、官方交通資料、traffic alerts、route comparison 及 transparent scoring engine。產品採用 operator-neutral branding：KMB、LWB、MTR 及 Citybus 只會作為 operator metadata、route information 或 data-source attribution，不會使用任何交通公司的 logo、品牌視覺或商業產品作為本產品 identity 或主要 selling point。

## Product overview / 產品概覽

The prototype is designed for users who want to search a place by name，而不是只能選擇預先儲存的地點。Origin and destination inputs are intentionally blank by default，讓每次 journey 都由使用者主動開始。

### Core features / 核心功能

- Search Hong Kong landmarks、商場、屋苑、街道、地址及車站，支援 free-text autocomplete。
- Map-first layout with desktop route panel、sticky map 及 mobile bottom navigation。
- Route cards display journey time、transfer count、walking time、operator、fare、scheduled interval、ETA status and route alerts。
- KMB and Citybus official route/stop catalogues 及 live ETA proxy endpoints。
- OpenStreetMap Nominatim-powered place search，並提供 external Google Maps handoff link。
- Traffic sources、traffic alerts、route updates、calendar export 及 saved-place UI。
- Traditional Chinese homepage at `/`，English product page at `/en`。
- Cloudflare Workers deployment through OpenNext。

The UI follows a familiar modern transit-navigation information hierarchy，but does not copy Citymapper branding、code、assets or protected content。

## Routes and APIs / 頁面與 API

| Path 路徑 | Purpose 用途 |
| --- | --- |
| `/` | Traditional Chinese map-first journey planner / 繁體中文地圖優先路線搜尋 |
| `/en` | English product surface / 英文產品頁面 |
| `/traffic` | Traffic and service disruption / 交通及服務受阻資訊 |
| `/updates` | Route and service updates / 路線及服務更新 |
| `/api/places` | Hong Kong free-text geocoding proxy / 香港自由文字地點搜尋 |
| `/api/transit` | KMB and Citybus routes、stops and ETA / KMB 及城巴資料 proxy |
| `/api/eta` | Allowlisted ETA lookup / ETA 查詢 endpoint |
| `/api/routes` | Prototype scored-route response / 原型評分路線回應 |
| `/api/traffic` | Traffic information / 交通資訊 |
| `/api/updates` | Service updates / 服務更新 |
| `/api/sources` | Source catalogue / 資料來源清單 |

目前 route search 是 production-shaped prototype，具備 clear API boundaries，但尚未成為 complete door-to-door geospatial router。系統現在會 ranking supplied routes；未來可以接入 route provider 或自行建立 multimodal pathfinding graph。

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
  +-- Domain and data modules
        +-- UpgradedScoringEngine
        +-- monthly-pass and fare calculations
        +-- traffic sources and service alerts
        +-- official transit adapters
```

Important source locations / 主要程式碼位置：

```text
src/
  app/page.tsx                         Main map-first homepage / 地圖優先首頁
  app/en/page.tsx                      English page / 英文頁面
  app/components/                      Search、map、traffic、calendar and route UI
  app/api/                             Server-side API route handlers
  data/hkTransitApi.ts                 KMB and Citybus upstream adapters
  data/hkTrafficSources.ts             Hong Kong traffic source catalogue
  domain/monthlyPass.ts                Monthly-pass and fare insight helpers
  engine/UpgradedScoringEngine.ts     Route scoring and BBI prototype
  lib/cloudflare.ts                    Optional Cloudflare binding helper
```

## Scoring engine / 路線評分引擎

The engine uses a lower-score-is-better model，分數越低代表產品 ranking 中的 estimated journey cost 越低：

```text
Final score
  = sum(segment scores)
  + walking transfer time
  + long-distance transfer surcharge
  + (transfer count * 8)
```

每個交通段的計算方式 / Each segment:

```text
Segment score
  = journey time
  + ETA or waiting cost
  + operator adjustment
```

### Time multipliers / 時段倍率

| Period 時段 | Hong Kong time 香港時間 | Multiplier 倍率 |
| --- | --- | ---: |
| Peak / 繁忙時段 | 07:00-09:30 and 17:00-19:30 | `1.0` |
| Off-peak / 非繁忙時段 | Other daytime periods / 其他日間時段 | `1.3` |
| Overnight / 深夜時段 | 23:00-05:50 | `1.8` |

### Operator adjustments / 營辦商調整值

| Operator 營辦商 | Adjustment 調整值 |
| --- | ---: |
| KMB | `-1.00` |
| LWB | `-0.46` |
| MTR | `+0.50` |
| CTB / Citybus | `+1.00` |

If `realtimeEta.isLive === true`，系統會使用 live ETA 取代 scheduled waiting cost。Otherwise，fallback wait cost is:

```text
scheduled interval * 0.5 * time-of-day multiplier
```

The engine accepts a caller-provided JavaScript `Date`。如要確保香港時區一致，應在 application boundary normalize timezone，而不應依賴 hosting runtime 的 local timezone。

### Fare and BBI prototype / 車費及八達通轉乘優惠原型

`calculateFare` totals all supplied leg fares，並對相鄰、由同一 operator 營運的交通段套用每段最高 `HK$4.20` 的 prototype discount。結果包括：

- `discountedFare` - final estimated fare / 最終估算車費
- `bbiDiscountApplied` - applied discount / 已套用折扣

This is an explainable prototype rule，不代表正式票價保證。Production version needs a dated and route-aware fare ruleset，並需要核對 official fare policy、payment medium、interchange eligibility and route exceptions。

## Data sources / 資料來源

Current upstream services / 目前使用的 upstream：

- KMB Data API: `https://data.etabus.gov.hk/v1/transport/kmb`
- Citybus Real-time API: `https://rt.data.gov.hk/v2/transport/citybus`
- OpenStreetMap Nominatim: `https://nominatim.openstreetmap.org`
- Google Maps external links and optional map embed / 外部導航連結及可選地圖 embed
- Hong Kong traffic links maintained in `src/data/hkTrafficSources.ts`

API route handlers proxy upstream calls，令 client components 不需要知道 upstream URL format。Expected behaviour / 更新行為：

- Route and stop catalogues cache for approximately 60 seconds / 約快取 60 秒。
- Place search cache for approximately 5 minutes / 約快取 5 分鐘。
- ETA responses use `no-store` to avoid stale results / 避免顯示過期 ETA。
- Upstream failures return `502`，不會靜默轉換為 fake live data。
- Cloudflare `RATE_LIMITER` binding is used when available。
- Local development continues without Cloudflare bindings through `src/lib/cloudflare.ts`。

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

`operator` currently accepts `KMB` or `CTB`。`resource` accepts `routes` or `stops`；when both `stop` and `route` are supplied，endpoint requests ETA data from the selected official provider。

## Local development / 本機開發

### Requirements / 系統需求

- Node.js `20.19+` or Node.js `22+`
- npm
- Network access to official transit、geocoding and traffic upstreams

Install and run / 安裝及啟動：

```bash
npm install
npm run dev
```

Open `http://localhost:3000`，then use the homepage to test place search、route UI and operator catalogue loading。

Production validation / Production build：

```bash
npm run build
npm run start
```

Available scripts / 可用指令：

| Script 指令 | Description 用途 |
| --- | --- |
| `npm run dev` | Start Next.js development server / 開發伺服器 |
| `npm run build` | Build and type-check production output / production build 及型別檢查 |
| `npm run start` | Serve the production build / 啟動 production build |
| `npm run lint` | Run repository lint command / 執行 lint |
| `npm run cf:build` | Build OpenNext Cloudflare worker / 建立 Cloudflare worker |
| `npm run cf:preview` | Build and run Wrangler preview / Wrangler 預覽 |
| `npm run cf:deploy` | Build and deploy with Wrangler / Wrangler 部署 |

## Environment and Cloudflare / 環境變數及 Cloudflare

Copy `.env.example` to `.env.local`：

```bash
cp .env.example .env.local
```

Optional Google Maps embed / 可選 map embed：

```env
NEXT_PUBLIC_GOOGLE_MAPS_EMBED_URL=https://www.google.com/maps?q=Hong+Kong&output=embed
```

If unset，application uses a Hong Kong map fallback and still provides external Google Maps links。Do not commit credentials、API keys or private endpoints。

Cloudflare deployment / Cloudflare 部署：

```bash
npm install
npm run cf:build
npx wrangler login
npm run cf:deploy
```

`wrangler.jsonc` defines the worker entry point、static asset binding and optional `RATE_LIMITER` binding。Production should configure `RATE_LIMITER` if edge rate limiting is required；without it，application remains functional but skips the Cloudflare-backed limiter。

## Branding and data-use principles / 品牌及資料使用原則

- Use Transit Compass HK as the product identity / 使用 Transit Compass HK 作為產品身份。
- Do not use KMB、Citybus、MTR、LWB、Google Maps、OpenStreetMap or Citymapper logos as the product logo。
- Operator names are metadata and attribution，not the product selling point。
- Keep origin and destination empty until users actively select a place。
- Never label mock、fallback or stale data as live ETA。
- Keep required source attribution and external links visible。
- Respect each upstream provider's terms、rate limits、licensing and attribution requirements。

## Current limitations and roadmap / 目前限制及 roadmap

1. `/api/routes` currently returns a small scored-route fixture，not a complete route graph。
2. The scoring engine ranks supplied routes；它不會從任意座標自行探索所有可能路徑。
3. BBI handling is a simplified same-operator prototype，需要 production fare rules before launch。
4. Place search depends on Nominatim availability and usage policy。
5. Map embeds and external map links depend on third-party browser/network policies。
6. Traffic alerts and source catalogues need a maintained refresh process。

Recommended next steps / 建議後續工作：

- Add a route-graph service and multimodal pathfinding。
- Normalize all operator stop geometries and connect stop-to-stop transfers。
- Introduce versioned fare rules and effective dates。
- Add recorded upstream fixtures and integration tests。
- Add observability for upstream latency、rate-limit responses and stale-data detection。

## License and third-party services / 授權及第三方服務

This repository is private application code unless the owner publishes a separate license。Third-party services and datasets remain subject to their own terms：

- KMB and Citybus data are provided by their respective official APIs。
- OpenStreetMap data and Nominatim use are subject to OpenStreetMap Foundation policies and attribution requirements。
- Google Maps links and embeds are subject to Google Maps Platform terms。
- Next.js、React、Tailwind CSS、OpenNext、Wrangler and other dependencies retain their own licenses。
